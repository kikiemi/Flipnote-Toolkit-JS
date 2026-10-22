import { check } from '../core/errors.ts';
import { readNote, type NoteFile } from './note.ts';

/**
 * Anything a note can be loaded from: a parsed note, bytes, a Blob or File, or a URL
 * (http, https, blob: or data:). File paths are handled by `readNoteFile` in flipnote-tools-js/node.
 */
export type NoteSource =
  NoteFile | Uint8Array | ArrayBuffer | ArrayBufferView | Blob | URL | string;

function isNoteFile(source: NoteSource): source is NoteFile {
  return typeof source === 'object' && 'format' in source && 'meta' in source;
}

/** Fetches or copies the raw bytes of a note source. */
export async function loadNoteBytes(source: Exclude<NoteSource, NoteFile>): Promise<Uint8Array> {
  if (source instanceof Uint8Array) return source;
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  if (ArrayBuffer.isView(source)) {
    return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  }
  if (typeof Blob !== 'undefined' && source instanceof Blob) {
    return new Uint8Array(await source.arrayBuffer());
  }
  const response = await fetch(source as URL | string);
  check(
    response.ok,
    'INVALID_ARGUMENT',
    `Could not load ${String(source)} (HTTP ${response.status})`,
  );
  return new Uint8Array(await response.arrayBuffer());
}

/** Loads and parses a note from any supported source. */
export async function loadNote(source: NoteSource): Promise<NoteFile> {
  if (isNoteFile(source)) return source;
  return readNote(await loadNoteBytes(source));
}
