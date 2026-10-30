import type { AnimationInfo, DecodedAnimation, IndexedImage, RgbaImage } from '../image/image.ts';
import { type DeflateOptions } from './deflate.ts';
export interface PngOptions extends DeflateOptions {
}
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
/** Encodes an indexed (palette) or RGBA image as PNG. */
export declare function encodePng(image: RgbaImage | IndexedImage, options?: PngOptions): Uint8Array;
/** Encodes an animated PNG; each frame stores only the rectangle that changed. */
export declare function encodeApng(width: number, height: number, palette: Uint8Array, frames: Iterable<ApngFrame>, options?: ApngOptions): Uint8Array;
/** Decodes a PNG (any standard color type and bit depth, interlaced or not) to RGBA. */
export declare function decodePng(bytes: Uint8Array): RgbaImage;
/** Frame count, timing and size of a PNG or APNG without decoding pixels. */
export declare function readPngInfo(bytes: Uint8Array): AnimationInfo;
/**
 * Yields every APNG frame composited onto the full canvas (a still PNG yields one frame).
 * The yielded image is reused; copy it to keep it past the next iteration.
 */
export declare function decodeApngFrames(bytes: Uint8Array): Generator<RgbaImage>;
/** Decodes every frame of an APNG (or the single image of a PNG). */
export declare function decodeApng(bytes: Uint8Array): DecodedAnimation;
