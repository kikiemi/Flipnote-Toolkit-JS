import { type RgbaImage } from '../image/image.ts';
/** Builds the 80x64 thumbnail image: a 4x4 box downscale with 4 black rows below, as the 3DS does. */
export declare function createKwzThumbnailImage(pixels: Uint8Array): RgbaImage;
/** Encodes a thumbnail JPEG from a composited frame (KWZ palette indices). */
export declare function createKwzThumbnail(pixels: Uint8Array, quality?: number): Uint8Array;
export declare function decodeKwzThumbnail(jpeg: Uint8Array): RgbaImage;
