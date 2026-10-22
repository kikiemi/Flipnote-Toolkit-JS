import { check } from '../core/errors.ts';
import { indexedToRgba, type IndexedImage, type Rect, type RgbaImage } from '../image/image.ts';
import { isDsiLibraryNote } from '../kwz/kwz-dsi-library.ts';
import { KwzFrameDecoder } from '../kwz/kwz-frame-codec.ts';
import { KWZ_ICON_SIZE } from '../kwz/kwz-icon.ts';
import { renderKwzFrame, type StereoEye } from '../kwz/kwz-render.ts';
import { KWZ_CANVAS_RECT, KWZ_DSI_LIBRARY_RECT, type KwzPaletteName } from '../kwz/kwz-types.ts';
import { PpmFrameDecoder } from '../ppm/ppm-frame-codec.ts';
import { renderPpmFrame } from '../ppm/ppm-render.ts';
import { getNoteInfo, getPalette, type NoteFile } from './note.ts';

/**
 * Part of the frame to output: `full`; `canvas` (the 3DS drawable area); `dsi` (the PPM area
 * of DSi Library notes); `auto` (24x24 for folder icons, `dsi` for DSi Library notes); or a rectangle.
 */
export type CropMode = 'full' | 'canvas' | 'dsi' | 'auto' | Rect;

export interface RenderOptions {
  /** KWZ 3D view: which eye to render (default 'center', no shift). */
  eye?: StereoEye;
  /** KWZ 3D slider position from 0 to 1 (default 1). */
  depthStrength?: number;
  /** Draw layers the note marks as hidden (default false). */
  isShowingHiddenLayers?: boolean;
  /** KWZ colors: 'screen' as the 3DS shows them (default) or 'app' as stored in the app. */
  palette?: KwzPaletteName;
  /** Default 'full', except folder icons, which default to their 24x24 area. */
  crop?: CropMode;
}

/** Renders frames of one note to palette indices, reusing decoder state between calls. */
export interface FrameRenderer {
  readonly width: number;
  readonly height: number;
  readonly frameCount: number;
  readonly frameRate: number;
  readonly palette: Uint8Array;
  /** Palette indices of one frame; the returned buffer is `target` when given. */
  render(index: number, target?: Uint8Array): Uint8Array;
}

function resolveCrop(note: NoteFile, crop: CropMode | undefined): Rect | null {
  if (note.format === 'ppm') return typeof crop === 'object' ? crop : null;
  const mode = crop ?? (note.variant === 'icon' ? 'auto' : 'full');
  if (typeof mode === 'object') return mode;
  if (mode === 'canvas') return KWZ_CANVAS_RECT;
  if (mode === 'dsi') return KWZ_DSI_LIBRARY_RECT;
  if (mode === 'auto') {
    if (note.variant === 'icon') return { x: 0, y: 0, width: KWZ_ICON_SIZE, height: KWZ_ICON_SIZE };
    if (isDsiLibraryNote(note)) return KWZ_DSI_LIBRARY_RECT;
  }
  return null;
}

function cropInto(source: Uint8Array, sourceWidth: number, rect: Rect, target: Uint8Array): void {
  for (let y = 0; y < rect.height; y++) {
    const start = (rect.y + y) * sourceWidth + rect.x;
    target.set(source.subarray(start, start + rect.width), y * rect.width);
  }
}

export function createFrameRenderer(note: NoteFile, options: RenderOptions = {}): FrameRenderer {
  const info = getNoteInfo(note);
  const isShowingHidden = options.isShowingHiddenLayers ?? false;
  const rect = resolveCrop(note, options.crop);
  if (rect) {
    check(
      rect.x >= 0 &&
        rect.y >= 0 &&
        rect.x + rect.width <= info.width &&
        rect.y + rect.height <= info.height,
      'INVALID_ARGUMENT',
      'Crop rectangle is outside the frame',
    );
  }
  const width = rect ? rect.width : info.width;
  const height = rect ? rect.height : info.height;
  const base = {
    width,
    height,
    frameCount: info.frameCount,
    frameRate: info.frameRate,
    palette: getPalette(note, options.palette),
  };
  const full = rect ? new Uint8Array(info.width * info.height) : null;
  const finish = (pixels: Uint8Array, target: Uint8Array) => {
    if (rect) cropInto(pixels, info.width, rect, target);
    return target;
  };
  if (note.format === 'ppm') {
    const decoder = new PpmFrameDecoder(note);
    const visible = isShowingHidden ? [true, true] : note.meta.isLayerVisible;
    return {
      ...base,
      render: (index, target = new Uint8Array(width * height)) =>
        finish(renderPpmFrame(decoder.decode(index), full ?? target, { visible }), target),
    };
  }
  const decoder = new KwzFrameDecoder(note, { isTolerant: true });
  const visible = isShowingHidden ? [true, true, true] : note.meta.isLayerVisible;
  const kwzOptions = { eye: options.eye, depthStrength: options.depthStrength, visible };
  return {
    ...base,
    render: (index, target = new Uint8Array(width * height)) =>
      finish(renderKwzFrame(decoder.decode(index), full ?? target, kwzOptions), target),
  };
}

/** Renders one frame as palette indices plus the note palette. */
export function renderFrame(
  note: NoteFile,
  index: number,
  options: RenderOptions = {},
): IndexedImage {
  const renderer = createFrameRenderer(note, options);
  check(
    Number.isInteger(index) && index >= 0 && index < renderer.frameCount,
    'INVALID_ARGUMENT',
    `Frame ${index} does not exist`,
  );
  return {
    width: renderer.width,
    height: renderer.height,
    pixels: renderer.render(index),
    palette: renderer.palette,
  };
}

export function renderFrameRgba(
  note: NoteFile,
  index: number,
  options: RenderOptions = {},
): RgbaImage {
  return indexedToRgba(renderFrame(note, index, options));
}
