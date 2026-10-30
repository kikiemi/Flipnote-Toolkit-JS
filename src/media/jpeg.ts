import { MsbBitWriter } from '../core/bit-writer.ts';
import { ByteWriter } from '../core/byte-writer.ts';
import { concatBytes } from '../core/bytes.ts';
import { check, fail } from '../core/errors.ts';
import { createRgbaImage, type RgbaImage } from '../image/image.ts';
import {
  AC_CHROMA,
  AC_LUMA,
  CHROMA_QUANT,
  DC_CHROMA,
  DC_LUMA,
  LUMA_QUANT,
  ZIGZAG,
  type HuffmanSpec,
} from './jpeg-tables.ts';

export type ChromaSubsampling = '444' | '422' | '420';

export interface JpegOptions {
  /** 1-100 on the IJG scale (default 85, as written by Flipnote Studio 3D). */
  quality?: number;
  subsampling?: ChromaSubsampling;
  /** Write a JFIF APP0 segment (default true). */
  isJfif?: boolean;
}

/** cos((2x + 1) u pi / 16) * C(u) / 2, indexed [u * 8 + x]. */
const DCT_BASIS = new Float64Array(64);
for (let u = 0; u < 8; u++) {
  for (let x = 0; x < 8; x++) {
    DCT_BASIS[u * 8 + x] =
      (u === 0 ? Math.SQRT1_2 : 1) * 0.5 * Math.cos(((2 * x + 1) * u * Math.PI) / 16);
  }
}

function scaleQuantTable(base: Uint8Array, quality: number): Uint8Array {
  const q = Math.min(100, Math.max(1, Math.round(quality)));
  const scale = q < 50 ? 5000 / q : 200 - q * 2;
  return base.map((value) => Math.min(255, Math.max(1, Math.floor((value * scale + 50) / 100))));
}

interface EncodeTable {
  codes: Uint16Array;
  lengths: Uint8Array;
}

function createEncodeTable(spec: HuffmanSpec): EncodeTable {
  const codes = new Uint16Array(256);
  const lengths = new Uint8Array(256);
  let code = 0;
  let k = 0;
  for (let length = 1; length <= 16; length++) {
    for (let i = 0; i < spec.counts[length - 1]; i++) {
      codes[spec.symbols[k]] = code++;
      lengths[spec.symbols[k++]] = length;
    }
    code <<= 1;
  }
  return { codes, lengths };
}

const ENCODE_TABLES = [
  createEncodeTable(DC_LUMA),
  createEncodeTable(AC_LUMA),
  createEncodeTable(DC_CHROMA),
  createEncodeTable(AC_CHROMA),
];

function forwardDct(block: Float64Array, out: Float64Array): void {
  const temp = new Float64Array(64);
  for (let y = 0; y < 8; y++) {
    for (let u = 0; u < 8; u++) {
      let sum = 0;
      for (let x = 0; x < 8; x++) sum += block[y * 8 + x] * DCT_BASIS[u * 8 + x];
      temp[y * 8 + u] = sum;
    }
  }
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      let sum = 0;
      for (let y = 0; y < 8; y++) sum += temp[y * 8 + u] * DCT_BASIS[v * 8 + y];
      out[v * 8 + u] = sum;
    }
  }
}

function inverseDct(coefficients: Float64Array, out: Float64Array): void {
  const temp = new Float64Array(64);
  for (let v = 0; v < 8; v++) {
    for (let x = 0; x < 8; x++) {
      let sum = 0;
      for (let u = 0; u < 8; u++) sum += coefficients[v * 8 + u] * DCT_BASIS[u * 8 + x];
      temp[v * 8 + x] = sum;
    }
  }
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 8; y++) {
      let sum = 0;
      for (let v = 0; v < 8; v++) sum += temp[v * 8 + x] * DCT_BASIS[v * 8 + y];
      out[y * 8 + x] = sum;
    }
  }
}

function magnitudeBits(value: number): number {
  return value === 0 ? 0 : 32 - Math.clz32(Math.abs(value));
}

