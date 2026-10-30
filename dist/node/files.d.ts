import { NoteDatabase, type AddNoteOptions, type NoteRecord } from '../library/database.ts';
import { type ThumbnailOptions } from '../library/thumbnails.ts';
import { type NoteFile } from '../note/note.ts';
import { type SigningKeys } from '../note/signature.ts';
export interface ScanOptions {
    /** Look into subdirectories (default true). */
    isRecursive?: boolean;
    /** Existing database to update; unchanged files (same size and time) are skipped. */
    database?: NoteDatabase;
    thumbnail?: AddNoteOptions['thumbnail'];
    /** Called after each file with the record, or the error that made it unreadable. */
    onFile?: (path: string, result: NoteRecord | Error) => void;
}
/**
 * Indexes every PPM, KWZ, KWC and folder icon under `directory`, recognized by content
 * rather than extension. Paths are stored relative to `directory`.
 */
export declare function scanNotes(directory: string, options?: ScanOptions): Promise<NoteDatabase>;
/** Reads and parses a note file. */
export declare function readNoteFile(path: string): Promise<NoteFile>;
export declare function loadDatabase(path: string): Promise<NoteDatabase>;
export declare function saveDatabase(database: NoteDatabase, path: string): Promise<void>;
/**
 * Writes a thumbnail for every note in the database (paths relative to `root`) into
 * `outDirectory`, named after the note's file id. Returns the written file names by record id.
 */
export declare function writeThumbnails(database: NoteDatabase, root: string, outDirectory: string, options?: ThumbnailOptions): Promise<Map<string, string>>;
/**
 * Loads signing keys from files or directories (the default places when none are given): PEM/DER
 * keys, or any data that embeds them such as Flipnote Studio 3D's code.bin. Keys are matched to
 * PPM or KWZ by their public half; the first key found for a format is used. Notes are signed with
 * keys in the default places or the built-in keys anyway; pass the result to setSigningKeys to use
 * others.
 */
export declare function loadSigningKeys(...paths: string[]): Promise<SigningKeys>;
/** Saves keys as `ppm.pem` and `kwz.pem`, where loadSigningKeys finds them; returns the files. */
export declare function saveSigningKeys(keys: SigningKeys, directory?: string): Promise<string[]>;
