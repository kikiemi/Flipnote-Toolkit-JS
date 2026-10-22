import { ByteWriter } from '../core/byte-writer.ts';
import { concatBytes } from '../core/bytes.ts';
import { crc32 } from '../core/crc32.ts';
import { check, fail } from '../core/errors.ts';
import type { AnimationInfo, DecodedAnimation, IndexedImage, RgbaImage } from '../image/image.ts';
import { zlibCompress, type DeflateOptions } from './deflate.ts';
import { zlibDecompress } from './inflate.ts';

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface PngOptions extends DeflateOptions {}

export interface ApngFrame {
  /** Palette indices for the full canvas. */
  pixels: Uint8Array;
  /** Display time in seconds. */
  duration: number;
}

export interface ApngOptions extends DeflateOptions {
  /** 0 loops forever. */
  loopCount?: number;
}

function writeChunk(writer: ByteWriter, type: string, data: Uint8Array): void {
  writer.writeU32Be(data.length);
  const start = writer.length;
  writer.writeAscii(type);
  writer.writeBytes(data);
  writer.writeU32Be(crc32(writer.subarray(start)));
}

function header(width: number, height: number, bitDepth: number, colorType: number): Uint8Array {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, width, false);
  view.setUint32(4, height, false);
  data[8] = bitDepth;
  data[9] = colorType;
  return data;
}

function paletteBitDepth(colorCount: number): number {
  return colorCount <= 2 ? 1 : colorCount <= 4 ? 2 : colorCount <= 16 ? 4 : 8;
}

/** Packs indices into filter-0 scanlines at the given bit depth. */
function packIndexed(
  pixels: Uint8Array,
  width: number,
  height: number,
  depth: number,
  x0 = 0,
  y0 = 0,
  stride = width,
): Uint8Array {
  const rowBytes = Math.ceil((width * depth) / 8);
  const out = new Uint8Array((rowBytes + 1) * height);
  const perByte = 8 / depth;
  for (let y = 0; y < height; y++) {
    const row = y * (rowBytes + 1) + 1;
    const source = (y + y0) * stride + x0;
    if (depth === 8) {
      out.set(pixels.subarray(source, source + width), row);
      continue;
    }
    for (let x = 0; x < width; x++) {
      const shift = 8 - depth * ((x % perByte) + 1);
      out[row + Math.floor(x / perByte)] |= pixels[source + x] << shift;
    }
  }
  return out;
}

function paletteChunks(writer: ByteWriter, palette: Uint8Array, colorCount: number): void {
  const plte = new Uint8Array(colorCount * 3);
  const trns = new Uint8Array(colorCount);
  let lastTransparent = -1;
  for (let i = 0; i < colorCount; i++) {
    plte.set(palette.subarray(i * 4, i * 4 + 3), i * 3);
    trns[i] = palette[i * 4 + 3];
    if (trns[i] !== 255) lastTransparent = i;
  }
  writeChunk(writer, 'PLTE', plte);
  if (lastTransparent >= 0) writeChunk(writer, 'tRNS', trns.subarray(0, lastTransparent + 1));
}

/** Filters RGBA rows, choosing per row the filter with the smallest absolute sum. */
function filterRgba(data: Uint8Array, width: number, height: number): Uint8Array {
  const stride = width * 4;
  const out = new Uint8Array((stride + 1) * height);
  const candidate = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const row = data.subarray(y * stride, (y + 1) * stride);
    const above = y > 0 ? data.subarray((y - 1) * stride, y * stride) : null;
    let bestFilter = 0;
    let bestScore = Infinity;
    for (let filter = 0; filter < 5; filter++) {
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? row[i - 4] : 0;
        const b = above ? above[i] : 0;
        const c = above && i >= 4 ? above[i - 4] : 0;
        let predicted = 0;
        if (filter === 1) predicted = a;
        else if (filter === 2) predicted = b;
        else if (filter === 3) predicted = (a + b) >> 1;
        else if (filter === 4) predicted = paeth(a, b, c);
        const value = (row[i] - predicted) & 0xff;
        candidate[i] = value;
        score += value < 128 ? value : 256 - value;
      }
      if (score < bestScore) {
        bestScore = score;
        bestFilter = filter;
        out[y * (stride + 1)] = filter;
        out.set(candidate, y * (stride + 1) + 1);
      }
    }
    out[y * (stride + 1)] = bestFilter;
  }
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function isIndexed(image: RgbaImage | IndexedImage): image is IndexedImage {
  return (image as IndexedImage).pixels !== undefined;
}

