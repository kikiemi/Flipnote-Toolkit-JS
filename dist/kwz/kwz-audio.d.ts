import { type Pcm, type ResampleMethod } from '../audio/pcm.ts';
import { type KwzFile, type KwzTrackName } from './kwz-types.ts';
export interface KwzTrackOptions {
    /** Initial ADPCM step index, or 'auto' to estimate it (default 40; 'auto' for DSi Library notes). */
    initialStepIndex?: number | 'auto';
    /** Initial ADPCM predictor, or 'auto' to remove a DC offset left by a wrong start state (default 0). */
    initialPredictor?: number | 'auto';
    /** Override the sample rate the track is tagged with. */
    sampleRate?: number;
}
/** Decoder state a track starts from. */
export interface KwzAdpcmState {
    stepIndex: number;
    predictor: number;
}
export declare function hasKwzTrack(file: KwzFile, track: KwzTrackName): boolean;
/** Native sample rate: 16364 Hz, or 16384 Hz for DSi Library conversions. */
export declare function getKwzSampleRate(file: KwzFile): number;
/**
 * Estimates the decoder state a track was encoded from. DSi Library conversions start from an
 * arbitrary state, which sounds distorted when decoded from the usual one: the step index (0-40)
 * giving the quietest signal is chosen, then the predictor that removes the DC offset.
 */
export declare function guessKwzAdpcmState(data: Uint8Array): KwzAdpcmState;
/** Decodes a track at its native rate; DSi Library notes estimate their step index by default. */
export declare function decodeKwzTrack(file: KwzFile, track: KwzTrackName, options?: KwzTrackOptions): Pcm;
/** Longest recording a track can hold, in seconds (60 s BGM, 2 s sound effects). */
export declare function getKwzTrackMaxDuration(track: KwzTrackName): number;
/** Resamples to 16364 Hz and encodes, cutting the sound to the track's maximum length. */
export declare function encodeKwzTrack(pcm: Pcm, track: KwzTrackName, method?: ResampleMethod): Uint8Array;
