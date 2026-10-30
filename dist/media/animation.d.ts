import type { AnimationInfo, RgbaImage } from '../image/image.ts';
export type ImageFormat = 'gif' | 'png' | 'jpeg';
/** An animation whose frames are decoded one at a time. */
export interface AnimationSource extends AnimationInfo {
    /** Yields frames in order; an image may be reused by the next iteration. */
    frames(): Iterable<RgbaImage>;
}
export declare function detectImageFormat(bytes: Uint8Array): ImageFormat | null;
/** Opens a GIF, APNG, PNG or JPEG file as an animation (still images have one frame). */
export declare function openAnimation(bytes: Uint8Array, stillDuration?: number): AnimationSource;
/** Joins still images into an animation that shows each for `duration` seconds. */
export declare function createImageSequence(images: readonly RgbaImage[], duration: number): AnimationSource;
