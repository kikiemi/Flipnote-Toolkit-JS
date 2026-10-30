import { sha1 } from '../core/sha.js';
import { bytesToHex } from '../core/text.js';
import { timestampToDate } from '../core/time.js';
import { isDsiLibraryNote } from '../kwz/kwz-dsi-library.js';
import { hasAudio } from '../note/audio.js';
import { checkNote } from '../note/check.js';
import { getMemoryUsage } from '../note/memory.js';
import { getNoteInfo, readNote, } from '../note/note.js';
import { formatPpmFilename, formatPpmStorageFilename } from '../ppm/ppm-filename.js';
import { createThumbnail, toDataUrl } from './thumbnails.js';
function hashContent(note) {
    if (note.format === 'ppm')
        return bytesToHex(sha1(note.animation.data));
    const parts = note.frames.flatMap((frame) => frame.layerData);
    let length = 0;
    for (const part of parts)
        length += part.length;
    const all = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
        all.set(part, offset);
        offset += part.length;
    }
    return bytesToHex(sha1(all));
}
/** Builds the database record for a note file. */
export function createNoteRecord(bytes, options = {}) {
    const note = readNote(bytes);
    const info = getNoteInfo(note);
    const check = checkNote(bytes, { isCheckingFrames: false });
    const meta = note.meta;
    const common = {
        id: bytesToHex(sha1(bytes)),
        contentId: hashContent(note),
        ...(options.path === undefined ? {} : { path: options.path }),
        ...(options.fileTime === undefined ? {} : { fileTime: options.fileTime }),
        size: bytes.length,
        format: note.format,
        variant: info.variant,
        root: { id: meta.rootAuthorId, name: meta.rootAuthorName },
        parent: { id: meta.parentAuthorId, name: meta.parentAuthorName },
        current: { id: meta.currentAuthorId, name: meta.currentAuthorName },
        frameCount: info.frameCount,
        frameRate: info.frameRate,
        duration: info.duration,
        hasAudio: hasAudio(note),
        isLocked: meta.isLocked,
        isLooping: meta.isLooping,
        isSigned: check.isSigned,
        isCompatible: check.isCompatible,
        isSpinoff: meta.currentAuthorId.toLowerCase() !== meta.rootAuthorId.toLowerCase(),
        memory: getMemoryUsage(note).level,
        errors: check.issues.filter((issue) => issue.level === 'error').length,
        warnings: check.issues.filter((issue) => issue.level === 'warning').length,
        tags: options.tags ?? [],
    };
    const thumbnail = options.thumbnail
        ? { thumbnail: toDataUrl(createThumbnail(note, options.thumbnail)) }
        : {};
    if (note.format === 'ppm') {
        return {
            ...common,
            filename: formatPpmFilename(note.meta.currentFilename),
            parentFilename: formatPpmFilename(note.meta.parentFilename),
            rootFilename: note.meta.rootFilenameFragment,
            storageFilename: formatPpmStorageFilename(note.meta.currentFilename),
            createdAt: null,
            modifiedAt: timestampToDate(note.meta.timestamp).toISOString(),
            is3d: false,
            isDsiLibrary: false,
            ...thumbnail,
        };
    }
    const extension = note.variant === 'icon' ? '' : note.variant === 'kwc' ? '.kwc' : '.kwz';
    return {
        ...common,
        filename: note.meta.currentFilename,
        parentFilename: note.meta.parentFilename,
        rootFilename: note.meta.rootFilename,
        storageFilename: note.variant === 'icon' ? '!.ico' : note.meta.currentFilename + extension,
        createdAt: note.variant === 'icon' ? null : timestampToDate(note.meta.createdTime).toISOString(),
        modifiedAt: timestampToDate(note.meta.modifiedTime).toISOString(),
        is3d: note.meta.is3d,
        isDsiLibrary: isDsiLibraryNote(note),
        ...thumbnail,
    };
}
function sortValue(record, key) {
    switch (key) {
        case 'created':
            return record.createdAt ?? record.modifiedAt;
        case 'frames':
            return record.frameCount;
        case 'duration':
            return record.duration;
        case 'size':
            return record.size;
        case 'author':
            return record.current.name.toLowerCase();
        case 'filename':
            return record.filename;
        default:
            return record.modifiedAt;
    }
}
function toIso(value) {
    return (typeof value === 'string' ? new Date(value) : value).toISOString();
}
/** In-memory index of notes with search, lineage and duplicate detection; serializes to JSON. */
export class NoteDatabase {
    records = new Map();
    constructor(records = []) {
        for (const record of records)
            this.records.set(record.id, record);
    }
    static fromJson(json) {
        const data = typeof json === 'string' ? JSON.parse(json) : json;
        return new NoteDatabase(data.records);
    }
    get size() {
        return this.records.size;
    }
    /** Reads a note file and indexes it; an identical file replaces its earlier record. */
    add(bytes, options = {}) {
        const record = createNoteRecord(bytes, options);
        this.records.set(record.id, record);
        return record;
    }
    addRecord(record) {
        this.records.set(record.id, record);
    }
    get(id) {
        return this.records.get(id);
    }
    findByPath(path) {
        for (const record of this.records.values())
            if (record.path === path)
                return record;
        return undefined;
    }
    remove(id) {
        return this.records.delete(id);
    }
    all() {
        return [...this.records.values()];
    }
    query(query = {}) {
        const text = query.text?.toLowerCase();
        const from = query.from ? toIso(query.from) : null;
        const to = query.to ? toIso(query.to) : null;
        const flags = [
            'isSigned',
            'hasAudio',
            'isLocked',
            'is3d',
            'isDsiLibrary',
            'isSpinoff',
        ];
        let results = this.all().filter((record) => {
            if (query.format && record.format !== query.format)
                return false;
            if (query.variant && record.variant !== query.variant)
                return false;
            if (query.tag && !record.tags.includes(query.tag))
                return false;
            if (from && record.modifiedAt < from)
                return false;
            if (to && record.modifiedAt >= to)
                return false;
            if (flags.some((flag) => query[flag] !== undefined && record[flag] !== query[flag])) {
                return false;
            }
            if (query.authorId) {
                const id = query.authorId.toLowerCase().replace(/-/g, '');
                if (![record.root, record.parent, record.current].some((author) => author.id.toLowerCase().startsWith(id))) {
                    return false;
                }
            }
            if (text) {
                const haystack = [
                    record.root.name,
                    record.parent.name,
                    record.current.name,
                    record.current.id,
                    record.filename,
                    record.storageFilename,
                    record.path ?? '',
                    ...record.tags,
                ]
                    .join('\n')
                    .toLowerCase();
                if (!haystack.includes(text))
                    return false;
            }
            return true;
        });
        const key = query.sort ?? 'modified';
        const direction = (query.order ?? (key === 'author' || key === 'filename' ? 'asc' : 'desc')) === 'asc' ? 1 : -1;
        results.sort((a, b) => {
            const x = sortValue(a, key);
            const y = sortValue(b, key);
            return x < y ? -direction : x > y ? direction : 0;
        });
        const offset = query.offset ?? 0;
        results = results.slice(offset, query.limit === undefined ? undefined : offset + query.limit);
        return results;
    }
    /** Groups of records with identical frames (re-signed, renamed or metadata-edited copies). */
    findDuplicates() {
        const groups = new Map();
        for (const record of this.records.values()) {
            const group = groups.get(record.contentId) ?? [];
            group.push(record);
            groups.set(record.contentId, group);
        }
        return [...groups.values()].filter((group) => group.length > 1);
    }
    /** Notes that descend from the same original (same root author and root file). */
    findFamily(id) {
        const record = this.records.get(id);
        if (!record)
            return [];
        return this.all().filter((other) => other.root.id.toLowerCase() === record.root.id.toLowerCase() &&
            other.rootFilename === record.rootFilename);
    }
    /** Every author with how many notes they currently own. */
    listAuthors() {
        const authors = new Map();
        for (const record of this.records.values()) {
            const key = record.current.id.toLowerCase();
            const entry = authors.get(key) ?? {
                id: record.current.id,
                name: record.current.name,
                count: 0,
            };
            entry.count++;
            authors.set(key, entry);
        }
        return [...authors.values()].sort((a, b) => b.count - a.count);
    }
    toJson() {
        return { version: 1, records: this.all() };
    }
}
