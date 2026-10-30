/** 8-bit RGBA pixels, row-major (same layout as ImageData). */
export interface RgbaImage {
    width: number;
    height: number;
    data: Uint8Array;
}
/** Palette indices plus an RGBA palette (4 bytes per entry). */
export interface IndexedImage {
    width: number;
    height: number;
    pixels: Uint8Array;
    palette: Uint8Array;
}
/** Size and timing of an animated image. */
export interface AnimationInfo {
    width: number;
    height: number;
    /** Display time of each frame in seconds. */
    durations: number[];
    /** 0 loops forever; null when the file does not say. */
    loopCount: number | null;
}
export interface DecodedAnimation extends AnimationInfo {
    frames: RgbaImage[];
}
export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}
export type ResizeMethod = 'nearest' | 'area';
export type FitMode = 'contain' | 'cover' | 'stretch' | 'center';
export declare function createRgbaImage(width: number, height: number): RgbaImage;
export declare function createPalette(colors: readonly number[], transparentIndex?: number): Uint8Array;
export declare function indexedToRgba(image: IndexedImage, target?: Uint8Array): RgbaImage;
/** Nearest-neighbour integer upscale of palette indices into `target`. */
export declare function scaleIndicesInto(pixels: Uint8Array, width: number, height: number, factor: number, target?: Uint8Array): Uint8Array;
/** Nearest-neighbour integer upscale. */
export declare function scaleIndexed(image: IndexedImage, factor: number): IndexedImage;
/** Resizes RGBA pixels; `area` averages covered source pixels (premultiplied by alpha). */
export declare function resizeRgba(image: RgbaImage, width: number, height: number, method?: ResizeMethod): RgbaImage;
/** Places `image` on a `width`x`height` canvas filled with `background` (RGBA as 0xRRGGBBAA). */
export declare function fitRgba(image: RgbaImage, width: number, height: number, mode?: FitMode, method?: ResizeMethod, background?: number): RgbaImage;
/** Copies a rectangle out of an indexed image. */
export declare function cropIndexed(image: IndexedImage, rect: Rect): IndexedImage;
/** Copies a rectangle out of an RGBA image. */
export declare function cropRgba(image: RgbaImage, rect: Rect): RgbaImage;
