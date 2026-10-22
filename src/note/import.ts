import type { Pcm } from '../audio/pcm.ts';
import { check, ignoreWarning, type WarningHandler } from '../core/errors.ts';
import { fitRgba, type FitMode, type ResizeMethod, type RgbaImage } from '../image/image.ts';
import { quantizeImage, type DitherMode } from '../image/quantize.ts';
import { createKwzMeta, encodeKwzTracks, type KwzTrackInput } from '../kwz/kwz-create.ts';
import { createKwzFrame, KwzFrameEncoder } from '../kwz/kwz-frame-codec.ts';
import { renderKwzFrame } from '../kwz/kwz-render.ts';
import { createKwzThumbnail } from '../kwz/kwz-thumbnail.ts';
import {
  KWZ_COLOR_NONE,
  KWZ_DEFAULT_FRAME_EXTRA_FLAGS,
  KWZ_FRAME_RATES,
  KWZ_HEIGHT,
  KWZ_LAYER_SIZE,
  KWZ_MAX_FRAME_DATA_SIZE,
  KWZ_MAX_FRAMES,
  KWZ_PALETTE,
  KWZ_WIDTH,
  type KwzFile,
  type KwzFrame,
  type KwzFrameRecord,
  type KwzMeta,
} from '../kwz/kwz-types.ts';
import type { AnimationSource } from '../media/animation.ts';
import { createPpmMeta, encodePpmTracks, type PpmTrackInput } from '../ppm/ppm-create.ts';
import { createPpmFrame, packPpmAnimation, PpmFrameEncoder } from '../ppm/ppm-frame-codec.ts';
import { renderPpmFrame } from '../ppm/ppm-render.ts';
import { createPpmThumbnail } from '../ppm/ppm-thumbnail.ts';
import {
  PPM_FRAME_RATES,
  PPM_HEIGHT,
  PPM_LAYER_SIZE,
  PPM_MAX_ANIMATION_SIZE,
  PPM_MAX_FRAMES,
  PPM_PALETTE,
  PPM_SIGNATURE_SIZE,
  PPM_WIDTH,
  type PpmFile,
  type PpmFrame,
  type PpmMeta,
} from '../ppm/ppm-types.ts';
import type { NoteFile, NoteFormat } from './note.ts';

export interface FrameImportOptions {
  dither?: DitherMode;
  /** Paper color index, or 'auto' for the most common color (default). */
  paper?: number | 'auto';
}

export interface NoteBuilderOptions extends FrameImportOptions {
  /** Frames per second; the nearest speed the format supports is used (default 12). */
  frameRate?: number;
  fit?: FitMode;
  resize?: ResizeMethod;
  /** Canvas color behind images that do not fill the frame, as 0xRRGGBBAA (default white). */
  background?: number;
  /** Refuse frames once the note would not fit in the app's memory (default true). */
  isRespectingLimits?: boolean;
  /** Frames the caller plans to add, so dithering can be dropped early to fit (optional). */
  expectedFrameCount?: number;
  keyFrameInterval?: number;
  ppmMeta?: Partial<PpmMeta>;
  kwzMeta?: Partial<KwzMeta>;
  onWarning?: WarningHandler;
}

/** KWZ color slots used for imported images: A black/red, B blue/green, C yellow/white. */
const KWZ_SLOT_COLORS: [number, number, number, number, number, number] = [1, 2, 5, 4, 3, 0];
const KWZ_SLOT_OF_COLOR = [5, 0, 1, 4, 3, 2];
const DEFAULT_GIF_DELAY = 0.1;

function countColors(pixels: Uint8Array, size: number): number[] {
  const counts = new Array<number>(size).fill(0);
  for (let i = 0; i < pixels.length; i++) counts[pixels[i]]++;
  return counts;
}

