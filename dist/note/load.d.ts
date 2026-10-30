import { type NoteFile } from './note.ts';
/**
 * Anything a note can be loaded from: a parsed note, bytes, a Blob or File, or a URL
 * (http, https, blob: or data:). File paths are handled by `readNoteFile` in flipnote-tools-js/node.
 */
export type NoteSource = NoteFile | Uint8Array | ArrayBuffer | ArrayBufferView | Blob | URL | string;
/** Fetches or copies the raw bytes of a note source. */
export declare function loadNoteBytes(source: Exclude<NoteSource, NoteFile>): Promise<Uint8Array>;
/** Loads and parses a note from any supported source. */
export declare function loadNote(source: NoteSource): Promise<NoteFile>;
