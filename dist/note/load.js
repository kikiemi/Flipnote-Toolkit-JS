import { check } from '../core/errors.js';
import { readNote } from './note.js';
function isNoteFile(source) {
    return typeof source === 'object' && 'format' in source && 'meta' in source;
}
/** Fetches or copies the raw bytes of a note source. */
export async function loadNoteBytes(source) {
    if (source instanceof Uint8Array)
        return source;
    if (source instanceof ArrayBuffer)
        return new Uint8Array(source);
    if (ArrayBuffer.isView(source)) {
        return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
    }
    if (typeof Blob !== 'undefined' && source instanceof Blob) {
        return new Uint8Array(await source.arrayBuffer());
    }
    const response = await fetch(source);
    check(response.ok, 'INVALID_ARGUMENT', `Could not load ${String(source)} (HTTP ${response.status})`);
    return new Uint8Array(await response.arrayBuffer());
}
/** Loads and parses a note from any supported source. */
export async function loadNote(source) {
    if (isNoteFile(source))
        return source;
    return readNote(await loadNoteBytes(source));
}
