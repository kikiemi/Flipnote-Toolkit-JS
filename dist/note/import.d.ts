import type { Pcm } from '../audio/pcm.ts';
import { type WarningHandler } from '../core/errors.ts';
import { type FitMode, type ResizeMethod, type RgbaImage } from '../image/image.ts';
import { type DitherMode } from '../image/quantize.ts';
import { type KwzFile, type KwzFrame, type KwzMeta } from '../kwz/kwz-types.ts';
import type { AnimationSource } from '../media/animation.ts';
import { type PpmFile, type PpmFrame, type PpmMeta } from '../ppm/ppm-types.ts';
import type { NoteFile, NoteFormat } from './note.ts';
export interface FrameImportOptions {
    dither?: DitherMode;
    /** Paper color index, or 'auto' for the most common color (default). */
    paper?: number | 'auto';
}
export interface NoteBuilderOptions extends FrameImportOptions {
    /** Frames per second; the nearest speed the format supports is used (default 12). */
    frameRate?: number;
    fit?: FitMode;
    resize?: ResizeMethod;
    /** Canvas color behind images that do not fill the frame, as 0xRRGGBBAA (default white). */
    background?: number;
    /** Refuse frames once the note would not fit in the app's memory (default true). */
    isRespectingLimits?: boolean;
    /** Frames the caller plans to add, so dithering can be dropped early to fit (optional). */
    expectedFrameCount?: number;
    keyFrameInterval?: number;
    ppmMeta?: Partial<PpmMeta>;
    kwzMeta?: Partial<KwzMeta>;
    onWarning?: WarningHandler;
}
/** Quantizes a 256x192 image into a PPM frame (paper plus up to two pen colors). */
export declare function imageToPpmFrame(image: RgbaImage, options?: FrameImportOptions): PpmFrame;
/** Quantizes a 320x240 image into a KWZ frame using fixed color slots per layer. */
export declare function imageToKwzFrame(image: RgbaImage, options?: FrameImportOptions): KwzFrame;
/** Nearest supported speed for a frame rate (compared on a log scale). */
export declare function findNearestSpeed(rates: readonly number[], frameRate: number, first?: number): number;
/**
 * Encodes frames one at a time, keeping only encoded data in memory. Images of any size are
 * fitted and quantized; frames beyond the app's memory limit are refused.
 */
export declare class NoteBuilder {
    readonly format: NoteFormat;
    readonly width: number;
    readonly height: number;
    readonly frameSpeed: number;
    readonly frameRate: number;
    /** True once a frame was refused because the note is full. */
    isFull: boolean;
    private readonly options;
    private readonly warn;
    private readonly ppmEncoder;
    private readonly kwzEncoder;
    private readonly ppmFrames;
    private readonly ppmSoundFlags;
    private readonly kwzFrames;
    private thumbnail;
    private dataSize;
    private dither;
    private tracks;
    private readonly ppmMeta;
    private readonly kwzMeta;
    constructor(format: NoteFormat, options?: NoteBuilderOptions);
    get frameCount(): number;
    private get maxFrames();
    private get maxDataSize();
    /** Drops dithering once the data grows faster than the expected frame count allows. */
    private updateDither;
    private refuse;
    /** Fits, quantizes and encodes an image; returns false when the note is full. */
    addImage(image: RgbaImage, soundFlags?: number): boolean;
    /** Encodes a decoded frame of the builder's format; returns false when the note is full. */
    addFrame(frame: PpmFrame | KwzFrame): boolean;
    /** Sets a track from PCM at any rate (null removes it); it is cut to the app's limit. */
    setTrack(name: 'bgm' | 'se1' | 'se2' | 'se3' | 'se4', pcm: Pcm | null): void;
    finish(): NoteFile;
}
export interface AnimationImportOptions extends Omit<NoteBuilderOptions, 'frameRate' | 'expectedFrameCount'> {
    /** Target frames per second, or 'auto' to follow the source timing (default). */
    frameRate?: number | 'auto';
    /** When the source needs more frames than allowed: 'slow' lowers the speed, 'trim' cuts the end. */
    overflow?: 'slow' | 'trim';
    /** Soundtrack to store as BGM. */
    bgm?: Pcm | null;
    /** Called after each output frame. */
    onProgress?: (done: number, total: number) => void;
}
/** Options for importing a video clip (with mediabunny or ffmpeg). */
export interface VideoImportOptions extends AnimationImportOptions {
    /** First second of the source to use (default 0). */
    start?: number;
    /** Last second of the source to use (default the end). */
    end?: number;
    /** Store the video's soundtrack as BGM, up to 60 seconds (default true). */
    isAudioIncluded?: boolean;
}
/**
 * Picks the supported speed nearest to `frameRate` and the number of frames that cover
 * `duration` seconds; with 'slow', the speed drops until the frames fit the app's limit.
 */
export declare function planFrameTiming(format: NoteFormat, duration: number, frameRate: number, overflow?: 'slow' | 'trim'): {
    frameRate: number;
    frameCount: number;
};
/**
 * Builds a note from an animation (GIF, APNG, image sequence or decoded video frames),
 * resampling its timing to a speed the app supports.
 */
export declare function importAnimation(source: AnimationSource, format: NoteFormat, options?: AnimationImportOptions): NoteFile;
export interface ImagesImportOptions extends NoteBuilderOptions {
    bgm?: Pcm | null;
}
/** Builds a PPM from RGBA images (any size; fitted to 256x192), one frame each. */
export declare function createPpmFromImages(images: Iterable<RgbaImage>, options?: ImagesImportOptions): PpmFile;
/** Builds a KWZ from RGBA images (any size; fitted to 320x240), one frame each. */
export declare function createKwzFromImages(images: Iterable<RgbaImage>, options?: ImagesImportOptions): KwzFile;
