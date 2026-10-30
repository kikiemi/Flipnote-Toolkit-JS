import type { RgbaImage } from './image.ts';
export type DitherMode = 'none' | 'ordered' | 'diffusion';
export interface QuantizeOptions {
    dither?: DitherMode;
    /** Index written for pixels with alpha below 128 (default: nearest color to white). */
    transparentIndex?: number;
}
export declare function nearestColor(palette: Uint8Array, allowed: readonly number[], r: number, g: number, b: number): number;
/** Maps RGBA pixels to the `allowed` palette entries, optionally dithered. */
export declare function quantizeImage(image: RgbaImage, palette: Uint8Array, allowed: readonly number[], options?: QuantizeOptions): Uint8Array;
