import { type Pcm, type ResampleMethod } from '../audio/pcm.ts';
import { type PpmFile, type PpmTrackName } from './ppm-types.ts';
export declare function hasPpmTrack(file: PpmFile, track: PpmTrackName): boolean;
/** Decodes a track at its native 8180 Hz rate. */
export declare function decodePpmTrack(file: PpmFile, track: PpmTrackName): Pcm;
/** Longest recording a track can hold, in seconds (about 60 s BGM, 2 s sound effects). */
export declare function getPpmTrackMaxDuration(track: PpmTrackName): number;
/** Resamples to 8180 Hz and encodes, cutting the sound to the track's maximum length. */
export declare function encodePpmTrack(pcm: Pcm, track: PpmTrackName, method?: ResampleMethod): Uint8Array;
