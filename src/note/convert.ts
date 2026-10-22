import type { Pcm } from '../audio/pcm.ts';
import { ignoreWarning, type WarningHandler } from '../core/errors.ts';
import { resampleBitmap } from '../edit/tools.ts';
import { cropRgba, fitRgba, indexedToRgba, type Rect } from '../image/image.ts';
import { nearestColor, type DitherMode } from '../image/quantize.ts';
import { decodeKwzTrack, hasKwzTrack } from '../kwz/kwz-audio.ts';
import { createKwz } from '../kwz/kwz-create.ts';
import { isDsiLibraryLayout } from '../kwz/kwz-dsi-library.ts';
import {
  convertKwzFsidToPpm,
  convertPpmFsidToKwz,
  encodeKwzFilename,
  parseKwzFsid,
} from '../kwz/kwz-filename.ts';
import { createKwzFrame, KwzFrameDecoder } from '../kwz/kwz-frame-codec.ts';
import { getKwzLayerOrder, renderKwzFrame } from '../kwz/kwz-render.ts';
import {
  KWZ_CANVAS_RECT,
  KWZ_COLOR_BLACK,
  KWZ_COLOR_BLUE,
  KWZ_COLOR_NONE,
  KWZ_COLOR_RED,
  KWZ_COLOR_WHITE,
  KWZ_DSI_LIBRARY_RECT,
  KWZ_FRAME_RATES,
  KWZ_HEIGHT,
  KWZ_LAYER_SIZE,
  KWZ_PALETTE,
  KWZ_WIDTH,
  type KwzFile,
  type KwzFrame,
} from '../kwz/kwz-types.ts';
import { decodePpmTrack, hasPpmTrack } from '../ppm/ppm-audio.ts';
import { createPpm } from '../ppm/ppm-create.ts';
import {
  createPpmFilename,
  createPpmRootFragment,
  formatPpmFilename,
  isPpmFilename,
  parsePpmFilename,
} from '../ppm/ppm-filename.ts';
import { createPpmFrame, PpmFrameDecoder } from '../ppm/ppm-frame-codec.ts';
import {
  PPM_COLOR_BLUE,
  PPM_COLOR_RED,
  PPM_FRAME_RATES,
  PPM_HEIGHT,
  PPM_PALETTE,
  PPM_PAPER_WHITE,
  PPM_PEN_BLUE,
  PPM_PEN_INVERSE,
  PPM_PEN_RED,
  PPM_SE_NAMES,
  PPM_TRACK_NAMES,
  PPM_WIDTH,
  type PpmFile,
  type PpmFrame,
  type PpmMeta,
} from '../ppm/ppm-types.ts';
import { findNearestSpeed, imageToPpmFrame } from './import.ts';
import { getFrameCount, type NoteFile } from './note.ts';

export interface ConvertOptions {
  /** Replace the current author (e.g. your own console's ID) so the note can be edited. */
  authorId?: string;
  authorName?: string;
  keyFrameInterval?: number;
  onWarning?: WarningHandler;
}

/**
 * Where the picture goes on the other format's screen: `center` places it 1:1 like the DSi
 * Library did; `canvas` scales it to the area the 3DS lets you draw on (310x230 inside a
 * 5-pixel border); `screen` scales it to the whole screen (exactly 1.25x or 0.8x).
 */
export type ScreenFit = 'center' | 'canvas' | 'screen';

export interface FrameConvertOptions {
  /** Default 'center'. */
  fit?: ScreenFit;
}

export interface KwzFrameConvertOptions extends FrameConvertOptions {
  /** Layers to include (default all). */
  visible?: readonly boolean[];
}

export interface FlattenOptions extends KwzFrameConvertOptions {
  dither?: DitherMode;
}

export interface ToPpmOptions extends ConvertOptions {
  /** Default 'auto': `center` for DSi Library layouts, otherwise `canvas`. */
  fit?: ScreenFit | 'auto';
  /**
   * `keep` maps KWZ layers onto PPM's two layers so the result stays editable (default);
   * `flatten` composites the frame and re-quantizes its colors.
   */
  layers?: 'keep' | 'flatten';
  /** Dithering for `flatten`. */
  dither?: DitherMode;
}

