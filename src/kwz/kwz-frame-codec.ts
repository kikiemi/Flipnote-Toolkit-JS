import { LsbBitWriter } from '../core/bit-writer.ts';
import { toWords, writeAligned } from '../core/bytes.ts';
import { check } from '../core/errors.ts';
import {
  KWZ_EMPTY_AUTHOR_ID,
  KWZ_HEIGHT,
  KWZ_LAYER_SIZE,
  KWZ_WIDTH,
  type KwzFile,
  type KwzFrame,
  type KwzFrameInfo,
  type KwzFrameRecord,
} from './kwz-types.ts';

const LINE_COUNT = 6561;
const ROW_WORDS = KWZ_WIDTH / 4;
const TILE_COUNT = (KWZ_WIDTH / 8) * (KWZ_HEIGHT / 8);
const MAX_SKIP = 32;

/** Line table indices of frequently used lines. */
const KWZ_COMMON_LINES = new Uint16Array([
  0x0000, 0x0cd0, 0x19a0, 0x02d9, 0x088b, 0x0051, 0x00f3, 0x0009, 0x001b, 0x0001, 0x0003, 0x05b2,
  0x1116, 0x00a2, 0x01e6, 0x0012, 0x0036, 0x0002, 0x0006, 0x0b64, 0x08dc, 0x0144, 0x00fc, 0x0024,
  0x001c, 0x0004, 0x0334, 0x099c, 0x0668, 0x1338, 0x1004, 0x166c,
]);

/** Pixels of every line as two 32-bit words (8 pixel bytes, layout-agnostic). */
const LINE_PIXELS = new Uint32Array(LINE_COUNT * 2);
/** Line index of each line rotated one pixel to the left. */
const KWZ_SHIFTED_LINES = new Uint16Array(LINE_COUNT);
const KWZ_COMMON_SHIFTED_LINES = new Uint16Array(32);
/** Position of a line in KWZ_COMMON_LINES, or -1. */
const COMMON_POSITION = new Int8Array(LINE_COUNT).fill(-1);
/** Word offset of the top-left corner of each 8x8 tile in stream order. */
const TILE_WORDS = new Uint32Array(TILE_COUNT);

function lineIndex(p: ArrayLike<number>, o: number): number {
  return (
    p[o + 1] * 2187 +
    p[o] * 729 +
    p[o + 3] * 243 +
    p[o + 2] * 81 +
    p[o + 5] * 27 +
    p[o + 4] * 9 +
    p[o + 7] * 3 +
    p[o + 6]
  );
}

function initTables(): void {
  const bytes = new Uint8Array(LINE_PIXELS.buffer);
  const pixels = new Uint8Array(8);
  for (let index = 0; index < LINE_COUNT; index++) {
    const d = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let k = 7, v = index; k >= 0; k--, v = Math.floor(v / 3)) d[k] = v % 3;
    const line = [d[1], d[0], d[3], d[2], d[5], d[4], d[7], d[6]];
    bytes.set(line, index * 8);
    for (let k = 0; k < 8; k++) pixels[k] = line[(k + 1) & 7];
    KWZ_SHIFTED_LINES[index] = lineIndex(pixels, 0);
  }
  for (let i = 0; i < 32; i++) {
    COMMON_POSITION[KWZ_COMMON_LINES[i]] = i;
    KWZ_COMMON_SHIFTED_LINES[i] = KWZ_SHIFTED_LINES[KWZ_COMMON_LINES[i]];
  }
  let t = 0;
  for (let ly = 0; ly < KWZ_HEIGHT; ly += 128) {
    for (let lx = 0; lx < KWZ_WIDTH; lx += 128) {
      for (let y = ly; y < Math.min(ly + 128, KWZ_HEIGHT); y += 8) {
        for (let x = lx; x < Math.min(lx + 128, KWZ_WIDTH); x += 8) {
          TILE_WORDS[t++] = (y * KWZ_WIDTH + x) >> 2;
        }
      }
    }
  }
}

initTables();

/** Line patterns for tile type 7, as bitmasks of rows that use line B. */
const PATTERN_MASKS = [0b10101010, 0b00100100, 0b10010010, 0b10110110];

