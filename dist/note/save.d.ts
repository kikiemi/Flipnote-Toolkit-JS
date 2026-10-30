import { type KwzFile } from '../kwz/kwz-types.ts';
import type { PpmFile } from '../ppm/ppm-types.ts';
import type { NoteFile } from './note.ts';
export interface NoteAuthor {
    /** Flipnote Studio ID (16 hex digits) or Flipnote Studio 3D ID (20 hex digits). */
    id: string;
    name: string;
    /** PPM only: last 6 hex digits of the console's MAC address (default: the ID's last 6). */
    mac?: string;
}
export interface SaveOptions {
    /** Who saves the note (default: its current author). */
    author?: NoteAuthor;
    /** Nintendo timestamp of the save (default: now, local time). */
    time?: number;
    /** PPM: 'overwrite' keeps the file name, 'copy' saves under a new name (default 'overwrite'). */
    mode?: 'overwrite' | 'copy';
    /** Picks the moment within the second that new PPM filenames count from (default Math.random). */
    random?: () => number;
}
/** Locked notes can only be changed by their current author. */
export declare function canEditNote(note: NoteFile, authorId: string): boolean;
/** True when saving as `authorId` makes the note a spin-off of someone else's work. */
export declare function isSpinoff(note: NoteFile, authorId: string): boolean;
/**
 * Updates authorship, file names and timestamps the way the app does when a note is saved:
 * the author's own note keeps its lineage (PPM bumps the edit counter), while saving someone
 * else's note makes it a spin-off with the previous author recorded as the parent.
 */
export declare function applySaveRules(note: PpmFile, options?: SaveOptions): PpmFile;
export declare function applySaveRules(note: KwzFile, options?: SaveOptions): KwzFile;
export declare function applySaveRules(note: NoteFile, options?: SaveOptions): NoteFile;