export interface ToKwzOptions extends ConvertOptions {
  /** Default 'center', the DSi Library placement, which converts back without loss. */
  fit?: ScreenFit;
  /** Store PPM filenames in the header like Nintendo's DSi Library converter (default false). */
  isKeepingPpmFilenames?: boolean;
}

/** PPM speeds 1-8 have exact KWZ equivalents. */
const PPM_TO_KWZ_SPEED = [10, 1, 2, 3, 4, 5, 7, 8, 10];
const PPM_RECT: Rect = { x: 0, y: 0, width: PPM_WIDTH, height: PPM_HEIGHT };
const KWZ_RECT: Rect = { x: 0, y: 0, width: KWZ_WIDTH, height: KWZ_HEIGHT };

/** Fits a `width`x`height` picture inside `area`, keeping its aspect ratio, centered. */
function fitInside(width: number, height: number, area: Rect): Rect {
  const scale = Math.min(area.width / width, area.height / height);
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  return {
    x: area.x + ((area.width - w) >> 1),
    y: area.y + ((area.height - h) >> 1),
    width: w,
    height: h,
  };
}

/** Area of a KWZ frame that a PPM picture occupies for a fit. */
export function getKwzPlacement(fit: ScreenFit): Rect {
  if (fit === 'screen') return KWZ_RECT;
  if (fit === 'canvas') return fitInside(PPM_WIDTH, PPM_HEIGHT, KWZ_CANVAS_RECT);
  return KWZ_DSI_LIBRARY_RECT;
}

/** Part of a KWZ frame that a fit turns into the PPM picture, and where it lands. */
export function getPpmPlacement(fit: ScreenFit): { from: Rect; to: Rect } {
  if (fit === 'screen') return { from: KWZ_RECT, to: PPM_RECT };
  if (fit === 'canvas') {
    const { width, height } = KWZ_CANVAS_RECT;
    return { from: KWZ_CANVAS_RECT, to: fitInside(width, height, PPM_RECT) };
  }
  return { from: KWZ_DSI_LIBRARY_RECT, to: PPM_RECT };
}

function ppmPenToKwzColor(pen: number, paper: number): number {
  if (pen === PPM_PEN_RED) return KWZ_COLOR_RED;
  if (pen === PPM_PEN_BLUE) return KWZ_COLOR_BLUE;
  return paper === PPM_PAPER_WHITE ? KWZ_COLOR_BLACK : KWZ_COLOR_WHITE;
}

/**
 * Places a PPM frame on a KWZ frame layer for layer (1:1 at the DSi Library position by default),
 * laid out like Nintendo's DSi Library converter: each layer's first color is the paper, its
 * second the pen, and pixels use the second.
 */
export function ppmFrameToKwz(frame: PpmFrame, options: FrameConvertOptions = {}): KwzFrame {
  const paper = frame.paper === PPM_PAPER_WHITE ? KWZ_COLOR_WHITE : KWZ_COLOR_BLACK;
  const a = ppmPenToKwzColor(frame.pens[0], frame.paper);
  const b = ppmPenToKwzColor(frame.pens[1], frame.paper);
  const out = createKwzFrame({
    paper,
    colors: [paper, a, paper, b, paper, paper],
    soundFlags: frame.soundFlags & 7,
  });
  const to = getKwzPlacement(options.fit ?? 'center');
  for (let layer = 0; layer < 2; layer++) {
    const target = out.layers[layer];
    resampleBitmap(
      { width: PPM_WIDTH, height: PPM_HEIGHT, pixels: frame.layers[layer] },
      PPM_RECT,
      { width: KWZ_WIDTH, height: KWZ_HEIGHT, pixels: target },
      to,
    );
    for (let i = 0; i < target.length; i++) if (target[i]) target[i] = 2;
  }
  return out;
}

function isExactPen(color: number, paper: number): boolean {
  const inverse = paper === PPM_PAPER_WHITE ? KWZ_COLOR_BLACK : KWZ_COLOR_WHITE;
  return color === KWZ_COLOR_RED || color === KWZ_COLOR_BLUE || color === inverse;
}

