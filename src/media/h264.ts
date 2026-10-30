import { MsbBitWriter } from '../core/bit-writer.ts';
import { check } from '../core/errors.ts';
import {
  CHROMA_DC_COEFF_TOKEN_CODES,
  CHROMA_DC_COEFF_TOKEN_LENGTHS,
  CHROMA_DC_TOTAL_ZEROS_CODES,
  CHROMA_DC_TOTAL_ZEROS_LENGTHS,
  COEFF_TOKEN_CODES,
  COEFF_TOKEN_LENGTHS,
  INTER_CBP_FROM_CODE,
  INTRA_CBP_FROM_CODE,
  RUN_BEFORE_CODES,
  RUN_BEFORE_LENGTHS,
  TOTAL_ZEROS_CODES,
  TOTAL_ZEROS_LENGTHS,
} from './h264-tables.ts';

/** Planar 4:2:0 picture padded to whole macroblocks (strides = padded width, padded width / 2). */
export interface YuvFrame {
  y: Uint8Array;
  u: Uint8Array;
  v: Uint8Array;
}

export interface H264Options {
  /** Quantizer 0-51 (default 20); lower is better quality. */
  qp?: number;
  /** Frames between IDR pictures (default 300). */
  keyFrameInterval?: number;
  /** Signalled color matrix; must match how YUV was produced (default bt601). */
  colorMatrix?: 'bt601' | 'bt709';
}

export interface H264Sample {
  /** One access unit as 4-byte length-prefixed NAL units (MP4 sample format). */
  data: Uint8Array;
  isKey: boolean;
}

const ZIGZAG = new Uint8Array([0, 1, 4, 8, 5, 2, 3, 6, 9, 12, 13, 10, 7, 11, 14, 15]);
const QUANT_SCALE = [
  [13107, 5243, 8066],
  [11916, 4660, 7490],
  [10082, 4194, 6554],
  [9362, 3647, 5825],
  [8192, 3355, 5243],
  [7282, 2893, 4559],
];
const DEQUANT_SCALE = [
  [10, 16, 13],
  [11, 18, 14],
  [13, 20, 16],
  [14, 23, 18],
  [16, 25, 20],
  [18, 29, 23],
];
const CHROMA_QP = [
  29, 30, 31, 32, 32, 33, 34, 34, 35, 35, 36, 36, 37, 37, 37, 38, 38, 38, 39, 39, 39, 39,
];
/** Position class of each raster coefficient: 0 even/even, 1 odd/odd, 2 mixed. */
const COEFFICIENT_CLASS = Uint8Array.from({ length: 16 }, (_, i) =>
  (i >> 2) % 2 === 0 && (i & 3) % 2 === 0 ? 0 : (i >> 2) % 2 === 1 && (i & 3) % 2 === 1 ? 1 : 2,
);
/** Raster (x, y) in 4x4 units of each luma block index. */
const BLOCK_X = new Uint8Array([0, 1, 0, 1, 2, 3, 2, 3, 0, 1, 0, 1, 2, 3, 2, 3]);
const BLOCK_Y = new Uint8Array([0, 0, 1, 1, 0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 3, 3]);
const BLOCK_ORDER = new Int8Array(16);
for (let i = 0; i < 16; i++) BLOCK_ORDER[BLOCK_Y[i] * 4 + BLOCK_X[i]] = i;
const INTRA_CBP_CODE = invert(INTRA_CBP_FROM_CODE);
const INTER_CBP_CODE = invert(INTER_CBP_FROM_CODE);
const MAX_LEVEL = 2047;
const MB_I4X4 = 1;
const MB_I16X16 = 2;
const MB_P16X16 = 3;
const MB_SKIP = 4;

const RESIDUAL_VALUES = new Int32Array(16);
const RESIDUAL_RUNS = new Int32Array(16);
const TRANSFORM_TEMP = new Int32Array(16);

function invert(table: Uint8Array): Uint8Array {
  const out = new Uint8Array(table.length);
  for (let i = 0; i < table.length; i++) out[table[i]] = i;
  return out;
}

function clip(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}

/** Records bits so candidate macroblocks can be measured before one is committed. */
class BitRecorder {
  private values = new Uint32Array(512);
  private lengths = new Uint8Array(512);
  private count = 0;
  bitLength = 0;

  reset(): void {
    this.count = 0;
    this.bitLength = 0;
  }

  writeBits(value: number, length: number): void {
    if (length === 0) return;
    if (this.count === this.values.length) {
      const values = new Uint32Array(this.count * 2);
      const lengths = new Uint8Array(this.count * 2);
      values.set(this.values);
      lengths.set(this.lengths);
      this.values = values;
      this.lengths = lengths;
    }
    this.values[this.count] = value;
    this.lengths[this.count++] = length;
    this.bitLength += length;
  }

  writeUe(value: number): void {
    const code = value + 1;
    const size = 32 - Math.clz32(code);
    this.writeBits(0, size - 1);
    this.writeBits(code, size);
  }

  writeSe(value: number): void {
    this.writeUe(value > 0 ? value * 2 - 1 : -value * 2);
  }

  replay(writer: MsbBitWriter): void {
    for (let i = 0; i < this.count; i++) writer.writeBits(this.values[i], this.lengths[i]);
  }
}

function forward4x4(input: Int32Array, out: Int32Array): void {
  for (let i = 0; i < 16; i += 4) {
    const s0 = input[i] + input[i + 3];
    const s3 = input[i] - input[i + 3];
    const s1 = input[i + 1] + input[i + 2];
    const s2 = input[i + 1] - input[i + 2];
    out[i] = s0 + s1;
    out[i + 2] = s0 - s1;
    out[i + 1] = 2 * s3 + s2;
    out[i + 3] = s3 - 2 * s2;
  }
  for (let i = 0; i < 4; i++) {
    const s0 = out[i] + out[12 + i];
    const s3 = out[i] - out[12 + i];
    const s1 = out[4 + i] + out[8 + i];
    const s2 = out[4 + i] - out[8 + i];
    out[i] = s0 + s1;
    out[8 + i] = s0 - s1;
    out[4 + i] = 2 * s3 + s2;
    out[12 + i] = s3 - 2 * s2;
  }
}

/** H.264 8.5.12.2 inverse transform of scaled coefficients into `out` residuals. */
function inverse4x4(coefficients: Int32Array, out: Int32Array): void {
  for (let i = 0; i < 16; i += 4) {
    const e0 = coefficients[i] + coefficients[i + 2];
    const e1 = coefficients[i] - coefficients[i + 2];
    const e2 = (coefficients[i + 1] >> 1) - coefficients[i + 3];
    const e3 = coefficients[i + 1] + (coefficients[i + 3] >> 1);
    out[i] = e0 + e3;
    out[i + 1] = e1 + e2;
    out[i + 2] = e1 - e2;
    out[i + 3] = e0 - e3;
  }
  for (let i = 0; i < 4; i++) {
    const e0 = out[i] + out[8 + i];
    const e1 = out[i] - out[8 + i];
    const e2 = (out[4 + i] >> 1) - out[12 + i];
    const e3 = out[4 + i] + (out[12 + i] >> 1);
    out[i] = (e0 + e3 + 32) >> 6;
    out[4 + i] = (e1 + e2 + 32) >> 6;
    out[8 + i] = (e1 - e2 + 32) >> 6;
    out[12 + i] = (e0 - e3 + 32) >> 6;
  }
}

