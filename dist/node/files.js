import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { FlipnoteError } from '../core/errors.js';
import { DEFAULT_KEY_DIRECTORY, getDefaultKeyPaths } from '../core/key-store.js';
import { encodeRsaPrivateKey } from '../core/rsa.js';
import { NoteDatabase, } from '../library/database.js';
import { createThumbnail } from '../library/thumbnails.js';
import { detectFormat, readNote } from '../note/note.js';
import { findSigningKeys } from '../note/signature.js';
async function* walk(directory, isRecursive) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            if (isRecursive)
                yield* walk(path, isRecursive);
        }
        else if (entry.isFile()) {
            yield path;
        }
    }
}
/**
 * Indexes every PPM, KWZ, KWC and folder icon under `directory`, recognized by content
 * rather than extension. Paths are stored relative to `directory`.
 */
export async function scanNotes(directory, options = {}) {
    const database = options.database ?? new NoteDatabase();
    for await (const path of walk(directory, options.isRecursive ?? true)) {
        const name = relative(directory, path).replace(/\\/g, '/');
        const info = await stat(path);
        const known = database.findByPath(name);
        if (known && known.size === info.size && known.fileTime === info.mtimeMs)
            continue;
        const bytes = new Uint8Array(await readFile(path));
        if (!detectFormat(bytes))
            continue;
        try {
            if (known)
                database.remove(known.id);
            const record = database.add(bytes, {
                path: name,
                fileTime: info.mtimeMs,
                thumbnail: options.thumbnail,
            });
            options.onFile?.(name, record);
        }
        catch (error) {
            if (!(error instanceof FlipnoteError))
                throw error;
            options.onFile?.(name, error);
        }
    }
    return database;
}
/** Reads and parses a note file. */
export async function readNoteFile(path) {
    return readNote(new Uint8Array(await readFile(path)));
}
export async function loadDatabase(path) {
    return NoteDatabase.fromJson(JSON.parse(await readFile(path, 'utf8')));
}
export async function saveDatabase(database, path) {
    await writeFile(path, JSON.stringify(database.toJson(), null, 1));
}
/**
 * Writes a thumbnail for every note in the database (paths relative to `root`) into
 * `outDirectory`, named after the note's file id. Returns the written file names by record id.
 */
export async function writeThumbnails(database, root, outDirectory, options = {}) {
    await mkdir(outDirectory, { recursive: true });
    const written = new Map();
    const extension = options.kind === 'animated' ? '.gif' : '.png';
    for (const record of database.all()) {
        if (!record.path)
            continue;
        const note = readNote(new Uint8Array(await readFile(join(root, record.path))));
        const name = record.id + extension;
        await writeFile(join(outDirectory, name), createThumbnail(note, options));
        written.set(record.id, name);
    }
    return written;
}
/**
 * Loads signing keys from files or directories (the default places when none are given): PEM/DER
 * keys, or any data that embeds them such as Flipnote Studio 3D's code.bin. Keys are matched to
 * PPM or KWZ by their public half; the first key found for a format is used. Notes are signed with
 * keys in the default places or the built-in keys anyway; pass the result to setSigningKeys to use
 * others.
 */
export async function loadSigningKeys(...paths) {
    const keys = {};
    for (const path of paths.length ? paths : getDefaultKeyPaths()) {
        const info = await stat(path).catch(() => null);
        if (!info)
            continue;
        const files = info.isDirectory()
            ? (await readdir(path)).map((name) => join(path, name))
            : [path];
        for (const file of files) {
            const found = findSigningKeys(new Uint8Array(await readFile(file)));
            for (const format of ['ppm', 'kwz'])
                keys[format] ??= found[format];
        }
    }
    return keys;
}
/** Saves keys as `ppm.pem` and `kwz.pem`, where loadSigningKeys finds them; returns the files. */
export async function saveSigningKeys(keys, directory = DEFAULT_KEY_DIRECTORY) {
    await mkdir(directory, { recursive: true });
    const files = [];
    for (const format of ['ppm', 'kwz']) {
        const key = keys[format];
        if (!key)
            continue;
        const file = join(directory, `${format}.pem`);
        await writeFile(file, encodeRsaPrivateKey(key, 'pem'));
        files.push(file);
    }
    return files;
}