function encodeBlock(
  writer: MsbBitWriter,
  coefficients: Int32Array,
  previousDc: number,
  dc: EncodeTable,
  ac: EncodeTable,
): number {
  const diff = coefficients[0] - previousDc;
  const size = magnitudeBits(diff);
  writer.writeBits(dc.codes[size], dc.lengths[size]);
  if (size) writer.writeBits(diff < 0 ? diff + (1 << size) - 1 : diff, size);
  let run = 0;
  for (let k = 1; k < 64; k++) {
    const value = coefficients[ZIGZAG[k]];
    if (value === 0) {
      run++;
      continue;
    }
    while (run > 15) {
      writer.writeBits(ac.codes[0xf0], ac.lengths[0xf0]);
      run -= 16;
    }
    const bits = magnitudeBits(value);
    const symbol = (run << 4) | bits;
    writer.writeBits(ac.codes[symbol], ac.lengths[symbol]);
    writer.writeBits(value < 0 ? value + (1 << bits) - 1 : value, bits);
    run = 0;
  }
  if (run > 0) writer.writeBits(ac.codes[0], ac.lengths[0]);
  return coefficients[0];
}

function writeSegment(writer: ByteWriter, marker: number, data: Uint8Array): void {
  writer.writeU16Be(marker);
  writer.writeU16Be(data.length + 2);
  writer.writeBytes(data);
}

function huffmanSegment(spec: HuffmanSpec, tableClass: number, id: number): Uint8Array {
  const out = new Uint8Array(17 + spec.symbols.length);
  out[0] = (tableClass << 4) | id;
  out.set(spec.counts, 1);
  out.set(spec.symbols, 17);
  return out;
}

/** Encodes a baseline JPEG; transparent pixels are composited over white. */
export function encodeJpeg(image: RgbaImage, options: JpegOptions = {}): Uint8Array {
  const quality = options.quality ?? 85;
  const subsampling = options.subsampling ?? '420';
  const hs = subsampling === '444' ? 1 : 2;
  const vs = subsampling === '420' ? 2 : 1;
  const { width, height, data } = image;
  const planes = [
    new Float64Array(width * height),
    new Float64Array(width * height),
    new Float64Array(width * height),
  ];
  for (let i = 0; i < width * height; i++) {
    const alpha = data[i * 4 + 3] / 255;
    const r = data[i * 4] * alpha + 255 * (1 - alpha);
    const g = data[i * 4 + 1] * alpha + 255 * (1 - alpha);
    const b = data[i * 4 + 2] * alpha + 255 * (1 - alpha);
    planes[0][i] = 0.299 * r + 0.587 * g + 0.114 * b;
    planes[1][i] = -0.168736 * r - 0.331264 * g + 0.5 * b + 128;
    planes[2][i] = 0.5 * r - 0.418688 * g - 0.081312 * b + 128;
  }
  const quants = [scaleQuantTable(LUMA_QUANT, quality), scaleQuantTable(CHROMA_QUANT, quality)];
  const writer = new ByteWriter(4096);
  writer.writeU16Be(0xffd8);
  if (options.isJfif ?? true) {
    writeSegment(
      writer,
      0xffe0,
      new Uint8Array([0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    );
  }
  const dqt = new Uint8Array(130);
  for (let t = 0; t < 2; t++) {
    dqt[t * 65] = t;
    for (let k = 0; k < 64; k++) dqt[t * 65 + 1 + k] = quants[t][ZIGZAG[k]];
  }
  writeSegment(writer, 0xffdb, dqt);
  writeSegment(
    writer,
    0xffc0,
    new Uint8Array([
      8,
      height >> 8,
      height & 0xff,
      width >> 8,
      width & 0xff,
      3,
      1,
      (hs << 4) | vs,
      0,
      2,
      0x11,
      1,
      3,
      0x11,
      1,
    ]),
  );
  const dht = [
    huffmanSegment(DC_LUMA, 0, 0),
    huffmanSegment(AC_LUMA, 1, 0),
    huffmanSegment(DC_CHROMA, 0, 1),
    huffmanSegment(AC_CHROMA, 1, 1),
  ];
  writeSegment(writer, 0xffc4, concatBytes(dht));
  writeSegment(writer, 0xffda, new Uint8Array([3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0]));

  const bits = new MsbBitWriter(true);
  const block = new Float64Array(64);
  const transformed = new Float64Array(64);
  const coefficients = new Int32Array(64);
  const previousDc = [0, 0, 0];
  const mcuWidth = 8 * hs;
  const mcuHeight = 8 * vs;
  const sample = (plane: Float64Array, x: number, y: number) =>
    plane[Math.min(height - 1, y) * width + Math.min(width - 1, x)];
  const emit = (component: number, read: (x: number, y: number) => number) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) block[y * 8 + x] = read(x, y) - 128;
    forwardDct(block, transformed);
    const quant = quants[component === 0 ? 0 : 1];
    for (let i = 0; i < 64; i++) coefficients[i] = Math.round(transformed[i] / quant[i]);
    const table = component === 0 ? 0 : 2;
    previousDc[component] = encodeBlock(
      bits,
      coefficients,
      previousDc[component],
      ENCODE_TABLES[table],
      ENCODE_TABLES[table + 1],
    );
  };
  for (let my = 0; my < height; my += mcuHeight) {
    for (let mx = 0; mx < width; mx += mcuWidth) {
      for (let by = 0; by < vs; by++) {
        for (let bx = 0; bx < hs; bx++) {
          emit(0, (x, y) => sample(planes[0], mx + bx * 8 + x, my + by * 8 + y));
        }
      }
      for (let c = 1; c < 3; c++) {
        emit(c, (x, y) => {
          let sum = 0;
          for (let dy = 0; dy < vs; dy++) {
            for (let dx = 0; dx < hs; dx++) {
              sum += sample(planes[c], mx + x * hs + dx, my + y * vs + dy);
            }
          }
          return sum / (hs * vs);
        });
      }
    }
  }
  bits.alignWith(1);
  writer.writeBytes(bits.toBytes());
  writer.writeU16Be(0xffd9);
  return writer.toBytes();
}