/** 4x4 Hadamard with the row order of H.264 8.5.10. */
function hadamard4x4(input: Int32Array, out: Int32Array): void {
  const t = TRANSFORM_TEMP;
  for (let i = 0; i < 16; i += 4) {
    const a = input[i] + input[i + 1];
    const b = input[i] - input[i + 1];
    const c = input[i + 2] + input[i + 3];
    const d = input[i + 2] - input[i + 3];
    t[i] = a + c;
    t[i + 1] = a - c;
    t[i + 2] = b - d;
    t[i + 3] = b + d;
  }
  for (let i = 0; i < 4; i++) {
    const a = t[i] + t[4 + i];
    const b = t[i] - t[4 + i];
    const c = t[8 + i] + t[12 + i];
    const d = t[8 + i] - t[12 + i];
    out[i] = a + c;
    out[4 + i] = a - c;
    out[8 + i] = b - d;
    out[12 + i] = b + d;
  }
}

function satd4x4(diff: Int32Array): number {
  const t = TRANSFORM_TEMP;
  for (let i = 0; i < 16; i += 4) {
    const a = diff[i] + diff[i + 1];
    const b = diff[i] - diff[i + 1];
    const c = diff[i + 2] + diff[i + 3];
    const d = diff[i + 2] - diff[i + 3];
    t[i] = a + c;
    t[i + 1] = b + d;
    t[i + 2] = a - c;
    t[i + 3] = b - d;
  }
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const a = t[i] + t[4 + i];
    const b = t[i] - t[4 + i];
    const c = t[8 + i] + t[12 + i];
    const d = t[8 + i] - t[12 + i];
    sum += Math.abs(a + c) + Math.abs(b + d) + Math.abs(a - c) + Math.abs(b - d);
  }
  return sum >> 1;
}

function quantize(value: number, scale: number, shift: number, bias: number): number {
  const level = Math.min(MAX_LEVEL, (Math.abs(value) * scale + bias) >> shift);
  return value < 0 ? -level : level;
}

/** Halves with rounding away from zero. */
function halve(value: number): number {
  const half = (Math.abs(value) + 1) >> 1;
  return value < 0 ? -half : half;
}

/** CAVLC residual_block for `count` levels in scan order; returns TotalCoeff. */
function writeResidual(out: BitRecorder, levels: Int32Array, count: number, nC: number): number {
  let last = count - 1;
  while (last >= 0 && levels[last] === 0) last--;
  let total = 0;
  for (let i = last; i >= 0; i--) {
    if (levels[i] !== 0) {
      RESIDUAL_VALUES[total] = levels[i];
      RESIDUAL_RUNS[total++] = 0;
    } else {
      RESIDUAL_RUNS[total - 1]++;
    }
  }
  let trailingOnes = 0;
  while (
    trailingOnes < total &&
    trailingOnes < 3 &&
    Math.abs(RESIDUAL_VALUES[trailingOnes]) === 1
  ) {
    trailingOnes++;
  }
  const token = total * 4 + trailingOnes;
  if (nC < 0) {
    out.writeBits(CHROMA_DC_COEFF_TOKEN_CODES[token], CHROMA_DC_COEFF_TOKEN_LENGTHS[token]);
  } else {
    const table = nC < 2 ? 0 : nC < 4 ? 1 : nC < 8 ? 2 : 3;
    out.writeBits(COEFF_TOKEN_CODES[table][token], COEFF_TOKEN_LENGTHS[table][token]);
  }
  if (total === 0) return 0;
  for (let i = 0; i < trailingOnes; i++) out.writeBits(RESIDUAL_VALUES[i] < 0 ? 1 : 0, 1);
  let suffixLength = total > 10 && trailingOnes < 3 ? 1 : 0;
  for (let i = trailingOnes; i < total; i++) {
    const level = RESIDUAL_VALUES[i];
    let code = level > 0 ? level * 2 - 2 : -level * 2 - 1;
    if (i === trailingOnes && trailingOnes < 3) code -= 2;
    if (suffixLength === 0) {
      if (code < 14) out.writeBits(1, code + 1);
      else if (code < 30) {
        out.writeBits(1, 15);
        out.writeBits(code - 14, 4);
      } else {
        out.writeBits(1, 16);
        out.writeBits(code - 30, 12);
      }
    } else if (code < 15 << suffixLength) {
      out.writeBits(1, (code >> suffixLength) + 1);
      out.writeBits(code & ((1 << suffixLength) - 1), suffixLength);
    } else {
      out.writeBits(1, 16);
      out.writeBits(code - (15 << suffixLength), 12);
    }
    if (suffixLength === 0) suffixLength = 1;
    if (Math.abs(level) > 3 << (suffixLength - 1) && suffixLength < 6) suffixLength++;
  }
  let zeros = last + 1 - total;
  if (total < count) {
    if (count === 4) {
      out.writeBits(
        CHROMA_DC_TOTAL_ZEROS_CODES[total - 1][zeros],
        CHROMA_DC_TOTAL_ZEROS_LENGTHS[total - 1][zeros],
      );
    } else {
      out.writeBits(TOTAL_ZEROS_CODES[total - 1][zeros], TOTAL_ZEROS_LENGTHS[total - 1][zeros]);
    }
  }
  for (let i = 0; i < total - 1 && zeros > 0; i++) {
    const table = Math.min(zeros, 7) - 1;
    out.writeBits(
      RUN_BEFORE_CODES[table][RESIDUAL_RUNS[i]],
      RUN_BEFORE_LENGTHS[table][RESIDUAL_RUNS[i]],
    );
    zeros -= RESIDUAL_RUNS[i];
  }
  return total;
}

function writeRbspTrailing(writer: MsbBitWriter): void {
  writer.writeBits(1, 1);
  writer.alignWith(0);
}

/** Wraps an RBSP into a NAL unit payload with emulation prevention bytes. */
function toNal(header: number, rbsp: Uint8Array): Uint8Array {
  const out = new Uint8Array(rbsp.length * 2 + 1);
  out[0] = header;
  let p = 1;
  let zeros = 0;
  for (let i = 0; i < rbsp.length; i++) {
    const byte = rbsp[i];
    if (zeros >= 2 && byte <= 3) {
      out[p++] = 3;
      zeros = 0;
    }
    out[p++] = byte;
    zeros = byte === 0 ? zeros + 1 : 0;
  }
  return out.slice(0, p);
}

const LEVELS: [number, number, number][] = [
  [30, 40500, 1620],
  [31, 108000, 3600],
  [32, 216000, 5120],
  [40, 245760, 8192],
  [42, 522240, 8704],
  [50, 589824, 22080],
  [51, 983040, 36864],
  [52, 2073600, 36864],
];

/** Smallest level (3.0 or higher) whose frame size and macroblock rate limits fit. */
function selectH264Level(mbCount: number, frameRate: number): number {
  for (const [level, maxRate, maxSize] of LEVELS) {
    if (mbCount <= maxSize && mbCount * frameRate <= maxRate) return level;
  }
  return 52;
}

interface MacroblockState {
  type: number;
  modes: Int8Array;
  luma: Uint8Array;
  cb: Uint8Array;
  cr: Uint8Array;
}

