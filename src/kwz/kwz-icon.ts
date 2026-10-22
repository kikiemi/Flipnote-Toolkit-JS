import { check } from '../core/errors.ts';
import type { IndexedImage, RgbaImage } from '../image/image.ts';
import { quantizeImage, type DitherMode } from '../image/quantize.ts';
import { createKwzFrame, encodeKwzKeyFrame, KwzFrameDecoder } from './kwz-frame-codec.ts';
import { createEmptyKwzMeta } from './kwz-reader.ts';
import { renderKwzFrame } from './kwz-render.ts';
import {
  KWZ_COLOR_NONE,
  KWZ_COLOR_WHITE,
  KWZ_EMPTY_AUTHOR_ID,
  KWZ_LAYER_SIZE,
  KWZ_PALETTE,
  KWZ_WIDTH,
  type KwzFile,
} from './kwz-types.ts';

/** Folder icons use the top-left 24x24 pixels of a full frame. */
export const KWZ_ICON_SIZE = 24;
/** File name of a folder's icon inside its directory on the SD card. */
export const KWZ_ICON_FILENAME = '!.ico';
/** Layer colors of icons drawn by the app: A white/black, B blue/red, C yellow/green. */
export const KWZ_ICON_COLORS: readonly [number, number, number, number, number, number] = [
  0, 1, 5, 2, 3, 4,
];

export interface KwzIconOptions {
  /** ID stored with the frame, normally the console owner's (default zeros). */
  authorId?: string;
}

/**
 * Builds a folder icon from 24x24 KWZ color indices; 6 (or white) leaves the paper showing.
 * The frame is laid out like the app's own icons so the console accepts it.
 */
export function createKwzIcon(pixels: Uint8Array, options: KwzIconOptions = {}): KwzFile {
  check(
    pixels.length === KWZ_ICON_SIZE * KWZ_ICON_SIZE,
    'INVALID_ARGUMENT',
    'Icons are 24x24 pixels',
  );
  const frame = createKwzFrame({
    paper: KWZ_COLOR_WHITE,
    colors: [...KWZ_ICON_COLORS],
    authorId: options.authorId ?? KWZ_EMPTY_AUTHOR_ID,
  });
  for (let y = 0; y < KWZ_ICON_SIZE; y++) {
    for (let x = 0; x < KWZ_ICON_SIZE; x++) {
      const color = pixels[y * KWZ_ICON_SIZE + x];
      if (color === KWZ_COLOR_NONE || color === KWZ_COLOR_WHITE || color > KWZ_COLOR_NONE) continue;
      const slot = KWZ_ICON_COLORS.indexOf(color);
      frame.layers[slot >> 1][y * KWZ_WIDTH + x] = (slot & 1) + 1;
    }
  }
  const { layerData, keyLayers } = encodeKwzKeyFrame(frame);
  return {
    format: 'kwz',
    variant: 'icon',
    meta: createEmptyKwzMeta(),
    thumbnail: null,
    frames: [
      {
        paper: frame.paper,
        colors: frame.colors,
        layerDepths: [0, 0, 0],
        soundFlags: 0,
        cameraFlags: 0,
        authorId: frame.authorId,
        layerData,
        keyLayers,
        extraFlags: 0,
        reserved: 0,
      },
    ],
    tracks: null,
    signature: null,
    source: null,
  };
}

/** Quantizes any image to icon colors (fitted to 24x24 beforehand by the caller). */
export function imageToKwzIconPixels(image: RgbaImage, dither: DitherMode = 'none'): Uint8Array {
  check(
    image.width === KWZ_ICON_SIZE && image.height === KWZ_ICON_SIZE,
    'INVALID_ARGUMENT',
    'Icon images must be 24x24',
  );
  return quantizeImage(image, KWZ_PALETTE, [0, 1, 2, 3, 4, 5], {
    dither,
    transparentIndex: KWZ_COLOR_NONE,
  });
}

/** Renders the visible 24x24 part of a folder icon (paper shown as `paperIndex`). */
export function renderKwzIcon(file: KwzFile, paperIndex?: number): IndexedImage {
  const frame = new KwzFrameDecoder(file, { isTolerant: true }).decode(0);
  const full = renderKwzFrame(frame, new Uint8Array(KWZ_LAYER_SIZE));
  const pixels = new Uint8Array(KWZ_ICON_SIZE * KWZ_ICON_SIZE);
  const paper = frame.paper <= KWZ_COLOR_NONE ? frame.paper : 0;
  for (let y = 0; y < KWZ_ICON_SIZE; y++) {
    for (let x = 0; x < KWZ_ICON_SIZE; x++) {
      const value = full[y * KWZ_WIDTH + x];
      pixels[y * KWZ_ICON_SIZE + x] =
        paperIndex !== undefined && value === paper ? paperIndex : value;
    }
  }
  return { width: KWZ_ICON_SIZE, height: KWZ_ICON_SIZE, pixels, palette: KWZ_PALETTE };
}