interface DecodeTable {
  /** Index by 16-bit peek; value = symbol << 8 | length, 0 when invalid. */
  lookup: Uint16Array;
}

function createDecodeTable(counts: Uint8Array, symbols: Uint8Array): DecodeTable {
  const lookup = new Uint16Array(1 << 16);
  let code = 0;
  let k = 0;
  for (let length = 1; length <= 16; length++) {
    for (let i = 0; i < counts[length - 1]; i++) {
      const start = code << (16 - length);
      lookup.fill((symbols[k++] << 8) | length, start, start + (1 << (16 - length)));
      code++;
    }
    code <<= 1;
  }
  return { lookup };
}

class JpegBitReader {
  private readonly bytes: Uint8Array;
  offset: number;
  private cache = 0;
  private cacheBits = 0;

  constructor(bytes: Uint8Array, offset: number) {
    this.bytes = bytes;
    this.offset = offset;
  }

  private fill(): void {
    while (this.cacheBits <= 24) {
      let byte = 0;
      if (this.offset < this.bytes.length) {
        byte = this.bytes[this.offset];
        if (byte === 0xff) {
          const next = this.bytes[this.offset + 1];
          if (next === 0) this.offset += 2;
          else byte = 0;
        } else {
          this.offset++;
        }
      }
      this.cache = (this.cache | (byte << (24 - this.cacheBits))) >>> 0;
      this.cacheBits += 8;
    }
  }

  readBits(count: number): number {
    if (count === 0) return 0;
    this.fill();
    const value = this.cache >>> (32 - count);
    this.cache = (this.cache << count) >>> 0;
    this.cacheBits -= count;
    return value;
  }

  decode(table: DecodeTable): number {
    this.fill();
    const entry = table.lookup[this.cache >>> 16];
    check(entry !== 0, 'CORRUPT_DATA', 'Invalid JPEG Huffman code');
    const length = entry & 0xff;
    this.cache = (this.cache << length) >>> 0;
    this.cacheBits -= length;
    return entry >> 8;
  }

  receiveExtend(size: number): number {
    const value = this.readBits(size);
    return value < 1 << (size - 1) ? value - (1 << size) + 1 : value;
  }

  /** Skips to the byte after the next RSTn marker. */
  restart(): void {
    this.cache = 0;
    this.cacheBits = 0;
    while (
      this.offset + 1 < this.bytes.length &&
      !(
        this.bytes[this.offset] === 0xff &&
        this.bytes[this.offset + 1] >= 0xd0 &&
        this.bytes[this.offset + 1] <= 0xd7
      )
    ) {
      this.offset++;
    }
    this.offset += 2;
  }
}