/** Quantizes a 256x192 image into a PPM frame (paper plus up to two pen colors). */
export function imageToPpmFrame(image: RgbaImage, options: FrameImportOptions = {}): PpmFrame {
  check(
    image.width === PPM_WIDTH && image.height === PPM_HEIGHT,
    'INVALID_ARGUMENT',
    'PPM frames are 256x192',
  );
  let pixels = quantizeImage(image, PPM_PALETTE, [0, 1, 2, 3], { dither: options.dither });
  const counts = countColors(pixels, 4);
  const paper =
    options.paper === 0 || options.paper === 1 ? options.paper : counts[1] >= counts[0] ? 1 : 0;
  const inverse = paper ^ 1;
  const used = [0, 1, 2, 3]
    .filter((color) => color !== paper && counts[color] > 0)
    .sort((a, b) => counts[b] - counts[a]);
  const pens = used.slice(0, 2).sort((a, b) => (a === inverse ? -1 : b === inverse ? 1 : a - b));
  if (used.length > 2) {
    pixels = quantizeImage(image, PPM_PALETTE, [paper, ...pens], { dither: options.dither });
  }
  const frame = createPpmFrame({ paper });
  const penOf = (color: number) => (color === inverse ? 1 : color);
  frame.pens = [penOf(pens[0] ?? inverse), penOf(pens[1] ?? pens[0] ?? inverse)];
  const [a, b] = frame.layers;
  for (let i = 0; i < PPM_LAYER_SIZE; i++) {
    const color = pixels[i];
    if (color === pens[0]) a[i] = 1;
    else if (color === pens[1]) b[i] = 1;
  }
  return frame;
}

/** Quantizes a 320x240 image into a KWZ frame using fixed color slots per layer. */
export function imageToKwzFrame(image: RgbaImage, options: FrameImportOptions = {}): KwzFrame {
  check(
    image.width === KWZ_WIDTH && image.height === KWZ_HEIGHT,
    'INVALID_ARGUMENT',
    'KWZ frames are 320x240',
  );
  const pixels = quantizeImage(image, KWZ_PALETTE, [0, 1, 2, 3, 4, 5], {
    dither: options.dither,
    transparentIndex: KWZ_COLOR_NONE,
  });
  const counts = countColors(pixels, 7);
  const paper =
    typeof options.paper === 'number' ? options.paper : counts.indexOf(Math.max(...counts));
  const frame = createKwzFrame({ paper, colors: [...KWZ_SLOT_COLORS] });
  for (let i = 0; i < KWZ_LAYER_SIZE; i++) {
    const color = pixels[i];
    if (color === paper || color === KWZ_COLOR_NONE) continue;
    const slot = KWZ_SLOT_OF_COLOR[color];
    frame.layers[slot >> 1][i] = (slot & 1) + 1;
  }
  return frame;
}

/** Nearest supported speed for a frame rate (compared on a log scale). */
export function findNearestSpeed(rates: readonly number[], frameRate: number, first = 0): number {
  let best = first;
  for (let speed = first; speed < rates.length; speed++) {
    if (
      Math.abs(Math.log(rates[speed] / frameRate)) < Math.abs(Math.log(rates[best] / frameRate))
    ) {
      best = speed;
    }
  }
  return best;
}

/**
 * Encodes frames one at a time, keeping only encoded data in memory. Images of any size are
 * fitted and quantized; frames beyond the app's memory limit are refused.
 */
export class NoteBuilder {
  readonly format: NoteFormat;
  readonly width: number;
  readonly height: number;
  readonly frameSpeed: number;
  readonly frameRate: number;
  /** True once a frame was refused because the note is full. */
  isFull = false;
  private readonly options: NoteBuilderOptions;
  private readonly warn: WarningHandler;
  private readonly ppmEncoder: PpmFrameEncoder | null;
  private readonly kwzEncoder: KwzFrameEncoder | null;
  private readonly ppmFrames: Uint8Array[] = [];
  private readonly ppmSoundFlags: number[] = [];
  private readonly kwzFrames: KwzFrameRecord[] = [];
  private thumbnail: Uint8Array | null = null;
  private dataSize = 0;
  private dither: DitherMode;
  private tracks: PpmTrackInput & KwzTrackInput = {};
  private readonly ppmMeta: PpmMeta | null;
  private readonly kwzMeta: KwzMeta | null;

