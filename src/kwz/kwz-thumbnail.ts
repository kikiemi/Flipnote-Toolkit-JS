import { check } from '../core/errors.ts';
import { createRgbaImage, type RgbaImage } from '../image/image.ts';
import { decodeJpeg, encodeJpeg } from '../media/jpeg.ts';
import {
  KWZ_HEIGHT,
  KWZ_PALETTE,
  KWZ_THUMBNAIL_HEIGHT,
  KWZ_THUMBNAIL_WIDTH,
  KWZ_WIDTH,
} from './kwz-types.ts';

const VISIBLE_HEIGHT = KWZ_HEIGHT / 4;

/** Builds the 80x64 thumbnail image: a 4x4 box downscale with 4 black rows below, as the 3DS does. */
export function createKwzThumbnailImage(pixels: Uint8Array): RgbaImage {
  check(pixels.length === KWZ_WIDTH * KWZ_HEIGHT, 'INVALID_ARGUMENT', 'Expected a 320x240 frame');
  const image = createRgbaImage(KWZ_THUMBNAIL_WIDTH, KWZ_THUMBNAIL_HEIGHT);
  const out = image.data;
  for (let ty = 0; ty < VISIBLE_HEIGHT; ty++) {
    for (let tx = 0; tx < KWZ_THUMBNAIL_WIDTH; tx++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let y = 0; y < 4; y++) {
        const row = (ty * 4 + y) * KWZ_WIDTH + tx * 4;
        for (let x = 0; x < 4; x++) {
          const color = pixels[row + x] * 4;
          r += KWZ_PALETTE[color];
          g += KWZ_PALETTE[color + 1];
          b += KWZ_PALETTE[color + 2];
        }
      }
      const o = (ty * KWZ_THUMBNAIL_WIDTH + tx) * 4;
      out[o] = (r + 8) >> 4;
      out[o + 1] = (g + 8) >> 4;
      out[o + 2] = (b + 8) >> 4;
      out[o + 3] = 255;
    }
  }
  for (let o = VISIBLE_HEIGHT * KWZ_THUMBNAIL_WIDTH * 4; o < out.length; o += 4) out[o + 3] = 255;
  return image;
}

/** Encodes a thumbnail JPEG from a composited frame (KWZ palette indices). */
export function createKwzThumbnail(pixels: Uint8Array, quality = 85): Uint8Array {
  return encodeJpeg(createKwzThumbnailImage(pixels), {
    quality,
    subsampling: '422',
    isJfif: false,
  });
}

export function decodeKwzThumbnail(jpeg: Uint8Array): RgbaImage {
  return decodeJpeg(jpeg);
}
