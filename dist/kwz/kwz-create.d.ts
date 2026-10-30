import type { Pcm } from '../audio/pcm.ts';
import { type WarningHandler } from '../core/errors.ts';
import { type KwzFile, type KwzFrame, type KwzFrameRecord, type KwzMeta, type KwzTrackName, type KwzTracks, type KwzVariant } from './kwz-types.ts';
export interface KwzEncodeOptions {
    /** Make every Nth frame independent of the previous one (0 = never forced). */
    keyFrameInterval?: number;
    /** Frame flag bit 7 for new frames (0x80 as written by app version 734). */
    frameExtraFlags?: number;
    onWarning?: WarningHandler;
}
export type KwzTrackInput = Partial<Record<KwzTrackName, Pcm | null>>;
export interface KwzSource extends KwzEncodeOptions {
    frames: Iterable<KwzFrame>;
    meta?: Partial<KwzMeta>;
    /** PCM at any sample rate; resampled to 16364 Hz. */
    tracks?: KwzTrackInput;
    variant?: KwzVariant;
}
/** Metadata for a new note; filenames encode the author ID and timestamps. */
export declare function createKwzMeta(overrides?: Partial<KwzMeta>): KwzMeta;
/** Encodes the given tracks over `base`; null or empty PCM removes a track. */
export declare function encodeKwzTracks(tracks: KwzTrackInput | undefined, base: KwzTracks | null, warn?: WarningHandler): KwzTracks;
/** Total encoded layer data, the figure Flipnote Studio 3D's memory meter is based on. */
export declare function getKwzFrameDataSize(frames: readonly KwzFrameRecord[]): number;
/** Encodes frames in order and renders the thumbnail frame for notes that have one. */
export declare function encodeKwzFrames(frames: Iterable<KwzFrame>, meta: KwzMeta, hasThumbnail: boolean, options?: KwzEncodeOptions): {
    frames: KwzFrameRecord[];
    thumbnail: Uint8Array | null;
};
/** Encodes decoded frames and PCM tracks into a new KWZ file (thumbnail included). */
export declare function createKwz(source: KwzSource): KwzFile;
/** Copy of `file` with new frames; metadata and audio are kept byte for byte. */
export declare function replaceKwzFrames(file: KwzFile, frames: Iterable<KwzFrame>, options?: KwzEncodeOptions): KwzFile;
/** Copy of `file` with the given tracks re-encoded (null removes one); other tracks are kept. */
export declare function replaceKwzTracks(file: KwzFile, tracks: KwzTrackInput, options?: Pick<KwzEncodeOptions, 'onWarning'>): KwzFile;