/** Nearest PPM color (0 black, 1 white, 2 red, 3 blue) of each KWZ color; -1 for none. */
const PPM_COLOR_OF_KWZ = Array.from({ length: KWZ_COLOR_NONE + 1 }, (_, color) =>
  color === KWZ_COLOR_NONE
    ? -1
    : nearestColor(
        PPM_PALETTE,
        [0, 1, 2, 3],
        KWZ_PALETTE[color * 4],
        KWZ_PALETTE[color * 4 + 1],
        KWZ_PALETTE[color * 4 + 2],
      ),
);

/** PPM paper (0 black, 1 white) closest to a KWZ color. */
function toPpmPaper(color: number): number {
  if (color >= KWZ_COLOR_NONE) return 1;
  const i = color * 4;
  const luma = 0.299 * KWZ_PALETTE[i] + 0.587 * KWZ_PALETTE[i + 1] + 0.114 * KWZ_PALETTE[i + 2];
  return luma >= 128 ? 1 : 0;
}

/** Share of the area a layer covers and its most used color. */
function measureLayer(
  frame: KwzFrame,
  layer: number,
  area: Rect,
): { coverage: number; color: number } {
  const pixels = frame.layers[layer];
  const counts = [0, 0, 0];
  for (let y = area.y; y < area.y + area.height; y++) {
    for (let x = area.x; x < area.x + area.width; x++) counts[pixels[y * KWZ_WIDTH + x]]++;
  }
  const value = counts[2] > counts[1] ? 2 : 1;
  return {
    coverage: (counts[1] + counts[2]) / (area.width * area.height),
    color: frame.colors[layer * 2 + value - 1],
  };
}

const BACKGROUND_COVERAGE = 0.95;
/** Share of the area a by-layer mapping may get wrong before mapping by color is tried. */
const LAYER_ERROR_TOLERANCE = 0.01;

/** Two PPM layer masks (320x240) with the PPM color each is drawn in. */
interface PpmLayerPlan {
  masks: [Uint8Array, Uint8Array];
  colors: [number, number];
}

/** Maps whole KWZ layers: the front layer to PPM layer 1, the others to layer 2. */
function planByLayer(frame: KwzFrame, back: number[], used: number[], paper: number): PpmLayerPlan {
  const front = [...back].reverse();
  const drawn = front.filter((layer) => used.includes(layer));
  const groups = !drawn.includes(2)
    ? front.filter((layer) => layer !== 2).map((layer) => [layer])
    : drawn.length <= 2
      ? drawn.map((layer) => [layer])
      : [[drawn[0]], drawn.slice(1)];
  const plan: PpmLayerPlan = {
    masks: [new Uint8Array(KWZ_LAYER_SIZE), new Uint8Array(KWZ_LAYER_SIZE)],
    colors: [paper ^ 1, paper ^ 1],
  };
  groups.slice(0, 2).forEach((group, target) => {
    const counts = [0, 0, 0, 0];
    const mask = plan.masks[target];
    for (const layer of group) {
      const pixels = frame.layers[layer];
      for (let i = 0; i < pixels.length; i++) {
        if (!pixels[i]) continue;
        const color =
          PPM_COLOR_OF_KWZ[Math.min(KWZ_COLOR_NONE, frame.colors[layer * 2 + pixels[i] - 1])];
        if (color < 0 || color === paper) continue;
        mask[i] = 1;
        counts[color]++;
      }
    }
    const colors = [0, 1, 2, 3].filter((color) => counts[color] > 0);
    const slots = [frame.colors[group[0] * 2 + 1], frame.colors[group[0] * 2]];
    const fallback = PPM_COLOR_OF_KWZ[slots.find((color) => color !== frame.paper) ?? slots[0]];
    plan.colors[target] = colors.length
      ? colors.reduce((a, b) => (counts[b] > counts[a] ? b : a))
      : fallback;
  });
  return plan;
}

/** Maps visible colors: the two most used ink colors each get a PPM layer. */
function planByColor(visible: Int8Array, paper: number): PpmLayerPlan {
  const counts = [0, 0, 0, 0];
  for (let i = 0; i < visible.length; i++) if (visible[i] >= 0) counts[visible[i]]++;
  const order = [0, 1, 2, 3]
    .filter((color) => color !== paper)
    .sort((a, b) => counts[b] - counts[a]);
  const colors: [number, number] = [order[1], order[0]];
  const masks: [Uint8Array, Uint8Array] = [
    new Uint8Array(KWZ_LAYER_SIZE),
    new Uint8Array(KWZ_LAYER_SIZE),
  ];
  for (let i = 0; i < visible.length; i++) {
    if (visible[i] === colors[0]) masks[0][i] = 1;
    else if (visible[i] === colors[1]) masks[1][i] = 1;
  }
  return { masks, colors };
}

