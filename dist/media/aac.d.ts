import type { Pcm } from '../audio/pcm.ts';
export interface AacOptions {
    /** Target bits per second (default 96000). */
    bitrate?: number;
}
export interface AacStream {
    sampleRate: number;
    /** AudioSpecificConfig for the MP4 esds box. */
    config: Uint8Array;
    /** Raw AAC frames of 1024 samples each. */
    frames: Uint8Array[];
    /** Samples of encoder delay at the start (to be trimmed with an edit list). */
    priming: number;
}
export declare const AAC_SAMPLE_RATES: number[];
/** Encodes mono PCM as AAC-LC with long windows and per-frame rate control. */
export declare function encodeAac(pcm: Pcm, options?: AacOptions): AacStream;
