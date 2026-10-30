import type { IndexedImage } from '../image/image.ts';
/** Unpacks the 4-bit 8x8-tiled thumbnail into 64x48 palette indices. */
export declare function decodePpmThumbnail(raw: Uint8Array): IndexedImage;
export declare function encodePpmThumbnail(pixels: Uint8Array): Uint8Array;
/** Builds a raw thumbnail from a composited frame in PPM palette indices. */
export declare function createPpmThumbnail(pixels: Uint8Array): Uint8Array;
