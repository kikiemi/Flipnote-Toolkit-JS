import type { Rect } from '../image/image.ts';
/** One layer of a frame: a pixel value per byte (0 = empty). */
export interface Bitmap {
    width: number;
    height: number;
    pixels: Uint8Array;
}
export type BrushShape = 'round' | 'square';
/** 4x4 screen-aligned patterns, like the toned pens of the apps. */
export declare const TONES: {
    readonly solid: readonly [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    readonly dark: readonly [1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1];
    readonly checker: readonly [1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1];
    readonly medium: readonly [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    readonly light: readonly [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0];
    readonly horizontal: readonly [1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0];
    readonly vertical: readonly [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
    readonly diagonal: readonly [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
};
export type ToneName = keyof typeof TONES;
export interface Brush {
    /** Diameter in pixels (default 1). */
    size?: number;
    shape?: BrushShape;
    /** Pattern the stroke is masked with (default 'solid'). */
    tone?: ToneName;
    /** Value written: 0 erases, 1 or 2 pick the layer's first or second color. */
    value: number;
}
export declare function createBitmap(width: number, height: number, pixels?: Uint8Array): Bitmap;
export declare function drawDot(bitmap: Bitmap, x: number, y: number, brush: Brush): void;
export declare function drawLine(bitmap: Bitmap, x0: number, y0: number, x1: number, y1: number, brush: Brush): void;
/** Draws a connected stroke through `points` ([x0, y0, x1, y1, ...]). */
export declare function drawStroke(bitmap: Bitmap, points: ArrayLike<number>, brush: Brush): void;
export declare function drawRect(bitmap: Bitmap, rect: Rect, brush: Brush, isFilled?: boolean): void;
export declare function drawEllipse(bitmap: Bitmap, rect: Rect, brush: Brush, isFilled?: boolean): void;
/** Fills the area of equal pixels around (x, y) with `value`; returns the pixels changed. */
export declare function fillArea(bitmap: Bitmap, x: number, y: number, value: number, tone?: ToneName): number;
export declare function clearBitmap(bitmap: Bitmap, value?: number): void;
/** Moves every pixel by (dx, dy); pixels moved off the edge are lost. */
export declare function shiftBitmap(bitmap: Bitmap, dx: number, dy: number): void;
export declare function flipBitmap(bitmap: Bitmap, axis: 'horizontal' | 'vertical'): void;
export declare function copyRegion(bitmap: Bitmap, rect: Rect): Bitmap;
/** Draws `region` at (x, y); with `isTransparent`, empty pixels leave the target unchanged. */
export declare function pasteRegion(bitmap: Bitmap, region: Bitmap, x: number, y: number, isTransparent?: boolean): void;
/** Replaces one pixel value with another (e.g. swapping a layer's two colors). */
export declare function replaceValue(bitmap: Bitmap, from: number, to: number): void;
/** Bounding box of non-empty pixels, or null when the bitmap is empty. */
export declare function findBounds(bitmap: Bitmap): Rect | null;
/**
 * Scales the `from` area of `source` into the `to` area of `target`, keeping pixel values:
 * enlarging repeats pixels; shrinking keeps a pixel where enough of its area is drawn, so thin
 * lines survive, and takes the value covering most of it.
 */
export declare function resampleBitmap(source: Bitmap, from: Rect, target: Bitmap, to: Rect): void;
