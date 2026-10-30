import type { AnimationInfo, DecodedAnimation, RgbaImage } from '../image/image.ts';
export interface GifFrame {
    /** Palette indices for the full canvas. */
    pixels: Uint8Array;
    /** Display time in seconds. */
    duration: number;
}
export interface GifOptions {
    /** 0 loops forever (default); null writes no loop extension. */
    loopCount?: number | null;
}
/** Encodes an animated GIF. Later frames store only changed pixels when the palette has room. */
export declare function encodeGif(width: number, height: number, palette: Uint8Array, frames: Iterable<GifFrame>, options?: GifOptions): Uint8Array;
/** Size, frame count and timing of a GIF without decompressing pixels. */
export declare function readGifInfo(bytes: Uint8Array): AnimationInfo;
/**
 * Yields every GIF frame composited onto the full canvas, honoring disposal and transparency.
 * The yielded image is reused; copy it to keep it past the next iteration.
 */
export declare function decodeGifFrames(bytes: Uint8Array): Generator<RgbaImage>;
/** Decodes every frame of a GIF to full-canvas RGBA. */
export declare function decodeGif(bytes: Uint8Array): DecodedAnimation;