  constructor(format: NoteFormat, options: NoteBuilderOptions = {}) {
    this.format = format;
    this.options = options;
    this.warn = options.onWarning ?? ignoreWarning;
    this.dither = options.dither ?? 'none';
    const rates = format === 'ppm' ? PPM_FRAME_RATES : KWZ_FRAME_RATES;
    this.frameSpeed = findNearestSpeed(rates, options.frameRate ?? 12, format === 'ppm' ? 1 : 0);
    this.frameRate = rates[this.frameSpeed];
    this.width = format === 'ppm' ? PPM_WIDTH : KWZ_WIDTH;
    this.height = format === 'ppm' ? PPM_HEIGHT : KWZ_HEIGHT;
    const speeds = { frameSpeed: this.frameSpeed, bgmSpeed: this.frameSpeed };
    this.ppmMeta = format === 'ppm' ? createPpmMeta({ ...speeds, ...options.ppmMeta }) : null;
    this.kwzMeta = format === 'kwz' ? createKwzMeta({ ...speeds, ...options.kwzMeta }) : null;
    this.ppmEncoder = format === 'ppm' ? new PpmFrameEncoder(options.keyFrameInterval ?? 0) : null;
    this.kwzEncoder = format === 'kwz' ? new KwzFrameEncoder(options.keyFrameInterval ?? 0) : null;
  }

  get frameCount(): number {
    return this.format === 'ppm' ? this.ppmFrames.length : this.kwzFrames.length;
  }

  private get maxFrames(): number {
    return this.format === 'ppm' ? PPM_MAX_FRAMES : KWZ_MAX_FRAMES;
  }

  private get maxDataSize(): number {
    return this.format === 'ppm' ? PPM_MAX_ANIMATION_SIZE - 8 : KWZ_MAX_FRAME_DATA_SIZE;
  }

  /** Drops dithering once the data grows faster than the expected frame count allows. */
  private updateDither(): void {
    const expected = this.options.expectedFrameCount;
    if (!expected || this.dither === 'none' || this.frameCount < 4) return;
    const budget = (this.maxDataSize * this.frameCount) / Math.min(expected, this.maxFrames);
    if (this.dataSize > budget) {
      this.dither = 'none';
      this.warn('Dithering was turned off to keep the note within the memory limit');
    }
  }

  private refuse(reason: string): boolean {
    if (!this.isFull) this.warn(`Stopped at ${this.frameCount} frames: ${reason}`);
    this.isFull = true;
    return false;
  }

  /** Fits, quantizes and encodes an image; returns false when the note is full. */
  addImage(image: RgbaImage, soundFlags = 0): boolean {
    const { fit = 'contain', resize, background } = this.options;
    const fitted = fitRgba(image, this.width, this.height, fit, resize, background);
    const frameOptions = { dither: this.dither, paper: this.options.paper };
    if (this.format === 'ppm') {
      return this.addFrame({ ...imageToPpmFrame(fitted, frameOptions), soundFlags });
    }
    return this.addFrame({ ...imageToKwzFrame(fitted, frameOptions), soundFlags });
  }

