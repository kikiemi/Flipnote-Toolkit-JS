import { check } from '../core/errors.js';
import { isHex } from '../core/text.js';
import { currentTimestamp } from '../core/time.js';
import { encodeKwzFilename } from '../kwz/kwz-filename.js';
import { KWZ_APP_VERSION } from '../kwz/kwz-types.js';
import { createPpmFilename } from '../ppm/ppm-filename.js';
function isSameId(a, b) {
    return a.toLowerCase() === b.toLowerCase();
}
/** Locked notes can only be changed by their current author. */
export function canEditNote(note, authorId) {
    return !note.meta.isLocked || isSameId(note.meta.currentAuthorId, authorId);
}
/** True when saving as `authorId` makes the note a spin-off of someone else's work. */
export function isSpinoff(note, authorId) {
    return !isSameId(note.meta.currentAuthorId, authorId);
}
function savePpmMeta(meta, options) {
    const author = options.author ?? { id: meta.currentAuthorId, name: meta.currentAuthorName };
    check(isHex(author.id, 16), 'INVALID_ARGUMENT', 'PPM author IDs are 16 hex digits');
    const mac = (author.mac ?? author.id.slice(10)).toUpperCase();
    const time = options.time ?? currentTimestamp();
    const next = { ...meta, isLayerVisible: [...meta.isLayerVisible], timestamp: time };
    if (isSameId(meta.currentAuthorId, author.id)) {
        const edits = (meta.currentFilename.edits + 1) % 1000;
        next.currentAuthorName = author.name;
        next.currentFilename =
            options.mode === 'copy'
                ? { ...createPpmFilename(mac, time, options.random), edits }
                : { ...meta.currentFilename, edits };
        return next;
    }
    next.parentAuthorName = meta.currentAuthorName;
    next.parentAuthorId = meta.currentAuthorId;
    next.parentFilename = meta.currentFilename;
    next.currentAuthorName = author.name;
    next.currentAuthorId = author.id.toUpperCase();
    next.currentFilename = createPpmFilename(mac, time, options.random);
    next.isLocked = false;
    return next;
}
function saveKwzMeta(meta, options) {
    const author = options.author ?? { id: meta.currentAuthorId, name: meta.currentAuthorName };
    check(isHex(author.id, 20), 'INVALID_ARGUMENT', 'KWZ author IDs are 20 hex digits');
    const time = options.time ?? currentTimestamp();
    const id = author.id.toLowerCase();
    const next = {
        ...meta,
        isLayerVisible: [...meta.isLayerVisible],
        modifiedTime: time,
        appVersion: KWZ_APP_VERSION,
    };
    if (isSameId(meta.currentAuthorId, id)) {
        next.currentAuthorName = author.name;
        next.currentFilename = encodeKwzFilename({
            authorId: id,
            createdTime: meta.createdTime,
            modifiedTime: time,
        });
        return next;
    }
    next.parentAuthorName = meta.currentAuthorName;
    next.parentAuthorId = meta.currentAuthorId;
    next.parentFilename = meta.currentFilename;
    next.currentAuthorName = author.name;
    next.currentAuthorId = id;
    next.createdTime = time;
    next.currentFilename = encodeKwzFilename({ authorId: id, createdTime: time, modifiedTime: time });
    next.isLocked = false;
    return next;
}
export function applySaveRules(note, options = {}) {
    if (options.author) {
        check(canEditNote(note, options.author.id), 'INVALID_ARGUMENT', 'This note is locked by its author');
    }
    if (note.format === 'ppm')
        return { ...note, meta: savePpmMeta(note.meta, options) };
    return { ...note, meta: saveKwzMeta(note.meta, options) };
}