function createState(): MacroblockState {
  return {
    type: 0,
    modes: new Int8Array(16),
    luma: new Uint8Array(16),
    cb: new Uint8Array(4),
    cr: new Uint8Array(4),
  };
}

function copyState(from: MacroblockState, to: MacroblockState): void {
  to.type = from.type;
  to.modes.set(from.modes);
  to.luma.set(from.luma);
  to.cb.set(from.cb);
  to.cr.set(from.cr);
}

interface Candidate {
  bits: BitRecorder;
  snapshot: Uint8Array;
  state: MacroblockState;
  cost: number;
}

/** Intra 4x4 prediction (8.3.1.2). Edge layout: [L3, L2, L1, L0, TL, T0..T7]. */
function predict4x4(
  mode: number,
  e: Int32Array,
  hasTop: boolean,
  hasLeft: boolean,
  hasTopLeft: boolean,
  out: Uint8Array,
): boolean {
  switch (mode) {
    case 0:
      if (!hasTop) return false;
      for (let i = 0; i < 16; i++) out[i] = e[5 + (i & 3)];
      return true;
    case 1:
      if (!hasLeft) return false;
      for (let i = 0; i < 16; i++) out[i] = e[3 - (i >> 2)];
      return true;
    case 2: {
      let sum = 0;
      if (hasTop) sum += e[5] + e[6] + e[7] + e[8];
      if (hasLeft) sum += e[0] + e[1] + e[2] + e[3];
      out.fill(hasTop && hasLeft ? (sum + 4) >> 3 : hasTop || hasLeft ? (sum + 2) >> 2 : 128);
      return true;
    }
    case 3:
      if (!hasTop) return false;
      for (let i = 0; i < 16; i++) {
        const k = 5 + (i & 3) + (i >> 2);
        out[i] =
          i === 15 ? (e[11] + 3 * e[12] + 2) >> 2 : (e[k] + 2 * e[k + 1] + e[k + 2] + 2) >> 2;
      }
      return true;
    case 4:
      if (!hasTop || !hasLeft || !hasTopLeft) return false;
      for (let i = 0; i < 16; i++) {
        const k = 4 + (i & 3) - (i >> 2);
        out[i] = (e[k - 1] + 2 * e[k] + e[k + 1] + 2) >> 2;
      }
      return true;
    case 5:
      if (!hasTop || !hasLeft || !hasTopLeft) return false;
      for (let i = 0; i < 16; i++) {
        const x = i & 3;
        const y = i >> 2;
        const z = 2 * x - y;
        const k = 5 + x - (y >> 1);
        if (z >= 0 && (z & 1) === 0) out[i] = (e[k - 1] + e[k] + 1) >> 1;
        else if (z > 0) out[i] = (e[k - 2] + 2 * e[k - 1] + e[k] + 2) >> 2;
        else if (z === -1) out[i] = (e[3] + 2 * e[4] + e[5] + 2) >> 2;
        else out[i] = (e[4 - y] + 2 * e[5 - y] + e[6 - y] + 2) >> 2;
      }
      return true;
    case 6:
      if (!hasTop || !hasLeft || !hasTopLeft) return false;
      for (let i = 0; i < 16; i++) {
        const x = i & 3;
        const y = i >> 2;
        const z = 2 * y - x;
        const k = 3 - y + (x >> 1);
        if (z >= 0 && (z & 1) === 0) out[i] = (e[k + 1] + e[k] + 1) >> 1;
        else if (z > 0) out[i] = (e[k + 2] + 2 * e[k + 1] + e[k] + 2) >> 2;
        else if (z === -1) out[i] = (e[3] + 2 * e[4] + e[5] + 2) >> 2;
        else out[i] = (e[4 + x] + 2 * e[3 + x] + e[2 + x] + 2) >> 2;
      }
      return true;
    case 7:
      if (!hasTop) return false;
      for (let i = 0; i < 16; i++) {
        const y = i >> 2;
        const k = 5 + (i & 3) + (y >> 1);
        out[i] = y & 1 ? (e[k] + 2 * e[k + 1] + e[k + 2] + 2) >> 2 : (e[k] + e[k + 1] + 1) >> 1;
      }
      return true;
    default:
      if (!hasLeft) return false;
      for (let i = 0; i < 16; i++) {
        const x = i & 3;
        const y = i >> 2;
        const z = x + 2 * y;
        const k = 3 - y - (x >> 1);
        if (z > 5) out[i] = e[0];
        else if (z === 5) out[i] = (e[1] + 3 * e[0] + 2) >> 2;
        else if (z & 1) out[i] = (e[k] + 2 * e[k - 1] + e[k - 2] + 2) >> 2;
        else out[i] = (e[k] + e[k - 1] + 1) >> 1;
      }
      return true;
  }
}

/**
 * Baseline-profile H.264 encoder (CAVLC, intra 4x4/16x16, P skip and zero-motion residual, no deblocking).
 * Its reconstruction matches any conforming decoder bit for bit.
 */
export class H264Encoder {
  readonly width: number;
  readonly height: number;
  readonly mbWidth: number;
  readonly mbHeight: number;
  readonly paddedWidth: number;
  readonly paddedHeight: number;
  readonly level: number;
  readonly sps: Uint8Array;
  readonly pps: Uint8Array;
  private readonly qp: number;
  private readonly chromaQp: number;
  private readonly lambda: number;
  private readonly keyFrameInterval: number;
  private recon: YuvFrame;
  private reference: YuvFrame;
  private previousSource: YuvFrame;
  private hasPreviousSource = false;
  private source: YuvFrame;
  private frameNumber = 0;
  private sinceKey = 0;
  private idrCount = 0;
  private isIntraFrame = true;
  private readonly states: MacroblockState[];
  private readonly candidates: Candidate[];
  private readonly diff = new Int32Array(16);
  private readonly coefficients = new Int32Array(16);
  private readonly residual = new Int32Array(16);
  private readonly scan = new Int32Array(16);
  private readonly prediction16 = new Uint8Array(256);
  private readonly prediction4 = new Uint8Array(16);
  private readonly bestPrediction4 = new Uint8Array(16);
  private readonly edge = new Int32Array(13);
  private readonly lumaLevels = new Int32Array(256);
  private readonly lumaDc = new Int32Array(16);
  private readonly lumaDcLevels = new Int32Array(16);
  private readonly lumaDcValues = new Int32Array(16);
  private readonly modeCodes = new Int8Array(16);
  private readonly chromaPredictions = [new Uint8Array(64), new Uint8Array(64)];
  private readonly chromaLevels = [new Int32Array(64), new Int32Array(64)];
  private readonly chromaDc = [new Int32Array(4), new Int32Array(4)];
  private chromaMode = 0;
  private chromaCbp = 0;