/** Bit reader over little-endian 16-bit words; reading past the end yields zeros. */
class TileReader {
  private readonly data: Uint8Array;
  offset = 0;
  private bits = 0;
  private used = 16;
  bitCount = 0;

  constructor(data: Uint8Array) {
    this.data = data;
  }

  read(count: number): number {
    if (this.used + count > 16) {
      const data = this.data;
      const offset = this.offset;
      const word =
        offset + 1 < data.length
          ? data[offset] | (data[offset + 1] << 8)
          : offset < data.length
            ? data[offset]
            : 0;
      this.bits |= word << (16 - this.used);
      this.offset += 2;
      this.used -= 16;
    }
    const value = this.bits & ((1 << count) - 1);
    this.bits >>>= count;
    this.used += count;
    this.bitCount += count;
    return value;
  }
}

/**
 * Decodes one compressed layer on top of `layer` (unchanged tiles are skipped).
 * Truncated data reads as empty tiles like the app does, or, when `isTolerant`,
 * leaves the remaining tiles unchanged. Returns false when the data ran out.
 */
export function decodeKwzLayer(data: Uint8Array, layer: Uint8Array, isTolerant = false): boolean {
  check(
    layer.length === KWZ_LAYER_SIZE,
    'INVALID_ARGUMENT',
    `KWZ layers must have ${KWZ_LAYER_SIZE} pixels`,
  );
  if (data.length === 0) return true;
  let isComplete = true;
  writeAligned(layer, (aligned) => {
    const words = new Uint32Array(aligned.buffer, aligned.byteOffset, KWZ_LAYER_SIZE / 4);
    isComplete = decodeTiles(data, words, isTolerant);
  });
  return isComplete;
}

function decodeTiles(data: Uint8Array, words: Uint32Array, isTolerant: boolean): boolean {
  const reader = new TileReader(data);
  let skip = 0;
  for (let t = 0; t < TILE_COUNT; t++) {
    if (skip) {
      skip--;
      continue;
    }
    if (isTolerant && reader.offset > data.length) return false;
    const w = TILE_WORDS[t];
    const type = reader.read(3);
    let a = 0;
    let b = 0;
    let mask = 0;
    switch (type) {
      case 0:
        a = b = KWZ_COMMON_LINES[reader.read(5)];
        break;
      case 1:
        a = b = reader.read(13);
        break;
      case 2: {
        const index = reader.read(5);
        a = KWZ_COMMON_LINES[index];
        b = KWZ_COMMON_SHIFTED_LINES[index];
        mask = 0b10101010;
        break;
      }
      case 3:
        a = reader.read(13);
        b = KWZ_SHIFTED_LINES[a];
        mask = 0b10101010;
        break;
      case 4: {
        const flags = reader.read(8);
        for (let row = 0; row < 8; row++) {
          const line = (flags >> row) & 1 ? KWZ_COMMON_LINES[reader.read(5)] : reader.read(13);
          const target = w + row * ROW_WORDS;
          words[target] = LINE_PIXELS[line * 2];
          words[target + 1] = LINE_PIXELS[line * 2 + 1];
        }
        continue;
      }
      case 5:
        skip = reader.read(5);
        continue;
      case 7: {
        let pattern = reader.read(2);
        if (reader.read(1)) {
          a = KWZ_COMMON_LINES[reader.read(5)];
          b = KWZ_COMMON_LINES[reader.read(5)];
          pattern = (pattern + 1) & 3;
        } else {
          a = reader.read(13);
          b = reader.read(13);
        }
        mask = PATTERN_MASKS[pattern];
        break;
      }
      default:
        continue;
    }
    if (a >= LINE_COUNT) a = 0;
    if (b >= LINE_COUNT) b = 0;
    for (let row = 0; row < 8; row++) {
      const line = (mask >> row) & 1 ? b : a;
      const target = w + row * ROW_WORDS;
      words[target] = LINE_PIXELS[line * 2];
      words[target + 1] = LINE_PIXELS[line * 2 + 1];
    }
  }
  return reader.offset <= data.length;
}