  /** Encodes a decoded frame of the builder's format; returns false when the note is full. */
  addFrame(frame: PpmFrame | KwzFrame): boolean {
    const isLimited = this.options.isRespectingLimits ?? true;
    if (isLimited && this.frameCount >= this.maxFrames) {
      return this.refuse(`the app allows ${this.maxFrames} frames`);
    }
    if (this.ppmEncoder && this.ppmMeta) {
      const ppmFrame = frame as PpmFrame;
      const data = this.ppmEncoder.encode(ppmFrame);
      if (isLimited && this.dataSize + data.length + 4 > this.maxDataSize) {
        return this.refuse('the memory is full');
      }
      if (this.frameCount === this.ppmMeta.thumbnailIndex || this.frameCount === 0) {
        this.thumbnail = createPpmThumbnail(
          renderPpmFrame(ppmFrame, undefined, { visible: this.ppmMeta.isLayerVisible }),
        );
      }
      this.ppmFrames.push(data);
      this.ppmSoundFlags.push(ppmFrame.soundFlags);
      this.dataSize += data.length + 4;
    } else if (this.kwzEncoder && this.kwzMeta) {
      const kwzFrame = frame as KwzFrame;
      const { layerData, keyLayers } = this.kwzEncoder.encode(kwzFrame);
      const size = layerData[0].length + layerData[1].length + layerData[2].length;
      if (isLimited && this.dataSize + size > this.maxDataSize) {
        return this.refuse('the memory is full');
      }
      if (this.frameCount === this.kwzMeta.thumbnailIndex || this.frameCount === 0) {
        const pixels = renderKwzFrame(kwzFrame, undefined, {
          visible: this.kwzMeta.isLayerVisible,
        });
        this.thumbnail = createKwzThumbnail(pixels);
      }
      this.kwzFrames.push({
        paper: kwzFrame.paper,
        colors: [...kwzFrame.colors],
        layerDepths: [...kwzFrame.layerDepths],
        soundFlags: kwzFrame.soundFlags,
        cameraFlags: kwzFrame.cameraFlags,
        authorId: this.kwzMeta.currentAuthorId,
        layerData,
        keyLayers,
        extraFlags: KWZ_DEFAULT_FRAME_EXTRA_FLAGS,
        reserved: 0,
      });
      this.dataSize += size;
    }
    this.updateDither();
    return true;
  }

  /** Sets a track from PCM at any rate (null removes it); it is cut to the app's limit. */
  setTrack(name: 'bgm' | 'se1' | 'se2' | 'se3' | 'se4', pcm: Pcm | null): void {
    this.tracks = { ...this.tracks, [name]: pcm };
  }

  finish(): NoteFile {
    check(
      this.frameCount > 0 && this.thumbnail,
      'INVALID_ARGUMENT',
      'A note needs at least one frame',
    );
    if (this.ppmMeta) {
      const meta = this.ppmMeta;
      if (meta.thumbnailIndex >= this.frameCount) meta.thumbnailIndex = 0;
      if (this.tracks.se4) this.warn('PPM has no fourth sound effect; SE4 was dropped');
      const file: PpmFile = {
        format: 'ppm',
        meta,
        thumbnail: this.thumbnail,
        animation: packPpmAnimation(this.ppmFrames, this.ppmSoundFlags),
        tracks: encodePpmTracks(this.tracks, null, this.warn),
        signature: new Uint8Array(PPM_SIGNATURE_SIZE),
        source: null,
      };
      return file;
    }
    const meta = this.kwzMeta!;
    if (meta.thumbnailIndex >= this.frameCount) meta.thumbnailIndex = 0;
    const file: KwzFile = {
      format: 'kwz',
      variant: 'kwz',
      meta,
      thumbnail: this.thumbnail,
      frames: this.kwzFrames,
      tracks: encodeKwzTracks(this.tracks, null, this.warn),
      signature: null,
      source: null,
    };
    return file;
  }
}

export interface AnimationImportOptions extends Omit<
  NoteBuilderOptions,
  'frameRate' | 'expectedFrameCount'