/** Pixels inside `area` where a plan shows a different color than the original. */
function countErrors(plan: PpmLayerPlan, visible: Int8Array, paper: number, area: Rect): number {
  let errors = 0;
  for (let y = area.y; y < area.y + area.height; y++) {
    for (let x = area.x; x < area.x + area.width; x++) {
      const i = y * KWZ_WIDTH + x;
      const shown = plan.masks[0][i] ? plan.colors[0] : plan.masks[1][i] ? plan.colors[1] : paper;
      if (shown !== (visible[i] < 0 ? paper : visible[i])) errors++;
    }
  }
  return errors;
}

/**
 * Converts a KWZ frame to PPM keeping its layers where possible: the front layer (by 3D depth)
 * becomes PPM layer 1 and the others layer 2, each drawn with the nearest PPM pen. When that
 * would lose colors (PPM has one pen per layer), the two main ink colors get a layer each
 * instead. A back layer filled as a background sets the paper. `isExact` tells whether the
 * result looks the same and keeps the layers.
 */
export function kwzFrameToPpm(
  frame: KwzFrame,
  options: KwzFrameConvertOptions = {},
): { frame: PpmFrame; isExact: boolean } {
  const fit = options.fit ?? 'center';
  const visible = options.visible ?? [true, true, true];
  const { from, to } = getPpmPlacement(fit);
  const back = getKwzLayerOrder(frame.layerDepths).filter((layer) => visible[layer]);
  const used = back.filter((layer) => frame.layers[layer].some((value) => value !== 0));
  let background = frame.paper;
  if (used.length > 1) {
    const fill = measureLayer(frame, used[0], from);
    if (fill.coverage >= BACKGROUND_COVERAGE) background = fill.color;
  }
  const paper = toPpmPaper(background);
  const composite = renderKwzFrame(frame, undefined, { visible });
  const inks = new Int8Array(KWZ_LAYER_SIZE);
  let isRepresentable = background === KWZ_COLOR_WHITE || background === KWZ_COLOR_BLACK;
  for (let i = 0; i < composite.length; i++) {
    const color = PPM_COLOR_OF_KWZ[composite[i]];
    inks[i] = color === paper ? -1 : color;
    if (inks[i] >= 0 && !isExactPen(composite[i], paper)) isRepresentable = false;
  }
  let plan = planByLayer(frame, back, used, paper);
  let errors = countErrors(plan, inks, paper, from);
  let isByLayer = true;
  if (errors > from.width * from.height * LAYER_ERROR_TOLERANCE) {
    const byColor = planByColor(inks, paper);
    const colorErrors = countErrors(byColor, inks, paper, from);
    if (colorErrors < errors) {
      plan = byColor;
      errors = colorErrors;
      isByLayer = false;
    }
  }
  const out = createPpmFrame({ paper });
  out.soundFlags = frame.soundFlags & 7;
  plan.masks.forEach((mask, target) => {
    const color = plan.colors[target];
    out.pens[target] =
      color === PPM_COLOR_RED || color === PPM_COLOR_BLUE ? color : PPM_PEN_INVERSE;
    resampleBitmap(
      { width: KWZ_WIDTH, height: KWZ_HEIGHT, pixels: mask },
      from,
      { width: PPM_WIDTH, height: PPM_HEIGHT, pixels: out.layers[target] },
      to,
    );
  });
  const isExact = fit === 'center' && isByLayer && isRepresentable && errors === 0;
  return { frame: out, isExact };
}

