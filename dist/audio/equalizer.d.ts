import { type Pcm } from './pcm.ts';
export type EqualizerFilterType = 'peaking' | 'lowshelf' | 'highshelf';
/** One filter, defined like Web Audio's BiquadFilterNode so the player and exports sound the same. */
export interface EqualizerBand {
    type: EqualizerFilterType;
    /** Center frequency (peaking) or corner frequency (shelves) in Hz. */
    frequency: number;
    /** Boost or cut in dB. */
    gain: number;
    /** Peaking bandwidth (default √2, one octave); shelves always use a slope of 1. */
    q?: number;
}
/** Center frequencies of the ten-band graphic equalizer (octave bands). */
export declare const EQUALIZER_FREQUENCIES: readonly [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
/** Gain range of the graphic equalizer in dB. */
export declare const EQUALIZER_MAX_GAIN = 12;
export type EqualizerPreset = 'flat' | 'bass' | 'treble' | 'voice' | 'loudness' | 'soft';
/**
 * Graphic equalizer gains in dB. `soft` tames the harsh highs of the consoles' nearest-neighbour
 * upsampling.
 */
export declare const EQUALIZER_PRESETS: Readonly<Record<EqualizerPreset, readonly number[]>>;
/** Filters, a preset name, or ten graphic equalizer gains in dB. */
export type EqualizerSetting = readonly EqualizerBand[] | EqualizerPreset | readonly number[];
/** Resolves a setting into filters; gains become peaking filters at EQUALIZER_FREQUENCIES. */
export declare function createEqualizerBands(setting: EqualizerSetting): EqualizerBand[];
/** Peaking bandwidth a band is played with. */
export declare function getEqualizerQ(band: EqualizerBand): number;
/** Filters samples in place through every band in turn. */
export declare function applyEqualizer(samples: Float32Array, sampleRate: number, setting: EqualizerSetting): void;
/** Copy of `pcm` passed through the equalizer; boosts that clip are limited to 16 bits. */
export declare function equalizePcm(pcm: Pcm, setting: EqualizerSetting): Pcm;
