import type { Pcm } from '../audio/pcm.ts';
import { type WarningHandler } from '../core/errors.ts';
import { type PpmAnimation, type PpmFile, type PpmFrame, type PpmMeta, type PpmTrackName, type PpmTracks } from './ppm-types.ts';
export interface PpmEncodeOptions {
    /** Force a key frame every N frames (0 = only when smaller). */
    keyFrameInterval?: number;
    onWarning?: WarningHandler;
}
export type PpmTrackInput = Partial<Record<PpmTrackName, Pcm | null>>;
export interface PpmSource extends PpmEncodeOptions {
    frames: Iterable<PpmFrame>;
    meta?: Partial<PpmMeta>;
    /** PCM at any sample rate; resampled to 8180 Hz. */
    tracks?: PpmTrackInput;
}
/** Metadata for a new note; one random author ID and filename unless overridden. */
export declare function createPpmMeta(overrides?: Partial<PpmMeta>): PpmMeta;
/** Encodes the given tracks over `base`; null or empty PCM removes a track. */
export declare function encodePpmTracks(tracks: PpmTrackInput | undefined, base: PpmTracks | null, warn?: WarningHandler): PpmTracks;
export declare function getPpmAnimationSize(animation: PpmAnimation): number;
/** Encodes frames in playback order and renders the thumbnail frame. */
export declare function encodePpmFrames(frames: Iterable<PpmFrame>, meta: PpmMeta, options?: PpmEncodeOptions): {
    animation: PpmAnimation;
    thumbnail: Uint8Array;
};
/** Encodes decoded frames and PCM tracks into a new PPM file (thumbnail included). */
export declare function createPpm(source: PpmSource): PpmFile;
/** Copy of `file` with new frames; metadata and audio are kept byte for byte. */
export declare function replacePpmFrames(file: PpmFile, frames: Iterable<PpmFrame>, options?: PpmEncodeOptions): PpmFile;
/** Copy of `file` with the given tracks re-encoded (null removes one); other tracks are kept. */
export declare function replacePpmTracks(file: PpmFile, tracks: PpmTrackInput, options?: Pick<PpmEncodeOptions, 'onWarning'>): PpmFile;