  constructor(width: number, height: number, frameRate: number, options: H264Options = {}) {
    check(
      width >= 16 && height >= 16 && width % 2 === 0 && height % 2 === 0,
      'INVALID_ARGUMENT',
      'H.264 frames must be even-sized and at least 16x16',
    );
    this.width = width;
    this.height = height;
    this.mbWidth = Math.ceil(width / 16);
    this.mbHeight = Math.ceil(height / 16);
    this.paddedWidth = this.mbWidth * 16;
    this.paddedHeight = this.mbHeight * 16;
    this.qp = Math.max(0, Math.min(51, Math.round(options.qp ?? 20)));
    this.chromaQp = this.qp < 30 ? this.qp : CHROMA_QP[this.qp - 30];
    this.lambda = 0.85 * 2 ** ((this.qp - 12) / 3);
    this.keyFrameInterval = options.keyFrameInterval ?? 300;
    this.level = selectH264Level(this.mbWidth * this.mbHeight, frameRate);
    this.recon = this.createFrame();
    this.reference = this.createFrame();
    this.previousSource = this.createFrame();
    this.source = this.recon;
    this.states = Array.from({ length: this.mbWidth * this.mbHeight }, createState);
    this.candidates = Array.from({ length: 4 }, () => ({
      bits: new BitRecorder(),
      snapshot: new Uint8Array(384),
      state: createState(),
      cost: 0,
    }));
    this.sps = this.createSps(options.colorMatrix ?? 'bt601');
    this.pps = this.createPps();
  }

  createFrame(): YuvFrame {
    const size = this.paddedWidth * this.paddedHeight;
    return { y: new Uint8Array(size), u: new Uint8Array(size / 4), v: new Uint8Array(size / 4) };
  }

  /** Last reconstructed picture (what decoders will display). */
  get reconstruction(): YuvFrame {
    return this.reference;
  }

  private createSps(matrix: 'bt601' | 'bt709'): Uint8Array {
    const w = new MsbBitWriter();
    w.writeBits(66, 8);
    w.writeBits(0b11000000, 8);
    w.writeBits(this.level, 8);
    w.writeUe(0);
    w.writeUe(12);
    w.writeUe(2);
    w.writeUe(1);
    w.writeBits(0, 1);
    w.writeUe(this.mbWidth - 1);
    w.writeUe(this.mbHeight - 1);
    w.writeBits(1, 1);
    w.writeBits(1, 1);
    const cropX = (this.paddedWidth - this.width) / 2;
    const cropY = (this.paddedHeight - this.height) / 2;
    w.writeBit(cropX > 0 || cropY > 0);
    if (cropX > 0 || cropY > 0) {
      w.writeUe(0);
      w.writeUe(cropX);
      w.writeUe(0);
      w.writeUe(cropY);
    }
    w.writeBits(1, 1);
    w.writeBits(1, 1);
    w.writeBits(1, 8);
    w.writeBits(0, 1);
    w.writeBits(1, 1);
    w.writeBits(5, 3);
    w.writeBits(0, 1);
    w.writeBits(1, 1);
    const code = matrix === 'bt709' ? 1 : 6;
    w.writeBits(code, 8);
    w.writeBits(code, 8);
    w.writeBits(code, 8);
    w.writeBits(0, 5);
    w.writeBits(1, 1);
    w.writeBits(1, 1);
    w.writeUe(2);
    w.writeUe(1);
    w.writeUe(16);
    w.writeUe(16);
    w.writeUe(0);
    w.writeUe(1);
    writeRbspTrailing(w);
    return toNal(0x67, w.toBytes());
  }

  private createPps(): Uint8Array {
    const w = new MsbBitWriter();
    w.writeUe(0);
    w.writeUe(0);
    w.writeBits(0, 2);
    w.writeUe(0);
    w.writeUe(0);
    w.writeUe(0);
    w.writeBits(0, 3);
    w.writeSe(0);
    w.writeSe(0);
    w.writeSe(0);
    w.writeBits(0b100, 3);
    writeRbspTrailing(w);
    return toNal(0x68, w.toBytes());
  }

  /** Encodes one picture; `forceKey` starts a new IDR. */
  encode(frame: YuvFrame, forceKey = false): H264Sample {
    const isKey =
      forceKey ||
      this.frameNumber === 0 ||
      (this.keyFrameInterval > 0 && this.sinceKey >= this.keyFrameInterval);
    if (isKey) {
      this.frameNumber = 0;
      this.sinceKey = 0;
    }
    this.isIntraFrame = isKey;
    this.source = frame;
    for (const state of this.states) state.type = 0;
    const w = new MsbBitWriter();
    w.writeUe(0);
    w.writeUe(isKey ? 7 : 5);
    w.writeUe(0);
    w.writeBits(this.frameNumber & 0xffff, 16);
    if (isKey) w.writeUe(this.idrCount++ & 1);
    else w.writeBits(0, 2);
    w.writeBits(0, isKey ? 2 : 1);
    w.writeSe(this.qp - 26);
    w.writeUe(1);
    let skipRun = 0;
    for (let mby = 0; mby < this.mbHeight; mby++) {
      for (let mbx = 0; mbx < this.mbWidth; mbx++) {
        const chosen = this.encodeMacroblock(mbx, mby);
        if (!chosen) {
          skipRun++;
          continue;
        }
        if (!isKey) w.writeUe(skipRun);
        skipRun = 0;
        chosen.bits.replay(w);
      }
    }
    if (skipRun > 0) w.writeUe(skipRun);
    writeRbspTrailing(w);
    const nal = toNal(isKey ? 0x65 : 0x41, w.toBytes());
    const data = new Uint8Array(nal.length + 4);
    new DataView(data.buffer).setUint32(0, nal.length, false);
    data.set(nal, 4);
    [this.reference, this.recon] = [this.recon, this.reference];
    this.previousSource.y.set(frame.y);
    this.previousSource.u.set(frame.u);
    this.previousSource.v.set(frame.v);
    this.hasPreviousSource = true;
    this.frameNumber = (this.frameNumber + 1) & 0xffff;
    this.sinceKey++;
    return { data, isKey };
  }

  private state(mbx: number, mby: number): MacroblockState | null {
    if (mbx < 0 || mby < 0 || mbx >= this.mbWidth) return null;
    const state = this.states[mby * this.mbWidth + mbx];
    return state.type ? state : null;
  }

  /** True when the macroblock equals `other` in all three planes. */
  private isSameAs(mbx: number, mby: number, other: YuvFrame): boolean {
    const stride = this.paddedWidth;
    const source = this.source;
    for (let y = 0; y < 16; y++) {
      const row = (mby * 16 + y) * stride + mbx * 16;
      for (let x = row; x < row + 16; x++) if (source.y[x] !== other.y[x]) return false;
    }
    const chromaStride = stride / 2;
    for (let y = 0; y < 8; y++) {
      const row = (mby * 8 + y) * chromaStride + mbx * 8;
      for (let x = row; x < row + 8; x++) {
        if (source.u[x] !== other.u[x] || source.v[x] !== other.v[x]) return false;
      }
    }
    return true;
  }

  private markSkip(state: MacroblockState): void {
    state.type = MB_SKIP;
    state.luma.fill(0);
    state.cb.fill(0);
    state.cr.fill(0);
  }