/** Encodes an indexed (palette) or RGBA image as PNG. */
export function encodePng(image: RgbaImage | IndexedImage, options: PngOptions = {}): Uint8Array {
  const writer = new ByteWriter(1024);
  writer.writeBytes(SIGNATURE);
  if (isIndexed(image)) {
    const colorCount = image.palette.length / 4;
    check(
      colorCount >= 1 && colorCount <= 256,
      'INVALID_ARGUMENT',
      'PNG palettes need 1-256 colors',
    );
    const depth = paletteBitDepth(colorCount);
    writeChunk(writer, 'IHDR', header(image.width, image.height, depth, 3));
    paletteChunks(writer, image.palette, colorCount);
    writeChunk(
      writer,
      'IDAT',
      zlibCompress(packIndexed(image.pixels, image.width, image.height, depth), options),
    );
  } else {
    check(
      image.data.length === image.width * image.height * 4,
      'INVALID_ARGUMENT',
      'RGBA data size does not match',
    );
    writeChunk(writer, 'IHDR', header(image.width, image.height, 8, 6));
    writeChunk(
      writer,
      'IDAT',
      zlibCompress(filterRgba(image.data, image.width, image.height), options),
    );
  }
  writeChunk(writer, 'IEND', new Uint8Array(0));
  return writer.toBytes();
}

function changedBounds(
  current: Uint8Array,
  previous: Uint8Array,
  width: number,
  height: number,
): [number, number, number, number] | null {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (current[row + x] !== previous[row + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        y0 = Math.min(y0, y);
        y1 = y;
      }
    }
  }
  return x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

/** Encodes an animated PNG; each frame stores only the rectangle that changed. */
export function encodeApng(
  width: number,
  height: number,
  palette: Uint8Array,
  frames: Iterable<ApngFrame>,
  options: ApngOptions = {},
): Uint8Array {
  const colorCount = palette.length / 4;
  check(
    colorCount >= 1 && colorCount <= 256,
    'INVALID_ARGUMENT',
    'APNG palettes need 1-256 colors',
  );
  const depth = paletteBitDepth(colorCount);
  const parts: { rect: [number, number, number, number]; data: Uint8Array; duration: number }[] =
    [];
  let previous: Uint8Array | null = null;
  for (const frame of frames) {
    check(
      frame.pixels.length === width * height,
      'INVALID_ARGUMENT',
      'APNG frame size does not match',
    );
    const rect = previous
      ? changedBounds(frame.pixels, previous, width, height)
      : ([0, 0, width, height] as [number, number, number, number]);
    if (!rect) {
      parts[parts.length - 1].duration += frame.duration;
      continue;
    }
    const [x, y, w, h] = rect;
    parts.push({
      rect,
      data: zlibCompress(packIndexed(frame.pixels, w, h, depth, x, y, width), options),
      duration: frame.duration,
    });
    previous = frame.pixels.slice();
  }
  check(parts.length > 0, 'INVALID_ARGUMENT', 'APNG needs at least one frame');
  const body = new ByteWriter(1 << 16);
  let sequence = 0;
  parts.forEach((part, index) => {
    const [x, y, w, h] = part.rect;
    const control = new Uint8Array(26);
    const view = new DataView(control.buffer);
    view.setUint32(0, sequence++, false);
    view.setUint32(4, w, false);
    view.setUint32(8, h, false);
    view.setUint32(12, x, false);
    view.setUint32(16, y, false);
    view.setUint16(20, Math.min(65535, Math.max(1, Math.round(part.duration * 1000))), false);
    view.setUint16(22, 1000, false);
    writeChunk(body, 'fcTL', control);
    if (index === 0) {
      writeChunk(body, 'IDAT', part.data);
      return;
    }
    const chunk = new Uint8Array(part.data.length + 4);
    new DataView(chunk.buffer).setUint32(0, sequence++, false);
    chunk.set(part.data, 4);
    writeChunk(body, 'fdAT', chunk);
  });
  const frameCount = parts.length;
  const writer = new ByteWriter(body.length + 1024);
  writer.writeBytes(SIGNATURE);
  writeChunk(writer, 'IHDR', header(width, height, depth, 3));
  const animation = new Uint8Array(8);
  new DataView(animation.buffer).setUint32(0, frameCount, false);
  new DataView(animation.buffer).setUint32(4, options.loopCount ?? 0, false);
  writeChunk(writer, 'acTL', animation);
  paletteChunks(writer, palette, colorCount);
  writer.writeBytes(body.subarray(0));
  writeChunk(writer, 'IEND', new Uint8Array(0));
  return writer.toBytes();
}