> {
  /** Target frames per second, or 'auto' to follow the source timing (default). */
  frameRate?: number | 'auto';
  /** When the source needs more frames than allowed: 'slow' lowers the speed, 'trim' cuts the end. */
  overflow?: 'slow' | 'trim';
  /** Soundtrack to store as BGM. */
  bgm?: Pcm | null;
  /** Called after each output frame. */
  onProgress?: (done: number, total: number) => void;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[sorted.length >> 1] : DEFAULT_GIF_DELAY;
}

/**
 * Picks the supported speed nearest to `frameRate` and the number of frames that cover
 * `duration` seconds; with 'slow', the speed drops until the frames fit the app's limit.
 */
export function planFrameTiming(
  format: NoteFormat,
  duration: number,
  frameRate: number,
  overflow: 'slow' | 'trim' = 'slow',
): { frameRate: number; frameCount: number } {
  const rates = format === 'ppm' ? PPM_FRAME_RATES : KWZ_FRAME_RATES;
  const first = format === 'ppm' ? 1 : 0;
  const maxFrames = format === 'ppm' ? PPM_MAX_FRAMES : KWZ_MAX_FRAMES;
  let speed = findNearestSpeed(rates, frameRate, first);
  if (overflow === 'slow') {
    while (Math.round(duration * rates[speed]) > maxFrames) {
      const slower = rates.findLastIndex((rate, index) => index >= first && rate < rates[speed]);
      if (slower < 0) break;
      speed = slower;
    }
  }
  const frameCount = Math.max(1, Math.min(maxFrames, Math.round(duration * rates[speed])));
  return { frameRate: rates[speed], frameCount };
}

/**
 * Builds a note from an animation (GIF, APNG, image sequence or decoded video frames),
 * resampling its timing to a speed the app supports.
 */
export function importAnimation(
  source: AnimationSource,
  format: NoteFormat,
  options: AnimationImportOptions = {},
): NoteFile {
  const durations = source.durations.map((value) => (value > 0.011 ? value : DEFAULT_GIF_DELAY));
  const total = durations.reduce((sum, value) => sum + value, 0);
  const wanted =
    options.frameRate === undefined || options.frameRate === 'auto'
      ? 1 / median(durations)
      : options.frameRate;
  const plan = planFrameTiming(format, total, wanted, options.overflow);
  const builder = new NoteBuilder(format, {
    ...options,
    frameRate: plan.frameRate,
    expectedFrameCount: plan.frameCount,
  });
  let output = 0;
  let start = 0;
  let index = 0;
  for (const image of source.frames()) {
    const end = start + (durations[index++] ?? DEFAULT_GIF_DELAY);
    const isLast = index >= durations.length;
    while (output < plan.frameCount && (isLast || (output + 0.5) / plan.frameRate < end)) {
      if (!builder.addImage(image)) break;
      output++;
      options.onProgress?.(output, plan.frameCount);
    }
    if (output >= plan.frameCount || builder.isFull) break;
    start = end;
  }
  if (options.bgm) builder.setTrack('bgm', options.bgm);
  return builder.finish();
}

export interface ImagesImportOptions extends NoteBuilderOptions {
  bgm?: Pcm | null;
}

/** Builds a PPM from RGBA images (any size; fitted to 256x192), one frame each. */
export function createPpmFromImages(
  images: Iterable<RgbaImage>,
  options: ImagesImportOptions = {},
): PpmFile {
  const builder = new NoteBuilder('ppm', options);
  for (const image of images) if (!builder.addImage(image)) break;
  if (options.bgm) builder.setTrack('bgm', options.bgm);
  return builder.finish() as PpmFile;
}

/** Builds a KWZ from RGBA images (any size; fitted to 320x240), one frame each. */
export function createKwzFromImages(
  images: Iterable<RgbaImage>,
  options: ImagesImportOptions = {},
): KwzFile {
  const builder = new NoteBuilder('kwz', options);
  for (const image of images) if (!builder.addImage(image)) break;
  if (options.bgm) builder.setTrack('bgm', options.bgm);
  return builder.finish() as KwzFile;
}