  /** Picks the cheapest mode; returns its candidate, or null for P_Skip. */
  private encodeMacroblock(mbx: number, mby: number): Candidate | null {
    const state = this.states[mby * this.mbWidth + mbx];
    if (
      !this.isIntraFrame &&
      ((this.hasPreviousSource && this.isSameAs(mbx, mby, this.previousSource)) ||
        this.isSameAs(mbx, mby, this.reference))
    ) {
      this.copyReference(mbx, mby);
      this.markSkip(state);
      return null;
    }
    const [skip, inter, intra16, intra4] = this.candidates;
    const evaluated: Candidate[] = [];
    const consider = (candidate: Candidate) => {
      candidate.cost = this.distortion(mbx, mby) + this.lambda * candidate.bits.bitLength;
      this.saveMacroblock(mbx, mby, candidate.snapshot);
      copyState(state, candidate.state);
      evaluated.push(candidate);
    };
    if (!this.isIntraFrame) {
      skip.bits.reset();
      this.copyReference(mbx, mby);
      this.markSkip(state);
      consider(skip);
      inter.bits.reset();
      this.encodeInter(mbx, mby, inter.bits);
      consider(inter);
    }
    this.encodeChroma(mbx, mby, this.chooseChromaMode(mbx, mby), true);
    intra16.bits.reset();
    const isExact = this.encodeIntra16(mbx, mby, intra16.bits);
    consider(intra16);
    if (!isExact) {
      intra4.bits.reset();
      this.encodeIntra4(mbx, mby, intra4.bits);
      consider(intra4);
    }
    let chosen = evaluated[0];
    for (const candidate of evaluated) if (candidate.cost < chosen.cost) chosen = candidate;
    this.restoreMacroblock(mbx, mby, chosen.snapshot);
    copyState(chosen.state, state);
    return chosen === skip ? null : chosen;
  }

  private distortion(mbx: number, mby: number): number {
    let sum = 0;
    const stride = this.paddedWidth;
    const source = this.source;
    const recon = this.recon;
    for (let y = 0; y < 16; y++) {
      const row = (mby * 16 + y) * stride + mbx * 16;
      for (let x = row; x < row + 16; x++) {
        const d = source.y[x] - recon.y[x];
        sum += d * d;
      }
    }
    const chromaStride = stride / 2;
    for (let y = 0; y < 8; y++) {
      const row = (mby * 8 + y) * chromaStride + mbx * 8;
      for (let x = row; x < row + 8; x++) {
        const du = source.u[x] - recon.u[x];
        const dv = source.v[x] - recon.v[x];
        sum += du * du + dv * dv;
      }
    }
    return sum;
  }

  /** Copies the macroblock between a frame and a 384-byte buffer (Y, then U, then V). */
  private transferMacroblock(
    mbx: number,
    mby: number,
    frame: YuvFrame,
    buffer: Uint8Array,
    isSaving: boolean,
  ): void {
    const stride = this.paddedWidth;
    const chromaStride = stride / 2;
    let k = 0;
    for (let y = 0; y < 16; y++) {
      const row = (mby * 16 + y) * stride + mbx * 16;
      for (let x = row; x < row + 16; x++, k++) {
        if (isSaving) buffer[k] = frame.y[x];
        else frame.y[x] = buffer[k];
      }
    }
    for (const plane of [frame.u, frame.v]) {
      for (let y = 0; y < 8; y++) {
        const row = (mby * 8 + y) * chromaStride + mbx * 8;
        for (let x = row; x < row + 8; x++, k++) {
          if (isSaving) buffer[k] = plane[x];
          else plane[x] = buffer[k];
        }
      }
    }
  }

  private saveMacroblock(mbx: number, mby: number, out: Uint8Array): void {
    this.transferMacroblock(mbx, mby, this.recon, out, true);
  }

  private restoreMacroblock(mbx: number, mby: number, data: Uint8Array): void {
    this.transferMacroblock(mbx, mby, this.recon, data, false);
  }

  private copyReference(mbx: number, mby: number): void {
    const stride = this.paddedWidth;
    const chromaStride = stride / 2;
    const { recon, reference } = this;
    for (let y = 0; y < 16; y++) {
      const row = (mby * 16 + y) * stride + mbx * 16;
      for (let x = row; x < row + 16; x++) recon.y[x] = reference.y[x];
    }
    for (let y = 0; y < 8; y++) {
      const row = (mby * 8 + y) * chromaStride + mbx * 8;
      for (let x = row; x < row + 8; x++) {
        recon.u[x] = reference.u[x];
        recon.v[x] = reference.v[x];
      }
    }
  }

  /** nC for a luma block at raster (bx, by) in 4x4 units of the current macroblock. */
  private lumaContext(mbx: number, mby: number, bx: number, by: number): number {
    const self = this.states[mby * this.mbWidth + mbx];
    const left = bx > 0 ? self.luma[by * 4 + bx - 1] : this.state(mbx - 1, mby)?.luma[by * 4 + 3];
    const top = by > 0 ? self.luma[(by - 1) * 4 + bx] : this.state(mbx, mby - 1)?.luma[12 + bx];
    return combineContext(left, top);
  }

  private chromaContext(
    mbx: number,
    mby: number,
    plane: 'cb' | 'cr',
    bx: number,
    by: number,
  ): number {
    const self = this.states[mby * this.mbWidth + mbx];
    const left = bx > 0 ? self[plane][by * 2] : this.state(mbx - 1, mby)?.[plane][by * 2 + 1];
    const top = by > 0 ? self[plane][bx] : this.state(mbx, mby - 1)?.[plane][2 + bx];
    return combineContext(left, top);
  }