interface Component {
  id: number;
  h: number;
  v: number;
  quant: number;
  dc: number;
  ac: number;
  blocksX: number;
  blocksY: number;
  pixels: Uint8Array;
}

/** Decodes a baseline (sequential Huffman) JPEG to RGBA. */
export function decodeJpeg(bytes: Uint8Array): RgbaImage {
  check(
    bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8,
    'INVALID_FORMAT',
    'Not a JPEG file',
  );
  const quants: Uint16Array[] = [];
  const tables: DecodeTable[] = [];
  let components: Component[] = [];
  let width = 0;
  let height = 0;
  let restartInterval = 0;
  let maxH = 1;
  let maxV = 1;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1];
    if (
      marker === 0xd8 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7) ||
      marker === 0xff
    ) {
      offset += marker === 0xff ? 1 : 2;
      continue;
    }
    if (marker === 0xd9) break;
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    const data = bytes.subarray(offset + 4, offset + 2 + length);
    check(offset + 2 + length <= bytes.length, 'CORRUPT_DATA', 'JPEG segment is truncated');
    if (marker === 0xdb) {
      for (let p = 0; p < data.length;) {
        const precision = data[p] >> 4;
        const id = data[p] & 15;
        const table = new Uint16Array(64);
        for (let k = 0; k < 64; k++) {
          table[ZIGZAG[k]] = precision
            ? (data[p + 1 + k * 2] << 8) | data[p + 2 + k * 2]
            : data[p + 1 + k];
        }
        quants[id] = table;
        p += 1 + (precision ? 128 : 64);
      }
    } else if (marker === 0xc4) {
      for (let p = 0; p < data.length;) {
        const counts = data.subarray(p + 1, p + 17);
        const total = counts.reduce((sum, value) => sum + value, 0);
        tables[((data[p] >> 4) & 1) * 4 + (data[p] & 3)] = createDecodeTable(
          counts,
          data.subarray(p + 17, p + 17 + total),
        );
        p += 17 + total;
      }
    } else if (marker === 0xc0 || marker === 0xc1) {
      check(data[0] === 8, 'UNSUPPORTED', 'Only 8-bit JPEG is supported');
      height = (data[1] << 8) | data[2];
      width = (data[3] << 8) | data[4];
      components = [];
      for (let i = 0; i < data[5]; i++) {
        const p = 6 + i * 3;
        components.push({
          id: data[p],
          h: data[p + 1] >> 4,
          v: data[p + 1] & 15,
          quant: data[p + 2],
          dc: 0,
          ac: 0,
          blocksX: 0,
          blocksY: 0,
          pixels: new Uint8Array(0),
        });
      }
      maxH = Math.max(...components.map((c) => c.h));
      maxV = Math.max(...components.map((c) => c.v));
    } else if (
      marker >= 0xc2 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      fail('UNSUPPORTED', 'Progressive and arithmetic JPEG are not supported');
    } else if (marker === 0xdd) {
      restartInterval = (data[0] << 8) | data[1];
    } else if (marker === 0xda) {
      check(width > 0 && components.length > 0, 'CORRUPT_DATA', 'JPEG scan before frame header');
      const scanComponents: Component[] = [];
      for (let i = 0; i < data[0]; i++) {
        const component = components.find((c) => c.id === data[1 + i * 2]);
        check(component, 'CORRUPT_DATA', 'JPEG scan references an unknown component');
        component.dc = data[2 + i * 2] >> 4;
        component.ac = data[2 + i * 2] & 15;
        scanComponents.push(component);
      }
      offset = decodeScan(
        bytes,
        offset + 2 + length,
        scanComponents,
        components,
        width,
        height,
        maxH,
        maxV,
        quants,
        tables,
        restartInterval,
      );
      continue;
    }
    offset += 2 + length;
  }
  check(
    components.length === 1 || components.length === 3,
    'UNSUPPORTED',
    'Only grayscale and YCbCr JPEG are supported',
  );
  const image = createRgbaImage(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const values = components.map(
        (c) =>
          c.pixels[Math.floor((y * c.v) / maxV) * c.blocksX * 8 + Math.floor((x * c.h) / maxH)],
      );
      const o = (y * width + x) * 4;
      if (values.length === 1) {
        image.data[o] = image.data[o + 1] = image.data[o + 2] = values[0];
      } else {
        const [luma, cb, cr] = values;
        image.data[o] = clampByte(luma + 1.402 * (cr - 128));
        image.data[o + 1] = clampByte(luma - 0.344136 * (cb - 128) - 0.714136 * (cr - 128));
        image.data[o + 2] = clampByte(luma + 1.772 * (cb - 128));
      }
      image.data[o + 3] = 255;
    }
  }
  return image;
}

