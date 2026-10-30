import type { EqualizerSetting } from '../audio/equalizer.ts';
import { type MixOptions } from './audio.ts';
import type { NoteFile } from './note.ts';
import { type RenderOptions } from './render.ts';
/** How the two eyes of a 3D note are arranged in one picture. */
export type StereoLayout = 'left' | 'right' | 'side-by-side' | 'side-by-side-half' | 'top-bottom' | 'anaglyph';
export interface AnimationExportOptions extends Omit<RenderOptions, 'eye'> {
    /** Integer upscale factor (default 1). */
    scale?: number;
    /** Play the animation this many times (default 1). */
    repeat?: number;
    /** Keep KWZ transparent paper transparent instead of white (GIF/APNG/PNG only). */
    isTransparent?: boolean;
    /** Export both eyes of a KWZ note for 3D viewing (default: the center view only). */
    stereo?: StereoLayout;
}
export interface GifExportOptions extends AnimationExportOptions {
    /** 0 loops forever (default); null plays once. */
    loopCount?: number | null;
}
export interface Mp4ExportOptions extends AnimationExportOptions {
    /** Constant output frame rate; frames are repeated or dropped to match (default: the note's rate). */
    frameRate?: number;
    /** H.264 quantizer 0-51 (default 20). */
    qp?: number;
    /** Frames between key frames (default about 10 seconds). */
    keyFrameInterval?: number;
    /** Include the mixed soundtrack when the note has audio (default true). */
    isAudioIncluded?: boolean;
    audioBitrate?: number;
    /** AAC sample rate (default 48000). */
    audioSampleRate?: number;
    equalizer?: EqualizerSetting;
}
/** Renders composed (stereo, scaled) frames of a note to palette indices. */
export interface ExportRenderer {
    readonly width: number;
    readonly height: number;
    readonly frameCount: number;
    readonly frameRate: number;
    readonly palette: Uint8Array;
    render(index: number): Uint8Array;
}
/** Palette of every left/right color pair mixed for red-cyan glasses; index = left * n + right. */
export declare function createAnaglyphPalette(palette: Uint8Array): Uint8Array;
export declare function createExportRenderer(note: NoteFile, options?: AnimationExportOptions): ExportRenderer;
/** Animated GIF with the note's exact colors and timing. */
export declare function exportGif(note: NoteFile, options?: GifExportOptions): Uint8Array;
/** Animated PNG (lossless, full alpha). */
export declare function exportApng(note: NoteFile, options?: GifExportOptions): Uint8Array;
/** One rendered frame as PNG. */
export declare function exportFramePng(note: NoteFile, index: number, options?: AnimationExportOptions): Uint8Array;
/** Every rendered frame as PNG, in order. */
export declare function exportFramePngs(note: NoteFile, options?: AnimationExportOptions): Generator<Uint8Array>;
/** The stored thumbnail as PNG (64x48 for PPM, 80x64 for KWZ). */
export declare function exportThumbnailPng(note: NoteFile): Uint8Array;
/** A frame as a stereo MPO photo (left and right JPEGs), viewable in 3D on a 3DS and 3D displays. */
export declare function exportMpo(note: NoteFile, index: number, options?: Omit<AnimationExportOptions, 'stereo'> & {
    quality?: number;
}): Uint8Array;
/** Mixed soundtrack as 16-bit WAV. */
export declare function exportWav(note: NoteFile, options?: MixOptions): Uint8Array;
/** H.264 + AAC MP4 that plays in browsers, phones and video editors (no dependencies). */
export declare function exportMp4(note: NoteFile, options?: Mp4ExportOptions): Uint8Array;