const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
];

/** Header values shared by every frame of a PNG or APNG. */
interface PngHeader {
  width: number;
  height: number;
  depth: number;
  colorType: number;
  interlace: number;
  palette: Uint8Array;
  transparency: Uint8Array | null;
}

interface ApngFrameControl {
  width: number;
  height: number;
  x: number;
  y: number;
  duration: number;
  disposeOp: number;
  blendOp: number;
  parts: Uint8Array[];
}

interface PngStructure {
  header: PngHeader;
  /** Default image data (IDAT). */
  image: Uint8Array[];
  /** Animation frames; empty for still images. */
  frames: ApngFrameControl[];
  loopCount: number | null;
}

function parsePng(bytes: Uint8Array): PngStructure {
  check(
    bytes.length > 8 && SIGNATURE.every((value, i) => bytes[i] === value),
    'INVALID_FORMAT',
    'Not a PNG file',
  );
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header: PngHeader = {
    width: 0,
    height: 0,
    depth: 0,
    colorType: 0,
    interlace: 0,
    palette: new Uint8Array(0),
    transparency: null,
  };
  const image: Uint8Array[] = [];
  const frames: ApngFrameControl[] = [];
  let isImageFirstFrame = false;
  let loopCount: number | null = null;
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset, false);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    check(offset + 12 + length <= bytes.length, 'CORRUPT_DATA', `PNG ${type} chunk is truncated`);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    const at = (i: number) => view.getUint32(offset + 8 + i, false);
    if (type === 'IHDR') {
      header.width = at(0);
      header.height = at(4);
      header.depth = data[8];
      header.colorType = data[9];
      header.interlace = data[12];
    } else if (type === 'PLTE') {
      header.palette = data;
    } else if (type === 'tRNS') {
      header.transparency = data;
    } else if (type === 'acTL') {
      loopCount = at(4);
    } else if (type === 'fcTL' && length >= 26) {
      const numerator = view.getUint16(offset + 28, false);
      const denominator = view.getUint16(offset + 30, false) || 100;
      frames.push({
        width: at(4),
        height: at(8),
        x: at(12),
        y: at(16),
        duration: numerator / denominator,
        disposeOp: data[24],
        blendOp: data[25],
        parts: [],
      });
      if (image.length === 0) isImageFirstFrame = true;
    } else if (type === 'IDAT') {
      image.push(data);
      if (isImageFirstFrame && frames.length === 1) frames[0].parts.push(data);
    } else if (type === 'fdAT' && frames.length > 0) {
      frames[frames.length - 1].parts.push(data.subarray(4));
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  check(
    header.width > 0 && header.height > 0 && image.length > 0,
    'CORRUPT_DATA',
    'PNG has no image data',
  );
  const channels = [1, 0, 3, 1, 2, 0, 4][header.colorType];
  check(
    channels > 0 && [1, 2, 4, 8, 16].includes(header.depth),
    'UNSUPPORTED',
    'Unsupported PNG color type or bit depth',
  );
  return { header, image, frames: frames.filter((frame) => frame.parts.length > 0), loopCount };
}