export interface KwzLayerStats {
  /** Tiles per compression type 0-7 (type 5 counts skip instructions). */
  tileTypes: Uint32Array;
  /** Tiles left unchanged from the previous frame. */
  skippedTiles: number;
  /** Bytes the stream needs; more than the data length when truncated. */
  byteLength: number;
}

/** Walks a compressed layer without decoding pixels. */
export function analyzeKwzLayer(data: Uint8Array): KwzLayerStats {
  const tileTypes = new Uint32Array(8);
  let skippedTiles = 0;
  if (data.length === 0) return { tileTypes, skippedTiles: TILE_COUNT, byteLength: 0 };
  const reader = new TileReader(data);
  for (let t = 0; t < TILE_COUNT; t++) {
    const type = reader.read(3);
    tileTypes[type]++;
    if (type === 0 || type === 2) reader.read(5);
    else if (type === 1 || type === 3) reader.read(13);
    else if (type === 4) {
      const flags = reader.read(8);
      for (let row = 0; row < 8; row++) reader.read((flags >> row) & 1 ? 5 : 13);
    } else if (type === 5) {
      const skip = Math.min(reader.read(5), TILE_COUNT - 1 - t);
      skippedTiles += skip + 1;
      t += skip;
    } else if (type === 7) {
      reader.read(2);
      const size = reader.read(1) ? 5 : 13;
      reader.read(size);
      reader.read(size);
    }
  }
  return { tileTypes, skippedTiles, byteLength: Math.ceil(reader.bitCount / 16) * 2 };
}

function isKwzKeyLayer(keyLayers: number, layer: number): boolean {
  return ((keyLayers >> layer) & 1) !== 0;
}

function createLayers(): [Uint8Array, Uint8Array, Uint8Array] {
  return [
    new Uint8Array(KWZ_LAYER_SIZE),
    new Uint8Array(KWZ_LAYER_SIZE),
    new Uint8Array(KWZ_LAYER_SIZE),
  ];
}

export interface KwzDecoderOptions {
  /** Keep tiles from the previous frame where layer data is truncated (for recovery). */
  isTolerant?: boolean;
}

/**
 * Decodes KWZ frames, following each layer's diff chain independently.
 * Returned layers are reused by the next `decode` call; copy them to keep.
 */
export class KwzFrameDecoder {
  private readonly frames: readonly KwzFrameRecord[];
  private readonly layers = createLayers();
  private readonly isTolerant: boolean;
  private decodedIndex = -1;
  /** Layers of the last decoded frame whose data was truncated. */
  truncatedLayers = 0;

  constructor(file: KwzFile | readonly KwzFrameRecord[], options: KwzDecoderOptions = {}) {
    this.frames = 'frames' in file ? file.frames : file;
    this.isTolerant = options.isTolerant ?? false;
  }

  get frameCount(): number {
    return this.frames.length;
  }

  decode(index: number): KwzFrame {
    const frames = this.frames;
    check(
      Number.isInteger(index) && index >= 0 && index < frames.length,
      'INVALID_ARGUMENT',
      `Frame ${index} does not exist`,
    );
    if (index !== this.decodedIndex) {
      const starts = [0, 0, 0];
      for (let layer = 0; layer < 3; layer++) {
        let start = index;
        while (
          start > 0 &&
          start - 1 !== this.decodedIndex &&
          !isKwzKeyLayer(frames[start].keyLayers, layer)
        ) {
          start--;
        }
        if (!(start > 0 && start - 1 === this.decodedIndex)) this.layers[layer].fill(0);
        starts[layer] = start;
      }
      this.decodedIndex = -1;
      this.truncatedLayers = 0;
      for (let i = Math.min(starts[0], starts[1], starts[2]); i <= index; i++) {
        for (let layer = 0; layer < 3; layer++) {
          if (i < starts[layer]) continue;
          const isComplete = decodeKwzLayer(
            frames[i].layerData[layer],
            this.layers[layer],
            this.isTolerant,
          );
          if (!isComplete && i === index) this.truncatedLayers |= 1 << layer;
        }
      }
      this.decodedIndex = index;
    }
    return { ...copyKwzFrameInfo(frames[index]), layers: this.layers };
  }
}

