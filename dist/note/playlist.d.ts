import type { NoteFormat } from './note.ts';
export interface Playlist {
    format: NoteFormat;
    /** Paths as stored, e.g. `/ugomemo/...` or plain KWZ file names. */
    entries: string[];
    /** Flipnote Studio 3D only: one byte per entry (purpose unknown, normally 0). */
    flags: number[];
    /** Flipnote Studio 3D only: whether the stored CRC matches the list. */
    isChecksumValid: boolean | null;
}
/** Decodes a playlist: `.pls`/`.lst` from Flipnote Studio or `.lst` from Flipnote Studio 3D. */
export declare function readPlaylist(bytes: Uint8Array, format: NoteFormat): Playlist;
/** Encodes a playlist in the given app's format. */
export declare function writePlaylist(entries: readonly string[], format: NoteFormat, flags?: readonly number[]): Uint8Array;
