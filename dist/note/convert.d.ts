import { type WarningHandler } from '../core/errors.ts';
import { type Rect } from '../image/image.ts';
import { type DitherMode } from '../image/quantize.ts';
import { type KwzFile, type KwzFrame } from '../kwz/kwz-types.ts';
import { type PpmFile, type PpmFrame } from '../ppm/ppm-types.ts';
import { type NoteFile } from './note.ts';
export interface ConvertOptions {
    /** Replace the current author (e.g. your own console's ID) so the note can be edited. */
    authorId?: string;
    authorName?: string;
    keyFrameInterval?: number;
    onWarning?: WarningHandler;
}
/**
 * Where the picture goes on the other format's screen: `center` places it 1:1 like the DSi
 * Library did; `canvas` scales it to the area the 3DS lets you draw on (310x230 inside a
 * 5-pixel border); `screen` scales it to the whole screen (exactly 1.25x or 0.8x).
 */
export type ScreenFit = 'center' | 'canvas' | 'screen';
export interface FrameConvertOptions {
    /** Default 'center'. */
    fit?: ScreenFit;
}
export interface KwzFrameConvertOptions extends FrameConvertOptions {
    /** Layers to include (default all). */
    visible?: readonly boolean[];
}
export interface FlattenOptions extends KwzFrameConvertOptions {
    dither?: DitherMode;
}
export interface ToPpmOptions extends ConvertOptions {
    /** Default 'auto': `center` for DSi Library layouts, otherwise `canvas`. */
    fit?: ScreenFit | 'auto';
    /**
     * `keep` maps KWZ layers onto PPM's two layers so the result stays editable (default);
     * `flatten` composites the frame and re-quantizes its colors.
     */
    layers?: 'keep' | 'flatten';
    /** Dithering for `flatten`. */
    dither?: DitherMode;
}
export interface ToKwzOptions extends ConvertOptions {
    /** Default 'center', the DSi Library placement, which converts back without loss. */
    fit?: ScreenFit;
    /** Store PPM filenames in the header like Nintendo's DSi Library converter (default false). */
    isKeepingPpmFilenames?: boolean;
}
/** Area of a KWZ frame that a PPM picture occupies for a fit. */
export declare function getKwzPlacement(fit: ScreenFit): Rect;
/** Part of a KWZ frame that a fit turns into the PPM picture, and where it lands. */
export declare function getPpmPlacement(fit: ScreenFit): {
    from: Rect;
    to: Rect;
};
/**
 * Places a PPM frame on a KWZ frame layer for layer (1:1 at the DSi Library position by default),
 * laid out like Nintendo's DSi Library converter: each layer's first color is the paper, its
 * second the pen, and pixels use the second.
 */
export declare function ppmFrameToKwz(frame: PpmFrame, options?: FrameConvertOptions): KwzFrame;
/**
 * Converts a KWZ frame to PPM keeping its layers where possible: the front layer (by 3D depth)
 * becomes PPM layer 1 and the others layer 2, each drawn with the nearest PPM pen. When that
 * would lose colors (PPM has one pen per layer), the two main ink colors get a layer each
 * instead. A back layer filled as a background sets the paper. `isExact` tells whether the
 * result looks the same and keeps the layers.
 */
export declare function kwzFrameToPpm(frame: KwzFrame, options?: KwzFrameConvertOptions): {
    frame: PpmFrame;
    isExact: boolean;
};
/** Composites a KWZ frame and re-quantizes it to PPM colors (closest colors, no layers). */
export declare function flattenKwzFrameToPpm(frame: KwzFrame, options?: FlattenOptions): PpmFrame;
/**
 * PPM to KWZ layer for layer, the way the DSi Library did it: frames are centered without loss
 * (or scaled with `fit`), speeds map exactly and audio is resampled.
 */
export declare function convertPpmToKwz(file: PpmFile, options?: ToKwzOptions): KwzFile;
/**
 * KWZ to PPM. Layers are kept by default (see kwzFrameToPpm), so DSi Library notes and PPM
 * conversions come back without loss and other notes stay editable; `layers: 'flatten'`
 * composites and re-quantizes instead.
 */
export declare function convertKwzToPpm(file: KwzFile, options?: ToPpmOptions): PpmFile;
/** Converts any note to PPM (PPM input is returned unchanged). */
export declare function convertToPpm(note: NoteFile, options?: ToPpmOptions): PpmFile;
/** Converts any note to KWZ (KWZ input is returned unchanged). */
export declare function convertToKwz(note: NoteFile, options?: ToKwzOptions): KwzFile;
