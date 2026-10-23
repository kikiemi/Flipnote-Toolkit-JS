import { check } from '../core/errors.ts';
import { isHex } from '../core/text.ts';
import { currentTimestamp } from '../core/time.ts';
import { encodeKwzFilename } from '../kwz/kwz-filename.ts';
import { KWZ_APP_VERSION, type KwzFile, type KwzMeta } from '../kwz/kwz-types.ts';
import { createPpmFilename } from '../ppm/ppm-filename.ts';
import type { PpmFile, PpmMeta } from '../ppm/ppm-types.ts';
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

function isSameId(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Locked notes can only be changed by their current author. */
export function canEditNote(note: NoteFile, authorId: string): boolean {
  return !note.meta.isLocked || isSameId(note.meta.currentAuthorId, authorId);
}

/** True when saving as `authorId` makes the note a spin-off of someone else's work. */
export function isSpinoff(note: NoteFile, authorId: string): boolean {
  return !isSameId(note.meta.currentAuthorId, authorId);
}

function savePpmMeta(meta: PpmMeta, options: SaveOptions): PpmMeta {
  const author = options.author ?? { id: meta.currentAuthorId, name: meta.currentAuthorName };
  check(isHex(author.id, 16), 'INVALID_ARGUMENT', 'PPM author IDs are 16 hex digits');
  const mac = (author.mac ?? author.id.slice(10)).toUpperCase();
  const time = options.time ?? currentTimestamp();
  const next: PpmMeta = { ...meta, isLayerVisible: [...meta.isLayerVisible], timestamp: time };
  if (isSameId(meta.currentAuthorId, author.id)) {
    const edits = Math.min(0xffff, meta.currentFilename.edits + 1);
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

function saveKwzMeta(meta: KwzMeta, options: SaveOptions): KwzMeta {
  const author = options.author ?? { id: meta.currentAuthorId, name: meta.currentAuthorName };
  check(isHex(author.id, 20), 'INVALID_ARGUMENT', 'KWZ author IDs are 20 hex digits');
  const time = options.time ?? currentTimestamp();
  const id = author.id.toLowerCase();
  const next: KwzMeta = {
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

/**
 * Updates authorship, file names and timestamps the way the app does when a note is saved:
 * the author's own note keeps its lineage (PPM bumps the edit counter), while saving someone
 * else's note makes it a spin-off with the previous author recorded as the parent.
 */
export function applySaveRules(note: PpmFile, options?: SaveOptions): PpmFile;
export function applySaveRules(note: KwzFile, options?: SaveOptions): KwzFile;
export function applySaveRules(note: NoteFile, options?: SaveOptions): NoteFile;
export function applySaveRules(note: NoteFile, options: SaveOptions = {}): NoteFile {
  if (options.author) {
    check(
      canEditNote(note, options.author.id),
      'INVALID_ARGUMENT',
      'This note is locked by its author',
    );
  }
  if (note.format === 'ppm') return { ...note, meta: savePpmMeta(note.meta, options) };
  return { ...note, meta: saveKwzMeta(note.meta, options) };
}
