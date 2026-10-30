import { type KwzEncodeOptions, type KwzTrackInput } from '../kwz/kwz-create.ts';
import type { KwzFile, KwzFrame } from '../kwz/kwz-types.ts';
import { type PpmEncodeOptions, type PpmTrackInput } from '../ppm/ppm-create.ts';
import type { PpmFile, PpmFrame } from '../ppm/ppm-types.ts';
import { type NoteFile } from './note.ts';
/** Decodes every frame into independent copies that can be edited freely. */
export declare function decodeFrames(note: PpmFile): PpmFrame[];
export declare function decodeFrames(note: KwzFile): KwzFrame[];
export declare function decodeFrames(note: NoteFile): PpmFrame[] | KwzFrame[];
/** Yields decoded frames in order without keeping them; each frame is reused by the next. */
export declare function iterateFrames(note: NoteFile): Generator<PpmFrame | KwzFrame>;
/** Copy of a note with new frames (of the note's own format); metadata and audio are kept. */
export declare function replaceFrames(note: PpmFile, frames: Iterable<PpmFrame>, options?: PpmEncodeOptions): PpmFile;
export declare function replaceFrames(note: KwzFile, frames: Iterable<KwzFrame>, options?: KwzEncodeOptions): KwzFile;
/** Copy of a note with the given tracks re-encoded from PCM (null removes one); others are kept. */
export declare function replaceTracks(note: PpmFile, tracks: PpmTrackInput, options?: PpmEncodeOptions): PpmFile;
export declare function replaceTracks(note: KwzFile, tracks: KwzTrackInput, options?: KwzEncodeOptions): KwzFile;
/**
 * Copy of a note with only frames `start` to `end` (exclusive). Frames are re-encoded, sound
 * effects stay on their frames and the BGM is cut to the same span.
 */
export declare function sliceFrames(note: NoteFile, start: number, end?: number): NoteFile;
