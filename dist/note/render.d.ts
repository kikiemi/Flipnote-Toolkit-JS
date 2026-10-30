import { type IndexedImage, type Rect, type RgbaImage } from '../image/image.ts';
import { type StereoEye } from '../kwz/kwz-render.ts';
import { type KwzPaletteName } from '../kwz/kwz-types.ts';
import { type NoteFile } from './note.ts';
/**
 * Part of the frame to output: `full`; `canvas` (the 3DS drawable area); `dsi` (the PPM area
 * of DSi Library notes); `auto` (24x24 for folder icons, `dsi` for DSi Library notes); or a rectangle.
 */
export type CropMode = 'full' | 'canvas' | 'dsi' | 'auto' | Rect;
export interface RenderOptions {
    /** KWZ 3D view: which eye to render (default 'center', no shift). */
    eye?: StereoEye;
    /** KWZ 3D slider position from 0 to 1 (default 1). */
    depthStrength?: number;
    /** Draw layers the note marks as hidden (default false). */
    isShowingHiddenLayers?: boolean;
    /** KWZ colors: 'screen' as the 3DS shows them (default) or 'app' as stored in the app. */
    palette?: KwzPaletteName;
    /** Default 'full', except folder icons, which default to their 24x24 area. */
    crop?: CropMode;
}
/** Renders frames of one note to palette indices, reusing decoder state between calls. */
export interface FrameRenderer {
    readonly width: number;
    readonly height: number;
    readonly frameCount: number;
    readonly frameRate: number;
    readonly palette: Uint8Array;
    /** Palette indices of one frame; the returned buffer is `target` when given. */
    render(index: number, target?: Uint8Array): Uint8Array;
}
export declare function createFrameRenderer(note: NoteFile, options?: RenderOptions): FrameRenderer;
/** Renders one frame as palette indices plus the note palette. */
export declare function renderFrame(note: NoteFile, index: number, options?: RenderOptions): IndexedImage;
export declare function renderFrameRgba(note: NoteFile, index: number, options?: RenderOptions): RgbaImage;
