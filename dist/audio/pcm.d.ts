/** Mono 16-bit PCM audio. */
export interface Pcm {
    samples: Int16Array;
    sampleRate: number;
}
export type ResampleMethod = 'sinc' | 'linear' | 'nearest';
/** Converts `pcm` to `sampleRate`; `sinc` band-limits, `linear` and `nearest` are cheap. */
export declare function resamplePcm(pcm: Pcm, sampleRate: number, method?: ResampleMethod): Pcm;
/** Accumulates `source` into `target` starting at `offset` samples. */
export declare function mixInto(target: Float32Array, source: Int16Array, offset: number, gain?: number): void;
export declare function floatToPcm(buffer: Float32Array, sampleRate: number): Pcm;
export interface PcmLevels {
    peak: number;
    rms: number;
}
export declare function measurePcm(samples: Int16Array): PcmLevels;
/** Mixes planar float channels (-1 to 1) down to mono 16-bit PCM. */
export declare function downmixToPcm(channels: readonly Float32Array[], sampleRate: number): Pcm;
/** Copies `pcm`, cut to at most `seconds`. */
export declare function trimPcm(pcm: Pcm, seconds: number): Pcm;
