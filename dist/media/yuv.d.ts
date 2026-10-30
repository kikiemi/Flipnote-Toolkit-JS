import type { RgbaImage } from '../image/image.ts';
import type { H264Encoder, YuvFrame } from './h264.ts';
export type ColorMatrix = 'bt601' | 'bt709';
/** Limited-range Y, Cb and Cr of every palette entry, indexed by palette index. */
export declare function paletteToYuv(palette: Uint8Array, matrix: ColorMatrix): [Uint8Array, Uint8Array, Uint8Array];
/** Fills a padded 4:2:0 frame from palette indices, repeating edge pixels into the padding. */
export declare function indicesToYuv(pixels: Uint8Array, width: number, height: number, encoder: H264Encoder, tables: [Uint8Array, Uint8Array, Uint8Array], frame: YuvFrame): void;
export interface YuvPlanes {
    format: 'I420' | 'I422' | 'I444' | 'NV12';
    width: number;
    height: number;
    data: Uint8Array;
    /** Offset and stride of each plane in `data`. */
    layout: {
        offset: number;
        stride: number;
    }[];
    matrix: ColorMatrix;
    isFullRange: boolean;
}
/** Converts 8-bit planar or semi-planar YUV to RGBA. */
export declare function yuvToRgba(planes: YuvPlanes): RgbaImage;
