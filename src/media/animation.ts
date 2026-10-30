import { fail } from '../core/errors.ts';
import type { AnimationInfo, RgbaImage } from '../image/image.ts';
import { decodeGifFrames, readGifInfo } from './gif.ts';
import { decodeJpeg } from './jpeg.ts';
import { decodeApngFrames, readPngInfo } from './png.ts';

export type ImageFormat = 'gif' | 'png' | 'jpeg';

/** An animation whose frames are decoded one at a time. */
export interface AnimationSource extends AnimationInfo {
  /** Yields frames in order; an image may be reused by the next iteration. */
  frames(): Iterable<RgbaImage>;
}

export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'gif';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'png';
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg';
  return null;
}

/** Opens a GIF, APNG, PNG or JPEG file as an animation (still images have one frame). */
export function openAnimation(bytes: Uint8Array, stillDuration = 1): AnimationSource {
  const format = detectImageFormat(bytes);
  if (format === 'gif') return { ...readGifInfo(bytes), frames: () => decodeGifFrames(bytes) };
  if (format === 'png') {
    const info = readPngInfo(bytes);
    const durations = info.durations.length === 1 ? [stillDuration] : info.durations;
    return { ...info, durations, frames: () => decodeApngFrames(bytes) };
  }
  if (format === 'jpeg') {
    const image = decodeJpeg(bytes);
    return {
      width: image.width,
      height: image.height,
      durations: [stillDuration],
      loopCount: null,
      frames: () => [image],
    };
  }
  return fail('UNSUPPORTED', 'Unknown image format (expected GIF, PNG, APNG or JPEG)');
}

/** Joins still images into an animation that shows each for `duration` seconds. */
export function createImageSequence(
  images: readonly RgbaImage[],
  duration: number,
): AnimationSource {
  const first = images[0] ?? { width: 1, height: 1 };
  return {
    width: first.width,
    height: first.height,
    durations: images.map(() => duration),
    loopCount: 0,
    frames: () => images,
  };
}