/** Composites a KWZ frame and re-quantizes it to PPM colors (closest colors, no layers). */
export function flattenKwzFrameToPpm(frame: KwzFrame, options: FlattenOptions = {}): PpmFrame {
  const pixels = renderKwzFrame(frame, undefined, { visible: options.visible });
  const image = indexedToRgba({
    width: KWZ_WIDTH,
    height: KWZ_HEIGHT,
    pixels,
    palette: KWZ_PALETTE,
  });
  const { from, to } = getPpmPlacement(options.fit ?? 'center');
  const placed = fitRgba(cropRgba(image, from), to.width, to.height, 'stretch', 'area');
  const canvas = fitRgba(placed, PPM_WIDTH, PPM_HEIGHT, 'center', 'area');
  return {
    ...imageToPpmFrame(canvas, { dither: options.dither }),
    soundFlags: frame.soundFlags & 7,
  };
}

function collectTracks<T extends string>(
  names: readonly T[],
  has: (name: T) => boolean,
  decode: (name: T) => Pcm,
): Partial<Record<T, Pcm>> {
  const tracks: Partial<Record<T, Pcm>> = {};
  for (const name of names) if (has(name)) tracks[name] = decode(name);
  return tracks;
}

/**
 * PPM to KWZ layer for layer, the way the DSi Library did it: frames are centered without loss
 * (or scaled with `fit`), speeds map exactly and audio is resampled.
 */
export function convertPpmToKwz(file: PpmFile, options: ToKwzOptions = {}): KwzFile {
  const { meta } = file;
  const decoder = new PpmFrameDecoder(file);
  const fit = options.fit ?? 'center';
  const frames = (function* () {
    for (let i = 0; i < decoder.frameCount; i++) yield ppmFrameToKwz(decoder.decode(i), { fit });
  })();
  const tracks = collectTracks(
    PPM_TRACK_NAMES,
    (name) => hasPpmTrack(file, name),
    (name) => decodePpmTrack(file, name),
  );
  const rootId = convertPpmFsidToKwz(meta.rootAuthorId);
  const parentId = convertPpmFsidToKwz(meta.parentAuthorId);
  const currentId = options.authorId
    ? parseKwzFsid(options.authorId)
    : convertPpmFsidToKwz(meta.currentAuthorId);
  const name = (id: string) =>
    encodeKwzFilename({ authorId: id, createdTime: meta.timestamp, modifiedTime: meta.timestamp });
  const isKeeping = options.isKeepingPpmFilenames ?? false;
  return createKwz({
    frames,
    tracks,
    keyFrameInterval: options.keyFrameInterval,
    onWarning: options.onWarning,
    meta: {
      createdTime: meta.timestamp,
      modifiedTime: meta.timestamp,
      rootAuthorId: rootId,
      parentAuthorId: parentId,
      currentAuthorId: currentId,
      rootAuthorName: meta.rootAuthorName,
      parentAuthorName: meta.parentAuthorName,
      currentAuthorName: options.authorName ?? meta.currentAuthorName,
      rootFilename: isKeeping ? formatPpmFilename(meta.parentFilename) : name(rootId),
      parentFilename: isKeeping ? formatPpmFilename(meta.parentFilename) : name(parentId),
      currentFilename: isKeeping ? formatPpmFilename(meta.currentFilename) : name(currentId),
      thumbnailIndex: meta.thumbnailIndex,
      frameSpeed: PPM_TO_KWZ_SPEED[meta.frameSpeed],
      bgmSpeed: PPM_TO_KWZ_SPEED[meta.bgmSpeed],
      isLocked: meta.isLocked,
      isLooping: meta.isLooping,
      isLayerVisible: [meta.isLayerVisible[0], meta.isLayerVisible[1], true],
    },
  });
}