export function copyKwzFrameInfo(frame: KwzFrameInfo): KwzFrameInfo {
  return {
    paper: frame.paper,
    colors: [...frame.colors],
    layerDepths: [...frame.layerDepths],
    soundFlags: frame.soundFlags,
    cameraFlags: frame.cameraFlags,
    authorId: frame.authorId,
  };
}

function isTileEqual(a: Uint32Array, b: Uint32Array, w: number): boolean {
  for (let row = 0; row < 8; row++) {
    const k = w + row * ROW_WORDS;
    if (a[k] !== b[k] || a[k + 1] !== b[k + 1]) return false;
  }
  return true;
}

function commonCost(line: number): number {
  return COMMON_POSITION[line] >= 0 ? 5 : 13;
}

/** Writes the cheapest encoding of one tile given its 8 line indices. */
function writeTile(writer: LsbBitWriter, lines: Uint16Array): void {
  const a = lines[0];
  let isUniform = true;
  for (let row = 1; row < 8; row++) if (lines[row] !== a) isUniform = false;
  if (isUniform) {
    const position = COMMON_POSITION[a];
    if (position >= 0) writer.writeBits(0 | (position << 3), 8);
    else writer.writeBits(1 | (a << 3), 16);
    return;
  }
  let bestCost = 11;
  for (let row = 0; row < 8; row++) bestCost += commonCost(lines[row]);
  let bestType = 4;
  let bestPattern = 0;
  let bestB = 0;
  const shifted = KWZ_SHIFTED_LINES[a];
  let isAlternating = true;
  for (let row = 1; row < 8; row++) {
    if (lines[row] !== (row & 1 ? shifted : a)) isAlternating = false;
  }
  if (isAlternating) {
    const position = COMMON_POSITION[a];
    if (position >= 0 && KWZ_COMMON_SHIFTED_LINES[position] === shifted) {
      writer.writeBits(2 | (position << 3), 8);
      return;
    }
    bestCost = 16;
    bestType = 3;
  }
  for (let pattern = 0; pattern < 4; pattern++) {
    const mask = PATTERN_MASKS[pattern];
    const b = lines[mask & 2 ? 1 : 2];
    let isMatch = true;
    for (let row = 0; row < 8; row++) {
      if (lines[row] !== ((mask >> row) & 1 ? b : a)) isMatch = false;
    }
    if (!isMatch) continue;
    const cost = COMMON_POSITION[a] >= 0 && COMMON_POSITION[b] >= 0 ? 16 : 32;
    if (cost < bestCost) {
      bestCost = cost;
      bestType = 7;
      bestPattern = pattern;
      bestB = b;
    }
  }
  if (bestType === 3) {
    writer.writeBits(3 | (a << 3), 16);
  } else if (bestType === 7) {
    const isCommon = COMMON_POSITION[a] >= 0 && COMMON_POSITION[bestB] >= 0;
    if (isCommon) {
      writer.writeBits(7 | (((bestPattern + 3) & 3) << 3) | (1 << 5), 6);
      writer.writeBits(COMMON_POSITION[a] | (COMMON_POSITION[bestB] << 5), 10);
    } else {
      writer.writeBits(7 | (bestPattern << 3), 6);
      writer.writeBits(a, 13);
      writer.writeBits(bestB, 13);
    }
  } else {
    let flags = 0;
    for (let row = 0; row < 8; row++) if (COMMON_POSITION[lines[row]] >= 0) flags |= 1 << row;
    writer.writeBits(4 | (flags << 3), 11);
    for (let row = 0; row < 8; row++) {
      const position = COMMON_POSITION[lines[row]];
      if (position >= 0) writer.writeBits(position, 5);
      else writer.writeBits(lines[row], 13);
    }
  }
}

function writeSkip(writer: LsbBitWriter, count: number): void {
  writer.writeBits(5 | ((count - 1) << 3), 8);
}

