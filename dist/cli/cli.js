#!/usr/bin/env node
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { fail, FlipnoteError } from '../core/errors.js';
import { DEFAULT_KEY_DIRECTORY } from '../core/key-store.js';
import { fitRgba } from '../image/image.js';
import { parseKwzFsid } from '../kwz/kwz-filename.js';
import { createKwzIcon, imageToKwzIconPixels, KWZ_ICON_SIZE } from '../kwz/kwz-icon.js';
import { createThumbnail } from '../library/thumbnails.js';
import { detectImageFormat, openAnimation } from '../media/animation.js';
import { decodePng } from '../media/png.js';
import { decodeWav, encodeWav } from '../media/wav.js';
import { importVideoWithFfmpeg, registerServerCodecs } from '../node/ffmpeg.js';
import { loadDatabase, loadSigningKeys, saveDatabase, saveSigningKeys, scanNotes, writeThumbnails, } from '../node/files.js';
import { writeGallery } from '../node/gallery.js';
import { decodeTrack, hasTrack } from '../note/audio.js';
import { checkNote } from '../note/check.js';
import { convertToKwz, convertToPpm } from '../note/convert.js';
import { exportApng, exportFramePng, exportFramePngs, exportGif, exportMp4, exportMpo, exportWav, } from '../note/export.js';
import { importAnimation } from '../note/import.js';
import { inspectNote } from '../note/inspect.js';
import { getFrameCount, getStorageFilename, readNote, writeNote, } from '../note/note.js';
import { readPlaylist } from '../note/playlist.js';
import { carveNotes, repairNote } from '../note/repair.js';
import { getSigningKeys, setSigningKeys, signNote, verifyNote } from '../note/signature.js';
const HELP = `flipnote-tools — Flipnote Toolkit JS

Notes
  info <file> [--json] [--frames]         metadata, memory meter, tracks and problems
  check <file...> [--json]                 would the console accept it? (exit code 1 if not)
  repair <input> [output]                  fix a damaged file and recover what can be recovered
  carve <image> [directory]                extract notes from SD card or NAND images
  meta <file> [--set name=value ...]       show or change speed, bgm-speed, loop, lock, thumbnail, name
  sign <file...> [--out file]              sign for the consoles
  verify <file...>                         check signatures
  keys <source...> [--out directory]       extract the signing keys from app data or key files

Converting and exporting
  convert <input> <output>                 by extension: .ppm .kwz .gif .apng .png .mpo .wav
                                           .mp4 .mov .mkv .webm
  frames <input> <directory>               every frame as PNG
  thumbnail <input> <output.png|gif>       [--width N] [--animated] [--stored]
  audio <input> <output.wav>               [--track bgm|se1..se4]

Creating
  import <media...> <output.ppm|kwz>       images, GIF, APNG or video (one source per frame
                                           for still images) [--fps N] [--start S] [--end S]
  icon <image> <output.ico>                Flipnote Studio 3D folder icon

Collections
  db <directory> [--db notes.json]         index notes (incremental) [--thumbnails]
  find <notes.json> [--text T] [--author ID] [--format ppm|kwz] [--sort key] [--limit N] [--json]
  thumbs <directory> <out-directory>       [--width N] [--animated]
  gallery <directory> <out-directory>      static web page with a player [--title T] [--animated]
  playlist <file.pls|lst> [--format ppm|kwz]

Notes written to a folder get the file name the console would give them (PPM storage names,
KWZ base32 names, !.ico); --format ppm|kwz picks the format there (convert, import).

Common options
  --key path         signing keys to use instead of ./keys or the built-in ones
  --scale N          integer upscale            --stereo MODE   left, right, side-by-side,
  --fps N            frame rate                                 side-by-side-half, top-bottom, anaglyph
  --repeat N         loop the animation N times --palette app   KWZ colors as stored in the app
  --qp N             H.264 quantizer (0-51)     --no-audio      video without sound
  --rate HZ          audio sample rate          --console       console-style (nearest) upsampling
  --eq PRESET|GAINS  equalizer: flat, bass, treble, voice, loudness, soft, or ten dB gains
                     for 31 Hz-16 kHz separated by commas
  --dither MODE      none, ordered, diffusion   --flatten       KWZ to PPM by color, not by layer
  --fit MODE         converting: center (1:1), canvas (3DS drawing area), screen, auto
                     importing: contain, cover, stretch, center
  --author-id ID     your console's ID          --author-name S your name
`;
const BOOLEAN_FLAGS = new Set([
    'flatten',
    'json',
    'frames',
    'no-audio',
    'animated',
    'stored',
    'console',
    'thumbnails',
    'help',
]);
function parseArguments(argv) {
    const positional = [];
    const flags = new Map();
    const sets = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg.startsWith('--')) {
            positional.push(arg);
            continue;
        }
        const name = arg.slice(2);
        if (BOOLEAN_FLAGS.has(name)) {
            flags.set(name, true);
        }
        else if (name === 'set') {
            sets.push(argv[++i] ?? '');
        }
        else {
            flags.set(name, argv[++i] ?? '');
        }
    }
    return { positional, flags, sets };
}
function text(args, name) {
    const value = args.flags.get(name);
    return typeof value === 'string' ? value : undefined;
}
function number(args, name) {
    const value = text(args, name);
    if (value === undefined)
        return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        fail('INVALID_ARGUMENT', `--${name} needs a number`);
    return parsed;
}
async function read(path) {
    return new Uint8Array(await readFile(path));
}
async function write(path, bytes) {
    await writeFile(path, bytes);
    console.log(`wrote ${path} (${bytes.length} bytes)`);
}
/** Writes a note, signed with the default keys, and prints its SD card name. */
async function writeNoteFile(path, note) {
    const bytes = writeNote(note, { onWarning: (message) => console.warn(`warning: ${message}`) });
    await write(await notePath(path, note), bytes);
    const status = verifyNote(bytes) ? '' : ' (unsigned)';
    console.log(`SD card file name: ${getStorageFilename(note)}${status}`);
}
/** True for an existing directory or a path ending in a separator. */
async function isFolder(path) {
    if (/[\\/]$/.test(path))
        return true;
    return stat(path).then((info) => info.isDirectory(), () => false);
}
/** `path`, or the note's SD card file name inside it when `path` is a folder. */
async function notePath(path, note) {
    return (await isFolder(path)) ? join(path, getStorageFilename(note)) : path;
}
/** Note format of an output: its extension, or --format (else `fallback`) for a folder. */
async function outputFormat(output, args, fallback) {
    if (await isFolder(output))
        return text(args, 'format') ?? fallback;
    return extname(output).slice(1).toLowerCase();
}
function exportOptions(args) {
    return {
        scale: number(args, 'scale'),
        repeat: number(args, 'repeat'),
        stereo: text(args, 'stereo'),
        palette: text(args, 'palette'),
    };
}
function equalizerOption(args) {
    const value = text(args, 'eq');
    if (!value)
        return undefined;
    return value.includes(',') ? value.split(',').map(Number) : value;
}
function audioOptions(args) {
    return {
        sampleRate: number(args, 'rate'),
        method: args.flags.has('console') ? 'nearest' : 'sinc',
        equalizer: equalizerOption(args),
    };
}
async function commandInfo(args) {
    const [path] = args.positional;
    const report = inspectNote(await read(path), { isDetailed: args.flags.has('frames') });
    if (args.flags.has('json')) {
        console.log(JSON.stringify(report, (_key, value) => (typeof value === 'bigint' ? String(value) : value), 2));
        return;
    }
    const meta = report.meta;
    const animation = report.animation;
    console.log(`${path}: ${report.format.toUpperCase()} (${report.variant}), ${report.fileSize} bytes, ${report.isSigned ? 'signed' : 'NOT signed'}`);
    console.log(`  ${animation.frameCount} frames at ${animation.frameRate} fps (${animation.duration.toFixed(2)} s), ${animation.width}x${animation.height}`);
    console.log(`  authors: ${meta.rootAuthorName} → ${meta.parentAuthorName} → ${meta.currentAuthorName}`);
    console.log(`  current author ID: ${meta.currentAuthorIdText ?? meta.currentAuthorId}`);
    console.log(`  file name: ${meta.currentFilenameText ?? meta.currentFilename}`);
    console.log(`  modified: ${meta.modifiedAt}${meta.isLocked ? ', locked' : ''}${meta.isLooping ? ', loops' : ''}`);
    console.log(`  memory meter: ${Math.round(report.memory.level * 100)}%`);
    for (const track of report.tracks) {
        console.log(`  ${track.name}: ${track.duration.toFixed(2)} s at ${track.sampleRate} Hz, peak ${track.peak}`);
    }
    for (const issue of report.issues)
        console.log(`  [${issue.level}] ${issue.message}`);
    if (args.flags.has('frames')) {
        for (const frame of report.frames) {
            console.log(`  #${frame.index} ${frame.bytes} bytes key=${frame.key} paper=${frame.paper} colors=${frame.colors.join(',')} pixels=${frame.pixels.join(',')}${frame.soundFlags ? ' se=' + frame.soundFlags : ''}`);
        }
    }
}
async function commandCheck(args) {
    let failures = 0;
    const reports = [];
    for (const path of args.positional) {
        const report = checkNote(await read(path));
        reports.push({ path, ...report });
        if (!report.isCompatible)
            failures++;
        if (args.flags.has('json'))
            continue;
        console.log(`${report.isCompatible ? 'OK  ' : 'FAIL'} ${path}`);
        for (const issue of report.issues) {
            if (issue.level !== 'info') {
                console.log(`     [${issue.level}] ${issue.message}${issue.isRepairable ? ' (repairable)' : ''}`);
            }
        }
    }
    if (args.flags.has('json'))
        console.log(JSON.stringify(reports, null, 2));
    return failures ? 1 : 0;
}
async function commandRepair(args) {
    const [input, output = input.replace(/(\.\w+)?$/, '.repaired$1')] = args.positional;
    const result = repairNote(await read(input));
    for (const action of result.actions)
        console.log(`  ${action}`);
    if (!result.bytes || !result.note) {
        console.error('Nothing could be recovered.');
        return 1;
    }
    await write(await notePath(output, result.note), result.bytes);
    console.log(`${getFrameCount(result.note)} frames, ${result.damagedFrames.length} damaged; console compatible: ${result.after?.isCompatible}`);
    return 0;
}
async function commandCarve(args) {
    const [input, directory = 'carved'] = args.positional;
    await mkdir(directory, { recursive: true });
    const found = carveNotes(await read(input));
    for (const item of found) {
        const name = `${item.offset.toString(16).padStart(8, '0')}${item.isComplete ? '' : '-partial'}.${item.format}`;
        await write(join(directory, name), item.bytes);
    }
    console.log(`${found.length} notes found`);
}
async function commandMeta(args) {
    const [path] = args.positional;
    let note = readNote(await read(path));
    if (!args.sets.length) {
        console.log(JSON.stringify(note.meta, null, 2));
        return;
    }
    const patch = {};
    for (const assignment of args.sets) {
        const [name, value = ''] = assignment.split('=');
        const flag = value === 'true' || value === '1';
        if (name === 'speed')
            patch.frameSpeed = Number(value);
        else if (name === 'bgm-speed')
            patch.bgmSpeed = Number(value);
        else if (name === 'loop')
            patch.isLooping = flag;
        else if (name === 'lock')
            patch.isLocked = flag;
        else if (name === 'thumbnail')
            patch.thumbnailIndex = Number(value);
        else if (name === 'name')
            patch.currentAuthorName = value;
        else
            fail('INVALID_ARGUMENT', `Unknown setting "${name}"`);
    }
    note = { ...note, meta: { ...note.meta, ...patch } };
    await writeNoteFile(text(args, 'out') ?? path, note);
}
async function commandSign(args) {
    for (const path of args.positional) {
        const bytes = signNote(await read(path));
        await write(await notePath(text(args, 'out') ?? path, readNote(bytes)), bytes);
    }
}
async function commandVerify(args) {
    let failures = 0;
    for (const path of args.positional) {
        const isValid = verifyNote(await read(path));
        if (!isValid)
            failures++;
        console.log(`${isValid ? 'valid  ' : 'INVALID'} ${path}`);
    }
    return failures ? 1 : 0;
}
async function commandKeys(args) {
    const keys = await loadSigningKeys(...args.positional);
    const files = await saveSigningKeys(keys, text(args, 'out') ?? DEFAULT_KEY_DIRECTORY);
    for (const file of files)
        console.log(`saved ${file}`);
    if (!files.length)
        console.log('No signing keys found.');
}
async function exportVideoFile(note, output, args) {
    await registerServerCodecs();
    const { exportVideo } = await import('../video/video-export.js');
    const container = extname(output).slice(1).toLowerCase();
    return exportVideo(note, {
        ...exportOptions(args),
        container,
        frameRate: number(args, 'fps'),
        isAudioIncluded: !args.flags.has('no-audio'),
        equalizer: equalizerOption(args),
    });
}
async function commandConvert(args) {
    const [input, output] = args.positional;
    const note = readNote(await read(input));
    const extension = await outputFormat(output, args, note.format === 'ppm' ? 'kwz' : 'ppm');
    const options = exportOptions(args);
    const authorId = text(args, 'author-id');
    const convert = {
        authorName: text(args, 'author-name'),
        onWarning: (message) => console.warn(`warning: ${message}`),
    };
    switch (extension) {
        case 'ppm':
            return writeNoteFile(output, convertToPpm(note, {
                ...convert,
                authorId,
                dither: text(args, 'dither'),
                fit: text(args, 'fit'),
                layers: args.flags.has('flatten') ? 'flatten' : 'keep',
            }));
        case 'kwz':
            return writeNoteFile(output, convertToKwz(note, {
                ...convert,
                authorId: authorId ? parseKwzFsid(authorId) : undefined,
                fit: text(args, 'fit'),
            }));
        case 'gif':
            return write(output, exportGif(note, options));
        case 'apng':
            return write(output, exportApng(note, options));
        case 'png':
            return write(output, exportFramePng(note, number(args, 'frame') ?? 0, options));
        case 'mpo':
            return write(output, exportMpo(note, number(args, 'frame') ?? note.meta.thumbnailIndex, options));
        case 'wav':
            return write(output, exportWav(note, audioOptions(args)));
        case 'mp4':
            return write(output, exportMp4(note, {
                ...options,
                frameRate: number(args, 'fps'),
                qp: number(args, 'qp'),
                isAudioIncluded: !args.flags.has('no-audio'),
                equalizer: equalizerOption(args),
            }));
        case 'mov':
        case 'mkv':
        case 'webm':
            return write(output, await exportVideoFile(note, output, args));
        default:
            fail('INVALID_ARGUMENT', `Unknown output type ".${extension}"`);
    }
}
async function commandFrames(args) {
    const [input, directory] = args.positional;
    const note = readNote(await read(input));
    await mkdir(directory, { recursive: true });
    let index = 0;
    for (const png of exportFramePngs(note, exportOptions(args))) {
        await writeFile(join(directory, `${String(index++).padStart(4, '0')}.png`), png);
    }
    console.log(`wrote ${index} frames to ${directory}`);
}
async function commandThumbnail(args) {
    const [input, output] = args.positional;
    const note = readNote(await read(input));
    const kind = args.flags.has('stored')
        ? 'stored'
        : args.flags.has('animated') || output.endsWith('.gif')
            ? 'animated'
            : 'frame';
    await write(output, createThumbnail(note, { kind, width: number(args, 'width') }));
}
async function commandAudio(args) {
    const [input, output] = args.positional;
    const note = readNote(await read(input));
    const track = text(args, 'track');
    if (track) {
        if (!hasTrack(note, track))
            fail('INVALID_ARGUMENT', `The note has no ${track} track`);
        return write(output, encodeWav(decodeTrack(note, track)));
    }
    await write(output, exportWav(note, audioOptions(args)));
}
async function importVideoFile(path, format, options) {
    if (await registerServerCodecs()) {
        const { importVideo } = await import('../video/video-import.js');
        return importVideo(path, format, options);
    }
    return importVideoWithFfmpeg(path, format, options);
}
async function commandImport(args) {
    const output = args.positional.at(-1);
    const inputs = args.positional.slice(0, -1);
    const format = (await outputFormat(output, args, 'kwz'));
    if (format !== 'ppm' && format !== 'kwz') {
        fail('INVALID_ARGUMENT', 'The output must end in .ppm or .kwz, or be a folder');
    }
    const fps = text(args, 'fps');
    const bgmPath = text(args, 'bgm');
    const options = {
        frameRate: fps && fps !== 'auto' ? Number(fps) : 'auto',
        dither: (text(args, 'dither') ?? 'ordered'),
        fit: text(args, 'fit'),
        start: number(args, 'start'),
        end: number(args, 'end'),
        bgm: bgmPath ? decodeWav(await read(bgmPath)) : undefined,
        isAudioIncluded: !args.flags.has('no-audio'),
        ppmMeta: { currentAuthorName: text(args, 'author-name') },
        kwzMeta: { currentAuthorName: text(args, 'author-name') },
        onWarning: (message) => console.warn(`warning: ${message}`),
        onProgress: process.stdout.isTTY
            ? (done, total) => process.stdout.write(`\rframe ${done} / ${total}`)
            : undefined,
    };
    let note;
    if (inputs.length === 1) {
        const bytes = await read(inputs[0]);
        note = detectImageFormat(bytes)
            ? importAnimation(openAnimation(bytes, 1 / Number(fps && fps !== 'auto' ? fps : 1)), format, options)
            : await importVideoFile(inputs[0], format, options);
    }
    else {
        const images = await Promise.all(inputs.map(async (path) => decodeStill(await read(path))));
        const duration = 1 / (fps && fps !== 'auto' ? Number(fps) : 12);
        note = importAnimation({
            width: images[0].width,
            height: images[0].height,
            durations: images.map(() => duration),
            loopCount: 0,
            frames: () => images,
        }, format, options);
    }
    if (process.stdout.isTTY)
        process.stdout.write('\n');
    await writeNoteFile(output, note);
}
function decodeStill(bytes) {
    const format = detectImageFormat(bytes);
    if (format === 'png')
        return decodePng(bytes);
    const [frame] = openAnimation(bytes).frames();
    return { ...frame, data: frame.data.slice() };
}
async function commandIcon(args) {
    const [input, output] = args.positional;
    const image = fitRgba(decodeStill(await read(input)), KWZ_ICON_SIZE, KWZ_ICON_SIZE, 'contain', 'area', 0);
    const icon = createKwzIcon(imageToKwzIconPixels(image, text(args, 'dither')), {
        authorId: text(args, 'author-id') ? parseKwzFsid(text(args, 'author-id')) : undefined,
    });
    await writeNoteFile(output, icon);
}
async function commandDatabase(args) {
    const [directory] = args.positional;
    const path = text(args, 'db') ?? 'notes.json';
    const existing = await stat(path)
        .then(() => loadDatabase(path))
        .catch(() => undefined);
    let count = 0;
    const database = await scanNotes(directory, {
        database: existing,
        thumbnail: args.flags.has('thumbnails') ? { kind: 'frame', width: 128 } : false,
        onFile: (file, result) => {
            count++;
            if (result instanceof Error)
                console.warn(`skipped ${file}: ${result.message}`);
        },
    });
    await saveDatabase(database, path);
    console.log(`${database.size} notes in ${path} (${count} new or changed)`);
}
async function commandFind(args) {
    const [path] = args.positional;
    const database = await loadDatabase(path);
    const results = database.query({
        text: text(args, 'text'),
        authorId: text(args, 'author'),
        format: text(args, 'format'),
        sort: text(args, 'sort'),
        limit: number(args, 'limit'),
    });
    if (args.flags.has('json')) {
        console.log(JSON.stringify(results.map(({ thumbnail: _thumbnail, ...record }) => record), null, 2));
        return;
    }
    for (const record of results) {
        console.log(`${record.modifiedAt.slice(0, 10)}  ${record.format}  ${record.current.name.padEnd(11)}  ${record.frameCount} frames  ${record.path}`);
    }
    console.log(`${results.length} of ${database.size} notes`);
}
async function commandThumbs(args) {
    const [directory, output] = args.positional;
    const database = await scanNotes(directory);
    const written = await writeThumbnails(database, directory, output, {
        kind: args.flags.has('animated') ? 'animated' : 'frame',
        width: number(args, 'width'),
    });
    console.log(`wrote ${written.size} thumbnails to ${output}`);
}
async function commandGallery(args) {
    const [directory, output] = args.positional;
    const database = await scanNotes(directory);
    const count = await writeGallery(database, directory, output, {
        title: text(args, 'title') ?? basename(directory),
        isAnimated: args.flags.has('animated'),
    });
    console.log(`gallery with ${count} notes: ${join(output, 'index.html')}`);
}
async function commandPlaylist(args) {
    const [path] = args.positional;
    const format = (text(args, 'format') ??
        (path.toLowerCase().endsWith('.pls') ? 'ppm' : 'kwz'));
    const playlist = readPlaylist(await read(path), format);
    for (const entry of playlist.entries)
        console.log(entry);
    if (playlist.isChecksumValid === false)
        console.warn('warning: the checksum does not match');
}
const COMMANDS = {
    info: [1, commandInfo],
    check: [1, commandCheck],
    repair: [1, commandRepair],
    carve: [1, commandCarve],
    meta: [1, commandMeta],
    sign: [1, commandSign],
    verify: [1, commandVerify],
    keys: [1, commandKeys],
    convert: [2, commandConvert],
    frames: [2, commandFrames],
    thumbnail: [2, commandThumbnail],
    audio: [2, commandAudio],
    import: [2, commandImport],
    icon: [2, commandIcon],
    db: [1, commandDatabase],
    find: [1, commandFind],
    thumbs: [2, commandThumbs],
    gallery: [2, commandGallery],
    playlist: [1, commandPlaylist],
};
async function main(argv) {
    const [name, ...rest] = argv;
    const command = name ? COMMANDS[name] : undefined;
    const args = parseArguments(rest);
    if (!command || args.flags.has('help') || args.positional.length < command[0]) {
        console.log(HELP);
        return command || !name ? 0 : 1;
    }
    const keyPath = text(args, 'key');
    if (keyPath)
        setSigningKeys({ ...getSigningKeys(), ...(await loadSigningKeys(keyPath)) });
    const result = await command[1](args);
    return typeof result === 'number' ? result : 0;
}
main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
}, (error) => {
    console.error(error instanceof FlipnoteError ? `error: ${error.message}` : error);
    process.exitCode = 1;
});
