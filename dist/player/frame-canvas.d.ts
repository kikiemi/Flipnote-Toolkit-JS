export type CanvasBackend = 'webgl' | '2d';
/**
 * How frames are enlarged: `css` draws at the frame's own size and lets CSS scale it
 * (`image-rendering: pixelated`); `sharp` draws at the canvas's displayed size with WebGL,
 * keeping pixels square and evenly sized at any scale. `sharp` needs a canvas sized by CSS and
 * falls back to `css` without WebGL.
 */
export type CanvasScaling = 'css' | 'sharp';
export interface FrameCanvasOptions {
    /** Default 'auto': WebGL when available, otherwise Canvas 2D. */
    backend?: CanvasBackend | 'auto';
    /** Default 'css'. */
    scaling?: CanvasScaling;
}
/** Shows palette-indexed frames on a canvas. */
export interface FrameCanvas {
    readonly backend: CanvasBackend;
    /** Sets the frame size and the RGBA palette (up to 256 colors). */
    configure(width: number, height: number, palette: Uint8Array): void;
    /** Draws one frame of palette indices. */
    draw(pixels: Uint8Array): void;
    destroy(): void;
}
/** Uses WebGL when it is available (and allowed by `backend`), otherwise Canvas 2D. */
export declare function createFrameCanvas(canvas: HTMLCanvasElement, options?: FrameCanvasOptions): FrameCanvas;