/** Decodes zlib image data of a `width`x`height` region to RGBA. */
function decodePixels(
  header: PngHeader,
  parts: Uint8Array[],
  width: number,
  height: number,
): Uint8Array {
  const { depth, colorType, palette, transparency } = header;
  const channels = [1, 0, 3, 1, 2, 0, 4][colorType];
  const raw = zlibDecompress(parts.length === 1 ? parts[0] : concatBytes(parts));
  const out = new Uint8Array(width * height * 4);
  const bitsPerPixel = channels * depth;
  const bytesPerPixel = Math.max(1, bitsPerPixel >> 3);
  let cursor = 0;
  const passes = header.interlace ? ADAM7 : [[0, 0, 1, 1]];
  for (const [px, py, sx, sy] of passes) {
    const passWidth = Math.ceil((width - px) / sx);
    const passHeight = Math.ceil((height - py) / sy);
    if (passWidth <= 0 || passHeight <= 0) continue;
    const rowBytes = Math.ceil((passWidth * bitsPerPixel) / 8);
    let previous = new Uint8Array(rowBytes);
    for (let y = 0; y < passHeight; y++) {
      check(cursor + rowBytes + 1 <= raw.length, 'CORRUPT_DATA', 'PNG image data is truncated');
      const filter = raw[cursor];
      const row = raw.slice(cursor + 1, cursor + 1 + rowBytes);
      cursor += rowBytes + 1;
      unfilter(row, previous, filter, bytesPerPixel);
      for (let x = 0; x < passWidth; x++) {
        const target = ((py + y * sy) * width + px + x * sx) * 4;
        writePixel(out, target, row, x, depth, colorType, palette, transparency);
      }
      previous = row;
    }
  }
  return out;
}

/** Decodes a PNG (any standard color type and bit depth, interlaced or not) to RGBA. */
export function decodePng(bytes: Uint8Array): RgbaImage {
  const { header, image } = parsePng(bytes);
  const { width, height } = header;
  return { width, height, data: decodePixels(header, image, width, height) };
}

/** Frame count, timing and size of a PNG or APNG without decoding pixels. */
export function readPngInfo(bytes: Uint8Array): AnimationInfo {
  const { header, frames, loopCount } = parsePng(bytes);
  const durations = frames.length > 0 ? frames.map((frame) => frame.duration) : [0];
  return { width: header.width, height: header.height, durations, loopCount };
}

function composite(canvas: RgbaImage, pixels: Uint8Array, frame: ApngFrameControl): void {
  const target = canvas.data;
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const s = (y * frame.width + x) * 4;
      const d = ((frame.y + y) * canvas.width + frame.x + x) * 4;
      const alpha = pixels[s + 3];
      if (frame.blendOp === 0 || alpha === 255) {
        target[d] = pixels[s];
        target[d + 1] = pixels[s + 1];
        target[d + 2] = pixels[s + 2];
        target[d + 3] = alpha;
        continue;
      }
      if (alpha === 0) continue;
      const below = target[d + 3] * (255 - alpha);
      const total = alpha * 255 + below;
      for (let c = 0; c < 3; c++) {
        target[d + c] = Math.round((pixels[s + c] * alpha * 255 + target[d + c] * below) / total);
      }
      target[d + 3] = Math.round(total / 255);
    }
  }
}

/**
 * Yields every APNG frame composited onto the full canvas (a still PNG yields one frame).
 * The yielded image is reused; copy it to keep it past the next iteration.
 */
