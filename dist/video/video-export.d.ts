import type { AudioCodec, VideoCodec } from 'mediabunny';
import type { EqualizerSetting } from '../audio/equalizer.ts';
import { type AnimationExportOptions } from '../note/export.ts';
import type { NoteFile } from '../note/note.ts';
export type VideoContainer = 'mp4' | 'mov' | 'mkv' | 'webm';
export type VideoQuality = 'very-low' | 'low' | 'medium' | 'high' | 'very-high';
export interface VideoExportOptions extends AnimationExportOptions {
    /** Default 'mp4'. */
    container?: VideoContainer;
    /** Default 'avc', or 'vp9' for WebM. */
    videoCodec?: VideoCodec;
    /** Default 'aac', or 'opus' for WebM. */
    audioCodec?: AudioCodec;
    /** Encoder quality preset (default 'high'). */
    quality?: VideoQuality;
    /** Constant output frame rate (default: the note's own rate). */
    frameRate?: number;
    /** Include the mixed soundtrack when the note has audio (default true). */
    isAudioIncluded?: boolean;
    equalizer?: EqualizerSetting;
    /** Use the library's own H.264/AAC encoders even when WebCodecs is available. */
    isUsingBuiltinEncoders?: boolean;
    onProgress?: (done: number, total: number) => void;
}
/**
 * Exports a note to MP4, MOV, MKV or WebM through mediabunny. WebCodecs encoders are used
 * when available (browsers); otherwise H.264 and AAC fall back to the library's own encoders.
 */
export declare function exportVideo(note: NoteFile, options?: VideoExportOptions): Promise<Uint8Array>;