  /** Intra 16x16 prediction for `mode` into prediction16; false when neighbors are missing. */
  private predict16(mbx: number, mby: number, mode: number): boolean {
    const stride = this.paddedWidth;
    const plane = this.recon.y;
    const origin = mby * 16 * stride + mbx * 16;
    const hasTop = mby > 0;
    const hasLeft = mbx > 0;
    const p = this.prediction16;
    if (mode === 0) {
      if (!hasTop) return false;
      for (let y = 0; y < 16; y++) {
        p.set(plane.subarray(origin - stride, origin - stride + 16), y * 16);
      }
    } else if (mode === 1) {
      if (!hasLeft) return false;
      for (let y = 0; y < 16; y++) p.fill(plane[origin + y * stride - 1], y * 16, y * 16 + 16);
    } else if (mode === 2) {
      let sum = 0;
      for (let i = 0; i < 16; i++) {
        if (hasTop) sum += plane[origin - stride + i];
        if (hasLeft) sum += plane[origin + i * stride - 1];
      }
      p.fill(hasTop && hasLeft ? (sum + 16) >> 5 : hasTop || hasLeft ? (sum + 8) >> 4 : 128);
    } else {
      if (!hasTop || !hasLeft) return false;
      let h = 0;
      let v = 0;
      for (let i = 0; i < 8; i++) {
        h += (i + 1) * (plane[origin - stride + 8 + i] - plane[origin - stride + 6 - i]);
        v +=
          (i + 1) * (plane[origin + (8 + i) * stride - 1] - plane[origin + (6 - i) * stride - 1]);
      }
      const a = 16 * (plane[origin + 15 * stride - 1] + plane[origin - stride + 15]);
      const b = (5 * h + 32) >> 6;
      const c = (5 * v + 32) >> 6;
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          p[y * 16 + x] = clip((a + b * (x - 7) + c * (y - 7) + 16) >> 5);
        }
      }
    }
    return true;
  }

  /** Loads source minus `prediction` (stride 16) for the 4x4 block at pixel (x, y) of the macroblock. */
  private loadDiff(
    origin: number,
    x: number,
    y: number,
    prediction: Uint8Array,
    predictionStride: number,
    predictionOffset: number,
  ): void {
    const stride = this.paddedWidth;
    const source = this.source.y;
    for (let i = 0; i < 16; i++) {
      const r = i >> 2;
      const c = i & 3;
      this.diff[i] =
        source[origin + (y + r) * stride + x + c] -
        prediction[predictionOffset + r * predictionStride + c];
    }
  }

  /** Encodes as Intra 16x16; returns true when the reconstruction equals the source exactly. */
  private encodeIntra16(mbx: number, mby: number, out: BitRecorder): boolean {
    const state = this.states[mby * this.mbWidth + mbx];
    const stride = this.paddedWidth;
    const origin = mby * 16 * stride + mbx * 16;
    let bestMode = 2;
    let bestCost = Infinity;
    for (let mode = 0; mode < 4 && bestCost > 0; mode++) {
      if (!this.predict16(mbx, mby, mode)) continue;
      let cost = 0;
      for (let block = 0; block < 16 && cost < bestCost; block++) {
        this.loadDiff(
          origin,
          (block & 3) * 4,
          (block >> 2) * 4,
          this.prediction16,
          16,
          (block >> 2) * 64 + (block & 3) * 4,
        );
        cost += satd4x4(this.diff);
      }
      if (cost < bestCost) {
        bestCost = cost;
        bestMode = mode;
      }
    }
    this.predict16(mbx, mby, bestMode);
    const qp = this.qp;
    const shift = 15 + Math.floor(qp / 6);
    const bias = Math.floor((1 << shift) / 3);
    const scale = QUANT_SCALE[qp % 6];
    const levels = this.lumaLevels;
    let hasAc = false;
    for (let block = 0; block < 16; block++) {
      this.loadDiff(
        origin,
        (block & 3) * 4,
        (block >> 2) * 4,
        this.prediction16,
        16,
        (block >> 2) * 64 + (block & 3) * 4,
      );
      forward4x4(this.diff, this.coefficients);
      this.lumaDc[block] = this.coefficients[0];
      levels[block * 16] = 0;
      for (let i = 1; i < 16; i++) {
        const level = quantize(this.coefficients[i], scale[COEFFICIENT_CLASS[i]], shift, bias);
        levels[block * 16 + i] = level;
        if (level) hasAc = true;
      }
    }
    hadamard4x4(this.lumaDc, this.lumaDcLevels);
    for (let i = 0; i < 16; i++) {
      this.lumaDcLevels[i] = quantize(halve(this.lumaDcLevels[i]), scale[0], shift + 1, bias * 2);
    }
    dequantLumaDc(this.lumaDcLevels, qp, this.lumaDcValues);
    const cbpLuma = hasAc ? 15 : 0;
    out.writeUe(
      (this.isIntraFrame ? 0 : 5) + 1 + bestMode + this.chromaCbp * 4 + (cbpLuma ? 12 : 0),
    );
    out.writeUe(this.chromaMode);
    out.writeSe(0);
    state.type = MB_I16X16;
    state.luma.fill(0);
    for (let i = 0; i < 16; i++) this.scan[i] = this.lumaDcLevels[ZIGZAG[i]];
    writeResidual(out, this.scan, 16, this.lumaContext(mbx, mby, 0, 0));
    const dequant = DEQUANT_SCALE[qp % 6];
    const dequantShift = Math.floor(qp / 6);
    let isExact = true;
    for (let index = 0; index < 16; index++) {
      const bx = BLOCK_X[index];
      const by = BLOCK_Y[index];
      const block = by * 4 + bx;
      if (cbpLuma) {
        for (let i = 0; i < 15; i++) this.scan[i] = levels[block * 16 + ZIGZAG[i + 1]];
        state.luma[block] = writeResidual(out, this.scan, 15, this.lumaContext(mbx, mby, bx, by));
      }
      this.coefficients[0] = this.lumaDcValues[block];
      for (let i = 1; i < 16; i++) {
        this.coefficients[i] = cbpLuma
          ? (levels[block * 16 + i] * dequant[COEFFICIENT_CLASS[i]]) << dequantShift
          : 0;
      }
      inverse4x4(this.coefficients, this.residual);
      for (let i = 0; i < 16; i++) {
        const y = by * 4 + (i >> 2);
        const x = bx * 4 + (i & 3);
        const value = clip(this.prediction16[y * 16 + x] + this.residual[i]);
        this.recon.y[origin + y * stride + x] = value;
        if (value !== this.source.y[origin + y * stride + x]) isExact = false;
      }
    }
    this.writeChroma(mbx, mby, out);
    return isExact;
  }

  /** Fills the 4x4 edge [L3..L0, TL, T0..T7] and returns availability bits (1 top, 2 left, 4 top-left). */
  private loadEdge(mbx: number, mby: number, bx: number, by: number): number {
    const stride = this.paddedWidth;
    const x = mbx * 16 + bx * 4;
    const y = mby * 16 + by * 4;
    const plane = this.recon.y;
    const e = this.edge;
    const hasTop = by > 0 || mby > 0;
    const hasLeft = bx > 0 || mbx > 0;
    const hasTopLeft = hasTop && hasLeft;
    const hasTopRight =
      by === 0
        ? mby > 0 && (bx < 3 || mbx < this.mbWidth - 1)
        : bx < 3 && BLOCK_ORDER[(by - 1) * 4 + bx + 1] < BLOCK_ORDER[by * 4 + bx];
    if (hasTop) {
      const row = (y - 1) * stride + x;
      for (let i = 0; i < 4; i++) e[5 + i] = plane[row + i];
      for (let i = 4; i < 8; i++) e[5 + i] = hasTopRight ? plane[row + i] : e[8];
    }
    if (hasLeft) for (let i = 0; i < 4; i++) e[3 - i] = plane[(y + i) * stride + x - 1];
    if (hasTopLeft) e[4] = plane[(y - 1) * stride + x - 1];
    return (hasTop ? 1 : 0) | (hasLeft ? 2 : 0) | (hasTopLeft ? 4 : 0);
  }

  private encodeIntra4(mbx: number, mby: number, out: BitRecorder): void {
    const state = this.states[mby * this.mbWidth + mbx];
    const stride = this.paddedWidth;
    const origin = mby * 16 * stride + mbx * 16;
    const qp = this.qp;
    const shift = 15 + Math.floor(qp / 6);
    const bias = Math.floor((1 << shift) / 3);
    const scale = QUANT_SCALE[qp % 6];
    const levels = this.lumaLevels;
    const leftState = this.state(mbx - 1, mby);
    const topState = this.state(mbx, mby - 1);
    const modeCost = this.lambda * 0.6;
    state.type = MB_I4X4;
    let cbpLuma = 0;
    for (let index = 0; index < 16; index++) {
      const bx = BLOCK_X[index];
      const by = BLOCK_Y[index];
      const flags = this.loadEdge(mbx, mby, bx, by);
      const hasTop = (flags & 1) !== 0;
      const hasLeft = (flags & 2) !== 0;
      const hasTopLeft = (flags & 4) !== 0;
      const leftMode =
        bx > 0
          ? state.modes[by * 4 + bx - 1]
          : leftState
            ? leftState.type === MB_I4X4
              ? leftState.modes[by * 4 + 3]
              : 2
            : -1;
      const topMode =
        by > 0
          ? state.modes[(by - 1) * 4 + bx]
          : topState
            ? topState.type === MB_I4X4
              ? topState.modes[12 + bx]
              : 2
            : -1;
      const predicted = leftMode < 0 || topMode < 0 ? 2 : Math.min(leftMode, topMode);
      let bestMode = 2;
      let bestCost = Infinity;
      for (let k = -1; k < 9 && bestCost > modeCost; k++) {
        const mode = k < 0 ? predicted : k;
        if (
          (k >= 0 && mode === predicted) ||
          !predict4x4(mode, this.edge, hasTop, hasLeft, hasTopLeft, this.prediction4)
        ) {
          continue;
        }
        this.loadDiff(origin, bx * 4, by * 4, this.prediction4, 4, 0);
        const cost = satd4x4(this.diff) + modeCost * (mode === predicted ? 1 : 4);
        if (cost < bestCost) {
          bestCost = cost;
          bestMode = mode;
          this.bestPrediction4.set(this.prediction4);
        }
      }
      state.modes[by * 4 + bx] = bestMode;
      this.modeCodes[index] =
        bestMode === predicted ? -1 : bestMode < predicted ? bestMode : bestMode - 1;
      this.loadDiff(origin, bx * 4, by * 4, this.bestPrediction4, 4, 0);
      forward4x4(this.diff, this.coefficients);
      const block = by * 4 + bx;
      let hasLevels = false;
      for (let i = 0; i < 16; i++) {
        const level = quantize(this.coefficients[i], scale[COEFFICIENT_CLASS[i]], shift, bias);
        levels[block * 16 + i] = level;
        if (level) hasLevels = true;
      }
      if (hasLevels) cbpLuma |= 1 << (index >> 2);
      this.reconstructBlock(block, this.bestPrediction4, origin + by * 4 * stride + bx * 4, qp);
    }
    out.writeUe(this.isIntraFrame ? 0 : 5);
    for (let index = 0; index < 16; index++) {
      const code = this.modeCodes[index];
      if (code < 0) out.writeBits(1, 1);
      else out.writeBits(code, 4);
    }
    out.writeUe(this.chromaMode);
    out.writeUe(INTRA_CBP_CODE[cbpLuma | (this.chromaCbp << 4)]);
    this.writeLumaResidual(mbx, mby, out, cbpLuma);
    this.writeChroma(mbx, mby, out);
  }

  private reconstructBlock(
    block: number,
    prediction: Uint8Array,
    offset: number,
    qp: number,
  ): void {
    const stride = this.paddedWidth;
    const scale = DEQUANT_SCALE[qp % 6];
    const shift = Math.floor(qp / 6);
    const levels = this.lumaLevels;
    for (let i = 0; i < 16; i++) {
      this.coefficients[i] = (levels[block * 16 + i] * scale[COEFFICIENT_CLASS[i]]) << shift;
    }
    inverse4x4(this.coefficients, this.residual);
    for (let i = 0; i < 16; i++) {
      this.recon.y[offset + (i >> 2) * stride + (i & 3)] = clip(prediction[i] + this.residual[i]);
    }
  }

  /** Writes qp delta and 4x4 luma blocks for I4x4 and P16x16 macroblocks. */
  private writeLumaResidual(mbx: number, mby: number, out: BitRecorder, cbpLuma: number): void {
    const state = this.states[mby * this.mbWidth + mbx];
    state.luma.fill(0);
    if (cbpLuma === 0 && this.chromaCbp === 0) return;
    out.writeSe(0);
    const levels = this.lumaLevels;
    for (let index = 0; index < 16; index++) {
      if (!(cbpLuma & (1 << (index >> 2)))) continue;
      const bx = BLOCK_X[index];
      const by = BLOCK_Y[index];
      const block = by * 4 + bx;
      for (let i = 0; i < 16; i++) this.scan[i] = levels[block * 16 + ZIGZAG[i]];
      state.luma[block] = writeResidual(out, this.scan, 16, this.lumaContext(mbx, mby, bx, by));
    }
  }

  private encodeInter(mbx: number, mby: number, out: BitRecorder): void {
    const state = this.states[mby * this.mbWidth + mbx];
    const stride = this.paddedWidth;
    const origin = mby * 16 * stride + mbx * 16;
    const qp = this.qp;
    const shift = 15 + Math.floor(qp / 6);
    const bias = Math.floor((1 << shift) / 6);
    const scale = QUANT_SCALE[qp % 6];
    const levels = this.lumaLevels;
    const prediction = this.prediction4;
    let cbpLuma = 0;
    state.type = MB_P16X16;
    for (let block = 0; block < 16; block++) {
      const offset = origin + (block >> 2) * 4 * stride + (block & 3) * 4;
      for (let i = 0; i < 16; i++) {
        const position = offset + (i >> 2) * stride + (i & 3);
        prediction[i] = this.reference.y[position];
        this.diff[i] = this.source.y[position] - prediction[i];
      }
      forward4x4(this.diff, this.coefficients);
      let hasLevels = false;
      for (let i = 0; i < 16; i++) {
        const level = quantize(this.coefficients[i], scale[COEFFICIENT_CLASS[i]], shift, bias);
        levels[block * 16 + i] = level;
        if (level) hasLevels = true;
      }
      if (hasLevels) cbpLuma |= 1 << (BLOCK_ORDER[block] >> 2);
      this.reconstructBlock(block, prediction, offset, qp);
    }
    this.encodeChroma(mbx, mby, -1, false);
    out.writeUe(0);
    out.writeSe(0);
    out.writeSe(0);
    out.writeUe(INTER_CBP_CODE[cbpLuma | (this.chromaCbp << 4)]);
    this.writeLumaResidual(mbx, mby, out, cbpLuma);
    this.writeChroma(mbx, mby, out);
  }

  private chooseChromaMode(mbx: number, mby: number): number {
    let bestMode = 0;
    let bestCost = Infinity;
    const stride = this.paddedWidth / 2;
    const origin = mby * 8 * stride + mbx * 8;
    for (let mode = 0; mode < 4 && bestCost > 0; mode++) {
      let cost = 0;
      for (let p = 0; p < 2; p++) {
        const plane = p ? 'v' : 'u';
        const prediction = this.chromaPredictions[p];
        if (!this.predictChroma(mbx, mby, mode, this.recon[plane], prediction)) {
          cost = Infinity;
          break;
        }
        const source = this.source[plane];
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            cost += Math.abs(source[origin + y * stride + x] - prediction[y * 8 + x]);
          }
        }
      }
      if (cost < bestCost) {
        bestCost = cost;
        bestMode = mode;
      }
    }
    return bestMode;
  }

  /** Intra chroma prediction (8.3.4) for one 8x8 block. */
  private predictChroma(
    mbx: number,
    mby: number,
    mode: number,
    plane: Uint8Array,
    out: Uint8Array,
  ): boolean {
    const stride = this.paddedWidth / 2;
    const origin = mby * 8 * stride + mbx * 8;
    const hasTop = mby > 0;
    const hasLeft = mbx > 0;
    if (mode === 0) {
      for (let block = 0; block < 4; block++) {
        const ox = (block & 1) * 4;
        const oy = (block >> 1) * 4;
        let top = 0;
        let left = 0;
        for (let i = 0; i < 4; i++) {
          if (hasTop) top += plane[origin - stride + ox + i];
          if (hasLeft) left += plane[origin + (oy + i) * stride - 1];
        }
        let value = 128;
        if (block === 0 || block === 3) {
          if (hasTop && hasLeft) value = (top + left + 4) >> 3;
          else if (hasLeft) value = (left + 2) >> 2;
          else if (hasTop) value = (top + 2) >> 2;
        } else if (block === 1) {
          if (hasTop) value = (top + 2) >> 2;
          else if (hasLeft) value = (left + 2) >> 2;
        } else if (hasLeft) value = (left + 2) >> 2;
        else if (hasTop) value = (top + 2) >> 2;
        for (let y = 0; y < 4; y++) out.fill(value, (oy + y) * 8 + ox, (oy + y) * 8 + ox + 4);
      }
    } else if (mode === 1) {
      if (!hasLeft) return false;
      for (let y = 0; y < 8; y++) out.fill(plane[origin + y * stride - 1], y * 8, y * 8 + 8);
    } else if (mode === 2) {
      if (!hasTop) return false;
      for (let y = 0; y < 8; y++) {
        out.set(plane.subarray(origin - stride, origin - stride + 8), y * 8);
      }
    } else {
      if (!hasTop || !hasLeft) return false;
      let h = 0;
      let v = 0;
      for (let i = 0; i < 4; i++) {
        h += (i + 1) * (plane[origin - stride + 4 + i] - plane[origin - stride + 2 - i]);
        v +=
          (i + 1) * (plane[origin + (4 + i) * stride - 1] - plane[origin + (2 - i) * stride - 1]);
      }
      const a = 16 * (plane[origin + 7 * stride - 1] + plane[origin - stride + 7]);
      const b = (34 * h + 32) >> 6;
      const c = (34 * v + 32) >> 6;
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          out[y * 8 + x] = clip((a + b * (x - 3) + c * (y - 3) + 16) >> 5);
        }
      }
    }
    return true;
  }

  /** Transforms, quantizes and reconstructs both chroma planes; mode -1 predicts from the reference. */
  private encodeChroma(mbx: number, mby: number, mode: number, isIntra: boolean): void {
    const stride = this.paddedWidth / 2;
    const origin = mby * 8 * stride + mbx * 8;
    const qp = this.chromaQp;
    const shift = 15 + Math.floor(qp / 6);
    const bias = Math.floor((1 << shift) / (isIntra ? 3 : 6));
    const scale = QUANT_SCALE[qp % 6];
    const dequant = DEQUANT_SCALE[qp % 6];
    const dequantShift = Math.floor(qp / 6);
    let hasDc = false;
    let hasAc = false;
    this.chromaMode = Math.max(0, mode);
    for (let p = 0; p < 2; p++) {
      const plane = p ? 'v' : 'u';
      const prediction = this.chromaPredictions[p];
      const levels = this.chromaLevels[p];
      const dc = this.chromaDc[p];
      if (mode < 0) {
        for (let y = 0; y < 8; y++) {
          prediction.set(
            this.reference[plane].subarray(origin + y * stride, origin + y * stride + 8),
            y * 8,
          );
        }
      } else {
        this.predictChroma(mbx, mby, mode, this.recon[plane], prediction);
      }
      const source = this.source[plane];
      for (let block = 0; block < 4; block++) {
        const ox = (block & 1) * 4;
        const oy = (block >> 1) * 4;
        for (let i = 0; i < 16; i++) {
          const y = oy + (i >> 2);
          const x = ox + (i & 3);
          this.diff[i] = source[origin + y * stride + x] - prediction[y * 8 + x];
        }
        forward4x4(this.diff, this.coefficients);
        dc[block] = this.coefficients[0];
        levels[block * 16] = 0;
        for (let i = 1; i < 16; i++) {
          const level = quantize(this.coefficients[i], scale[COEFFICIENT_CLASS[i]], shift, bias);
          levels[block * 16 + i] = level;
          if (level) hasAc = true;
        }
      }
      const f0 = dc[0] + dc[1] + dc[2] + dc[3];
      const f1 = dc[0] - dc[1] + dc[2] - dc[3];
      const f2 = dc[0] + dc[1] - dc[2] - dc[3];
      const f3 = dc[0] - dc[1] - dc[2] + dc[3];
      dc[0] = quantize(f0, scale[0], shift + 1, bias * 2);
      dc[1] = quantize(f1, scale[0], shift + 1, bias * 2);
      dc[2] = quantize(f2, scale[0], shift + 1, bias * 2);
      dc[3] = quantize(f3, scale[0], shift + 1, bias * 2);
      if (dc[0] || dc[1] || dc[2] || dc[3]) hasDc = true;
    }
    this.chromaCbp = hasAc ? 2 : hasDc ? 1 : 0;
    for (let p = 0; p < 2; p++) {
      const plane = this.recon[p ? 'v' : 'u'];
      const c = this.chromaDc[p];
      const levels = this.chromaLevels[p];
      const prediction = this.chromaPredictions[p];
      const f = [
        c[0] + c[1] + c[2] + c[3],
        c[0] - c[1] + c[2] - c[3],
        c[0] + c[1] - c[2] - c[3],
        c[0] - c[1] - c[2] + c[3],
      ];
      for (let block = 0; block < 4; block++) {
        const ox = (block & 1) * 4;
        const oy = (block >> 1) * 4;
        this.coefficients[0] = ((f[block] * 16 * dequant[0]) << dequantShift) >> 5;
        for (let i = 1; i < 16; i++) {
          this.coefficients[i] =
            this.chromaCbp === 2
              ? (levels[block * 16 + i] * dequant[COEFFICIENT_CLASS[i]]) << dequantShift
              : 0;
        }
        inverse4x4(this.coefficients, this.residual);
        for (let i = 0; i < 16; i++) {
          const y = oy + (i >> 2);
          const x = ox + (i & 3);
          plane[origin + y * stride + x] = clip(prediction[y * 8 + x] + this.residual[i]);
        }
      }
    }
  }

  private writeChroma(mbx: number, mby: number, out: BitRecorder): void {
    const state = this.states[mby * this.mbWidth + mbx];
    state.cb.fill(0);
    state.cr.fill(0);
    if (this.chromaCbp === 0) return;
    for (let p = 0; p < 2; p++) writeResidual(out, this.chromaDc[p], 4, -1);
    if (this.chromaCbp !== 2) return;
    for (let p = 0; p < 2; p++) {
      const plane = p ? 'cr' : 'cb';
      const levels = this.chromaLevels[p];
      for (let block = 0; block < 4; block++) {
        for (let i = 0; i < 15; i++) this.scan[i] = levels[block * 16 + ZIGZAG[i + 1]];
        state[plane][block] = writeResidual(
          out,
          this.scan,
          15,
          this.chromaContext(mbx, mby, plane, block & 1, block >> 1),
        );
      }
    }
  }
}

function combineContext(left: number | undefined, top: number | undefined): number {
  if (left !== undefined && top !== undefined) return (left + top + 1) >> 1;
  return left ?? top ?? 0;
}

/** Decoder-side Intra16x16 DC scaling (8.5.10). */
function dequantLumaDc(levels: Int32Array, qp: number, out: Int32Array): void {
  hadamard4x4(levels, out);
  const scale = 16 * DEQUANT_SCALE[qp % 6][0];
  const shift = Math.floor(qp / 6);
  for (let i = 0; i < 16; i++) {
    out[i] =
      shift >= 6
        ? (out[i] * scale) << (shift - 6)
        : (out[i] * scale + (1 << (5 - shift))) >> (6 - shift);
  }
}
