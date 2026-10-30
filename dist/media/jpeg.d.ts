import { type RgbaImage } from '../image/image.ts';
export type ChromaSubsampling = '444' | '422' | '420';
export interface JpegOptions {
    /** 1-100 on the IJG scale (default 85, as written by Flipnote Studio 3D). */
    quality?: number;
    subsampling?: ChromaSubsampling;
    /** Write a JFIF APP0 segment (default true). */
    isJfif?: boolean;
}
/** Encodes a baseline JPEG; transparent pixels are composited over white. */
export declare function encodeJpeg(image: RgbaImage, options?: JpegOptions): Uint8Array;
/** Decodes a baseline (sequential Huffman) JPEG to RGBA. */
export declare function decodeJpeg(bytes: Uint8Array): RgbaImage;
/** Byte offset just past the last end-of-image marker, ignoring any padding after it. */
export declare function findJpegEnd(data: Uint8Array): number;
