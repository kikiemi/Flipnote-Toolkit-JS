import { type KwzFile } from '../kwz/kwz-types.ts';
import { type PpmFile } from '../ppm/ppm-types.ts';
import type { NoteFile } from './note.ts';
export interface MemoryUsage {
    /** Bytes the app counts against its limit. */
    used: number;
    limit: number;
    /** Fill level of the app's memory meter (1 = full; can slightly exceed 1). */
    level: number;
}
export declare function getPpmMemoryUsage(file: PpmFile): MemoryUsage;
export declare function getKwzMemoryUsage(file: KwzFile): MemoryUsage;
/** The memory meter shown while editing: animation data for PPM, frame data for KWZ. */
export declare function getMemoryUsage(note: NoteFile): MemoryUsage;
