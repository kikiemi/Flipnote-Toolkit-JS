import type { IndexedImage, RgbaImage } from '../image/image.ts';
import { type DitherMode } from '../image/quantize.ts';
import { type KwzFile } from './kwz-types.ts';
/** Folder icons use the top-left 24x24 pixels of a full frame. */
export declare const KWZ_ICON_SIZE = 24;
/** File name of a folder's icon inside its directory on the SD card. */
export declare const KWZ_ICON_FILENAME = "!.ico";
/** Layer colors of icons drawn by the app: A white/black, B blue/red, C yellow/green. */
export declare const KWZ_ICON_COLORS: readonly [number, number, number, number, number, number];
export interface KwzIconOptions {
    /** ID stored with the frame, normally the console owner's (default zeros). */
    authorId?: string;
}
/**
 * Builds a folder icon from 24x24 KWZ color indices; 6 (or white) leaves the paper showing.
 * The frame is laid out like the app's own icons so the console accepts it.
 */
export declare function createKwzIcon(pixels: Uint8Array, options?: KwzIconOptions): KwzFile;
/** Quantizes any image to icon colors (fitted to 24x24 beforehand by the caller). */
export declare function imageToKwzIconPixels(image: RgbaImage, dither?: DitherMode): Uint8Array;
/** Renders the visible 24x24 part of a folder icon (paper shown as `paperIndex`). */
export declare function renderKwzIcon(file: KwzFile, paperIndex?: number): IndexedImage;
