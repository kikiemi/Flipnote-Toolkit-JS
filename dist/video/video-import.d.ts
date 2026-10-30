import { type VideoImportOptions } from '../note/import.ts';
import type { NoteFile, NoteFormat } from '../note/note.ts';
import { type MediaInput } from './mediabunny.ts';
/**
 * Turns any video mediabunny can read (MP4, WebM, MOV, MKV, ...) into a note: frames are
 * sampled at a speed the app supports, fitted, quantized and kept within its memory limit,
 * and the soundtrack becomes the BGM. Decoding uses WebCodecs in browsers; in Node,
 * register decoders first (for example with `@mediabunny/server`).
 */
export declare function importVideo(media: MediaInput, format: NoteFormat, options?: VideoImportOptions): Promise<NoteFile>;