/** PPM metadata recovered from a KWZ, using stored PPM filenames when a DSi Library note has them. */
function createPpmMetaFromKwz(file: KwzFile, options: ToPpmOptions): Partial<PpmMeta> {
  const { meta } = file;
  const authorId = options.authorId?.toUpperCase() ?? convertKwzFsidToPpm(meta.currentAuthorId);
  const fresh = createPpmFilename(authorId.slice(10));
  const current =
    isPpmFilename(meta.currentFilename) && !options.authorId
      ? parsePpmFilename(meta.currentFilename)
      : fresh;
  const parent = isPpmFilename(meta.parentFilename)
    ? parsePpmFilename(meta.parentFilename)
    : current;
  const root = isPpmFilename(meta.rootFilename) ? parsePpmFilename(meta.rootFilename) : parent;
  return {
    isLocked: meta.isLocked,
    thumbnailIndex: meta.thumbnailIndex,
    rootAuthorName: meta.rootAuthorName,
    parentAuthorName: meta.parentAuthorName,
    currentAuthorName: options.authorName ?? meta.currentAuthorName,
    rootAuthorId: convertKwzFsidToPpm(meta.rootAuthorId),
    parentAuthorId: convertKwzFsidToPpm(meta.parentAuthorId),
    currentAuthorId: authorId,
    parentFilename: parent,
    currentFilename: current,
    rootFilenameFragment: createPpmRootFragment(root),
    timestamp: meta.modifiedTime,
    isLooping: meta.isLooping,
    isLayerVisible: [true, true],
  };
}

/**
 * KWZ to PPM. Layers are kept by default (see kwzFrameToPpm), so DSi Library notes and PPM
 * conversions come back without loss and other notes stay editable; `layers: 'flatten'`
 * composites and re-quantizes instead.
 */
export function convertKwzToPpm(file: KwzFile, options: ToPpmOptions = {}): PpmFile {
  const { meta } = file;
  const warn = options.onWarning ?? ignoreWarning;
  const decoder = new KwzFrameDecoder(file, { isTolerant: true });
  const requested = options.fit ?? 'auto';
  const fit = requested === 'auto' ? (isDsiLibraryLayout(file) ? 'center' : 'canvas') : requested;
  const isFlattening = options.layers === 'flatten';
  const visible = meta.isLayerVisible;
  let approximated = 0;
  const frames = (function* () {
    for (let i = 0; i < file.frames.length; i++) {
      const frame = decoder.decode(i);
      if (isFlattening) {
        yield flattenKwzFrameToPpm(frame, { fit, visible, dither: options.dither });
        continue;
      }
      const result = kwzFrameToPpm(frame, { fit, visible });
      if (!result.isExact) approximated++;
      yield result.frame;
    }
  })();
  const frameRate = KWZ_FRAME_RATES[meta.frameSpeed];
  const bgmRate = KWZ_FRAME_RATES[meta.bgmSpeed];
  const frameSpeed = findNearestSpeed(PPM_FRAME_RATES, frameRate, 1);
  const bgmSpeed = findNearestSpeed(PPM_FRAME_RATES, bgmRate, 1);
  const isExact =
    PPM_FRAME_RATES[frameSpeed] === frameRate && PPM_FRAME_RATES[bgmSpeed] === bgmRate;
  if (!isExact) {
    warn(`${frameRate} fps is not available in PPM; using ${PPM_FRAME_RATES[frameSpeed]} fps`);
  }
  const tracks = collectTracks(
    ['bgm', ...PPM_SE_NAMES] as const,
    (name) => hasKwzTrack(file, name),
    (name) => decodeKwzTrack(file, name),
  );
  if (tracks.bgm && !isExact) {
    tracks.bgm = {
      samples: tracks.bgm.samples,
      sampleRate: (tracks.bgm.sampleRate * frameRate) / bgmRate,
    };
  }
  if (hasKwzTrack(file, 'se4')) warn('PPM has no fourth sound effect; SE4 was dropped');
  const ppm = createPpm({
    frames,
    tracks,
    meta: {
      ...createPpmMetaFromKwz(file, options),
      frameSpeed,
      bgmSpeed: isExact ? bgmSpeed : frameSpeed,
    },
    keyFrameInterval: options.keyFrameInterval,
    onWarning: warn,
  });
  if (approximated > 0) {
    const total = getFrameCount(file);
    warn(`${approximated} of ${total} frames were rescaled, recolored or had layers merged`);
  }
  return ppm;
}

/** Converts any note to PPM (PPM input is returned unchanged). */
export function convertToPpm(note: NoteFile, options: ToPpmOptions = {}): PpmFile {
  return note.format === 'ppm' ? note : convertKwzToPpm(note, options);
}

/** Converts any note to KWZ (KWZ input is returned unchanged). */
export function convertToKwz(note: NoteFile, options: ToKwzOptions = {}): KwzFile {
  return note.format === 'kwz' ? note : convertPpmToKwz(note, options);
}