export function* decodeApngFrames(bytes: Uint8Array): Generator<RgbaImage> {
  const { header, image, frames } = parsePng(bytes);
  const { width, height } = header;
  const canvas: RgbaImage = { width, height, data: new Uint8Array(width * height * 4) };
  if (frames.length === 0) {
    canvas.data.set(decodePixels(header, image, width, height));
    yield canvas;
    return;
  }
  for (const frame of frames) {
    check(
      frame.x + frame.width <= width && frame.y + frame.height <= height,
      'CORRUPT_DATA',
      'APNG frame lies outside the canvas',
    );
    const pixels = decodePixels(header, frame.parts, frame.width, frame.height);
    const saved = frame.disposeOp === 2 ? canvas.data.slice() : null;
    composite(canvas, pixels, frame);
    yield canvas;
    if (frame.disposeOp === 1) {
      for (let y = frame.y; y < frame.y + frame.height; y++) {
        canvas.data.fill(0, (y * width + frame.x) * 4, (y * width + frame.x + frame.width) * 4);
      }
    } else if (saved) {
      canvas.data.set(saved);
    }
  }
}

/** Decodes every frame of an APNG (or the single image of a PNG). */
export function decodeApng(bytes: Uint8Array): DecodedAnimation {
  const info = readPngInfo(bytes);
  const frames: RgbaImage[] = [];
  for (const frame of decodeApngFrames(bytes)) frames.push({ ...frame, data: frame.data.slice() });
  return { ...info, frames };
}

function unfilter(row: Uint8Array, previous: Uint8Array, filter: number, bpp: number): void {
  for (let i = 0; i < row.length; i++) {
    const a = i >= bpp ? row[i - bpp] : 0;
    const b = previous[i];
    const c = i >= bpp ? previous[i - bpp] : 0;
    if (filter === 1) row[i] += a;
    else if (filter === 2) row[i] += b;
    else if (filter === 3) row[i] += (a + b) >> 1;
    else if (filter === 4) row[i] += paeth(a, b, c);
    else if (filter !== 0) fail('CORRUPT_DATA', 'Invalid PNG filter');
  }
}

function sampleAt(row: Uint8Array, index: number, depth: number): number {
  if (depth === 8) return row[index];
  if (depth === 16) return Math.round(((row[index * 2] << 8) | row[index * 2 + 1]) / 257);
  const bit = index * depth;
  return (row[bit >> 3] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
}

function writePixel(
  out: Uint8Array,
  target: number,
  row: Uint8Array,
  x: number,
  depth: number,
  colorType: number,
  palette: Uint8Array,
  transparency: Uint8Array | null,
): void {
  const scale = depth < 8 ? 255 / ((1 << depth) - 1) : 1;
  if (colorType === 3) {
    const index = sampleAt(row, x, depth);
    out[target] = palette[index * 3];
    out[target + 1] = palette[index * 3 + 1];
    out[target + 2] = palette[index * 3 + 2];
    out[target + 3] = transparency && index < transparency.length ? transparency[index] : 255;
    return;
  }
  const channels = [1, 0, 3, 1, 2, 0, 4][colorType];
  const values = [0, 0, 0, 255];
  for (let c = 0; c < channels; c++) {
    values[c] = Math.round(sampleAt(row, x * channels + c, depth) * scale);
  }
  if (colorType === 0 || colorType === 4) {
    const alpha = colorType === 4 ? values[1] : 255;
    values[1] = values[2] = values[0];
    values[3] = alpha;
  }
  if (
    transparency &&
    colorType === 0 &&
    depth <= 8 &&
    sampleAt(row, x, depth) === ((transparency[0] << 8) | transparency[1])
  ) {
    values[3] = 0;
  }
  if (transparency && colorType === 2 && depth === 8) {
    const t = new DataView(transparency.buffer, transparency.byteOffset);
    if (
      values[0] === t.getUint16(0) &&
      values[1] === t.getUint16(2) &&
      values[2] === t.getUint16(4)
    ) {
      values[3] = 0;
    }
  }
  out.set(values, target);
}