/** Compresses a layer; with `previous`, unchanged tiles are skipped. */
export function encodeKwzLayer(
  layer: Uint8Array,
  previous: Uint8Array | null,
): { data: Uint8Array; isKey: boolean } {
  check(
    layer.length === KWZ_LAYER_SIZE,
    'INVALID_ARGUMENT',
    `KWZ layers must have ${KWZ_LAYER_SIZE} pixels`,
  );
  let maximum = 0;
  for (let i = 0; i < layer.length; i++) if (layer[i] > maximum) maximum = layer[i];
  check(maximum <= 2, 'INVALID_ARGUMENT', 'KWZ layer pixels must be 0, 1 or 2');
  const writer = new LsbBitWriter();
  const words = toWords(layer);
  const previousWords = previous ? toWords(previous) : null;
  const lines = new Uint16Array(8);
  let skip = 0;
  let isKey = true;
  for (let t = 0; t < TILE_COUNT; t++) {
    const w = TILE_WORDS[t];
    if (previousWords && isTileEqual(words, previousWords, w)) {
      isKey = false;
      if (++skip === MAX_SKIP) {
        writeSkip(writer, skip);
        skip = 0;
      }
      continue;
    }
    if (skip) {
      writeSkip(writer, skip);
      skip = 0;
    }
    const origin = w * 4;
    for (let row = 0; row < 8; row++) lines[row] = lineIndex(layer, origin + row * KWZ_WIDTH);
    writeTile(writer, lines);
  }
  if (skip) writeSkip(writer, skip);
  writer.alignTo(2);
  return { data: writer.toBytes(), isKey };
}

export interface KwzEncodedFrame {
  layerData: [Uint8Array, Uint8Array, Uint8Array];
  keyLayers: number;
}

/** Encodes frames in playback order; layers only store tiles that changed. */
export class KwzFrameEncoder {
  private previous: [Uint8Array, Uint8Array, Uint8Array] | null = null;
  private readonly keyFrameInterval: number;
  private sinceKeyFrame = 0;

  /** `keyFrameInterval` makes every Nth frame independent (0 = never forced). */
  constructor(keyFrameInterval = 0) {
    this.keyFrameInterval = keyFrameInterval;
  }

  encode(frame: KwzFrame): KwzEncodedFrame {
    const isKeyDue =
      !this.previous ||
      (this.keyFrameInterval > 0 && this.sinceKeyFrame + 1 >= this.keyFrameInterval);
    let keyLayers = 0;
    const layerData = frame.layers.map((layer, index) => {
      const { data, isKey } = encodeKwzLayer(layer, isKeyDue ? null : this.previous![index]);
      if (isKey) keyLayers |= 1 << index;
      return data;
    }) as KwzEncodedFrame['layerData'];
    this.sinceKeyFrame = keyLayers === 7 ? 0 : this.sinceKeyFrame + 1;
    this.previous = [frame.layers[0].slice(), frame.layers[1].slice(), frame.layers[2].slice()];
    return { layerData, keyLayers };
  }
}

/** Encodes every layer independently of the previous frame. */
export function encodeKwzKeyFrame(frame: KwzFrame): KwzEncodedFrame {
  const layerData = frame.layers.map(
    (layer) => encodeKwzLayer(layer, null).data,
  ) as KwzEncodedFrame['layerData'];
  return { layerData, keyLayers: 7 };
}

export function createKwzFrame(info: Partial<KwzFrameInfo> = {}): KwzFrame {
  return {
    paper: info.paper ?? 0,
    colors: info.colors ?? [1, 2, 1, 5, 1, 4],
    layerDepths: info.layerDepths ?? [0, 0, 0],
    soundFlags: info.soundFlags ?? 0,
    cameraFlags: info.cameraFlags ?? 0,
    authorId: info.authorId ?? KWZ_EMPTY_AUTHOR_ID,
    layers: createLayers(),
  };
}

export function cloneKwzFrame(frame: KwzFrame): KwzFrame {
  return {
    ...copyKwzFrameInfo(frame),
    layers: [frame.layers[0].slice(), frame.layers[1].slice(), frame.layers[2].slice()],
  };
}