function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
}

function decodeScan(
  bytes: Uint8Array,
  start: number,
  scan: Component[],
  all: Component[],
  width: number,
  height: number,
  maxH: number,
  maxV: number,
  quants: Uint16Array[],
  tables: DecodeTable[],
  restartInterval: number,
): number {
  const mcusX = Math.ceil(width / (8 * maxH));
  const mcusY = Math.ceil(height / (8 * maxV));
  for (const c of all) {
    if (c.pixels.length) continue;
    c.blocksX = mcusX * c.h;
    c.blocksY = mcusY * c.v;
    c.pixels = new Uint8Array(c.blocksX * c.blocksY * 64);
  }
  const reader = new JpegBitReader(bytes, start);
  const coefficients = new Float64Array(64);
  const samples = new Float64Array(64);
  const predictors = new Int32Array(scan.length);
  const isSingle = scan.length === 1;
  const decodeBlock = (c: Component, index: number, bx: number, by: number) => {
    const quant = quants[c.quant];
    const dcTable = tables[c.dc];
    const acTable = tables[4 + c.ac];
    check(quant && dcTable && acTable, 'CORRUPT_DATA', 'JPEG table is missing');
    coefficients.fill(0);
    const size = reader.decode(dcTable);
    predictors[index] += size ? reader.receiveExtend(size) : 0;
    coefficients[0] = predictors[index] * quant[0];
    for (let k = 1; k < 64;) {
      const symbol = reader.decode(acTable);
      const run = symbol >> 4;
      const bits = symbol & 15;
      if (bits === 0) {
        if (run !== 15) break;
        k += 16;
        continue;
      }
      k += run;
      if (k > 63) break;
      coefficients[ZIGZAG[k]] = reader.receiveExtend(bits) * quant[ZIGZAG[k]];
      k++;
    }
    inverseDct(coefficients, samples);
    const stride = c.blocksX * 8;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        c.pixels[(by * 8 + y) * stride + bx * 8 + x] = clampByte(samples[y * 8 + x] + 128);
      }
    }
  };
  const total = isSingle
    ? Math.ceil((width * scan[0].h) / (8 * maxH)) * Math.ceil((height * scan[0].v) / (8 * maxV))
    : mcusX * mcusY;
  for (let n = 0; n < total; n++) {
    if (restartInterval && n > 0 && n % restartInterval === 0) {
      reader.restart();
      predictors.fill(0);
    }
    if (isSingle) {
      const c = scan[0];
      const perRow = Math.ceil((width * c.h) / (8 * maxH));
      decodeBlock(c, 0, n % perRow, Math.floor(n / perRow));
      continue;
    }
    const mx = n % mcusX;
    const my = Math.floor(n / mcusX);
    scan.forEach((c, index) => {
      for (let v = 0; v < c.v; v++) {
        for (let h = 0; h < c.h; h++) decodeBlock(c, index, mx * c.h + h, my * c.v + v);
      }
    });
  }
  let end = reader.offset;
  while (
    end + 1 < bytes.length &&
    !(
      bytes[end] === 0xff &&
      bytes[end + 1] !== 0 &&
      (bytes[end + 1] < 0xd0 || bytes[end + 1] > 0xd7)
    )
  ) {
    end++;
  }
  return end;
}

/** Byte offset just past the last end-of-image marker, ignoring any padding after it. */
export function findJpegEnd(data: Uint8Array): number {
  for (let end = data.length; end >= 2; end--) {
    if (data[end - 2] === 0xff && data[end - 1] === 0xd9) return end;
  }
  return data.length;
}
