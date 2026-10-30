import { decodeKwzAdpcm } from '../audio/adpcm.js';
import { readU16 } from '../core/bytes.js';
import { FlipnoteError } from '../core/errors.js';
import { getKwzSampleRate } from '../kwz/kwz-audio.js';
import { isDsiLibraryNote } from '../kwz/kwz-dsi-library.js';
import { isKwzFilename } from '../kwz/kwz-filename.js';
import { KwzFrameDecoder } from '../kwz/kwz-frame-codec.js';
import { readKwz, readKwzSections, verifyKwzChecksums } from '../kwz/kwz-reader.js';
import { KWZ_MAX_BGM_SECONDS, KWZ_MAX_DEPTH, KWZ_MAX_FRAMES, KWZ_MAX_SE_SECONDS, KWZ_SIGNATURE_SIZE, KWZ_TRACK_NAMES, } from '../kwz/kwz-types.js';
import { decodeJpeg } from '../media/jpeg.js';
import { isPpmFilename, isPpmFsid } from '../ppm/ppm-filename.js';
import { getPpmFrameData, PpmFrameDecoder } from '../ppm/ppm-frame-codec.js';
import { readPpm, readPpmLayout } from '../ppm/ppm-reader.js';
import { PPM_FORMAT_VERSION, PPM_MAX_BGM_SIZE, PPM_MAX_FILE_SIZE, PPM_MAX_FRAMES, PPM_MAX_SE_SIZE, PPM_SE_NAMES, } from '../ppm/ppm-types.js';
import { getMemoryUsage } from './memory.js';
import { detectFormat, getFrameCount, getVariant, writeNote, } from './note.js';
import { canEditNote } from './save.js';
import { identifyKey, verifyNote } from './signature.js';
class IssueList {
    issues = [];
    add(level, code, message, isRepairable = false, frame) {
        this.issues.push({
            level,
            code,
            message,
            isRepairable,
            ...(frame === undefined ? {} : { frame }),
        });
    }
}
function checkPpm(bytes, file, list, isCheckingFrames) {
    const { meta, animation, tracks } = file;
    const frameCount = animation.offsets.length;
    const layout = readPpmLayout(bytes);
    if (bytes.length !== layout.fileSize) {
        const delta = bytes.length - layout.fileSize;
        list.add('warning', 'structure', `File has ${Math.abs(delta)} ${delta > 0 ? 'extra' : 'missing'} bytes at the end`, true);
    }
    if (meta.formatVersion !== PPM_FORMAT_VERSION) {
        list.add('warning', 'structure', `Format version is 0x${meta.formatVersion.toString(16)}, not 0x24`, true);
    }
    if (frameCount > PPM_MAX_FRAMES) {
        list.add('warning', 'frame-limit', `${frameCount} frames exceed the app limit of ${PPM_MAX_FRAMES}`);
    }
    if (bytes.length > PPM_MAX_FILE_SIZE) {
        list.add('error', 'file-size', `File is larger than the app limit of ${PPM_MAX_FILE_SIZE} bytes`);
    }
    if (tracks.bgm.length > PPM_MAX_BGM_SIZE) {
        list.add('warning', 'track-length', 'BGM is longer than the 60 seconds the app records', true);
    }
    for (const name of PPM_SE_NAMES) {
        if (tracks[name].length > PPM_MAX_SE_SIZE) {
            list.add('warning', 'track-length', `${name} is longer than 2 seconds`, true);
        }
    }
    if (meta.frameSpeed < 1 || meta.frameSpeed > 8 || meta.bgmSpeed < 1 || meta.bgmSpeed > 8) {
        list.add('error', 'speed', 'Frame or BGM speed is outside 1-8', true);
    }
    if (meta.thumbnailIndex >= frameCount) {
        list.add('error', 'thumbnail', 'Thumbnail frame index is out of range', true);
    }
    for (const [label, id] of [
        ['root', meta.rootAuthorId],
        ['parent', meta.parentAuthorId],
        ['current', meta.currentAuthorId],
    ]) {
        if (!isPpmFsid(id)) {
            list.add('info', 'author', `The ${label} author ID ${id} is not a valid Flipnote Studio ID`);
        }
    }
    if (meta.currentFilename.mac !== meta.currentAuthorId.slice(10)) {
        list.add('info', 'filename', 'Filename MAC differs from the author ID (edited on another console)');
    }
    if (meta.isLocked)
        list.add('info', 'locked', 'Locked: only the current author can edit it');
    if (!isCheckingFrames)
        return;
    const decoder = new PpmFrameDecoder(file);
    for (let index = 0; index < frameCount; index++) {
        try {
            getPpmFrameData(animation, index);
            decoder.decode(index);
        }
        catch (error) {
            if (!(error instanceof FlipnoteError))
                throw error;
            list.add('error', 'frame-data', `Frame ${index} is damaged: ${error.message}`, true, index);
            break;
        }
    }
}
function checkKwz(bytes, file, list, isCheckingFrames) {
    const { meta, frames, variant } = file;
    const { sections, bodyLength } = readKwzSections(bytes);
    for (const [section, isValid] of Object.entries(verifyKwzChecksums(bytes))) {
        if (!isValid)
            list.add('error', 'checksum', `${section} CRC32 does not match`, true);
    }
    const tail = bytes.length - bodyLength;
    if (tail !== KWZ_SIGNATURE_SIZE) {
        list.add(tail > KWZ_SIGNATURE_SIZE ? 'warning' : 'error', 'structure', `Expected a 256-byte signature after the sections, found ${tail} bytes`, true);
    }
    const kfh = sections.find((section) => section.name === 'KFH');
    if (kfh && readU16(bytes, kfh.offset + 8 + 0xc4) !== frames.length) {
        list.add('error', 'structure', 'Frame count in the header does not match the frame table', true);
    }
    if (variant === 'icon' && frames.length !== 1) {
        list.add('error', 'structure', 'Folder icons must have exactly one frame', true);
    }
    if (variant !== 'icon' && frames.length > KWZ_MAX_FRAMES) {
        list.add('warning', 'frame-limit', `${frames.length} frames exceed the app limit of ${KWZ_MAX_FRAMES}`);
    }
    if (variant === 'kwz') {
        const usage = getMemoryUsage(file);
        if (usage.level > 1) {
            list.add('warning', 'memory-limit', `Memory meter is at ${Math.round(usage.level * 100)}%`);
        }
        if (meta.frameSpeed > 10 || meta.bgmSpeed > 10) {
            list.add('error', 'speed', 'Frame or BGM speed is outside 0-10', true);
        }
        if (meta.thumbnailIndex >= frames.length) {
            list.add('error', 'thumbnail', 'Thumbnail frame index is out of range', true);
        }
        try {
            const image = decodeJpeg(file.thumbnail);
            if (image.width !== 80 || image.height !== 64) {
                list.add('warning', 'thumbnail', `Thumbnail is ${image.width}x${image.height}, not 80x64`, true);
            }
        }
        catch {
            list.add('error', 'thumbnail', 'Thumbnail is not a valid JPEG', true);
        }
        const rate = getKwzSampleRate(file);
        for (const name of KWZ_TRACK_NAMES) {
            const data = file.tracks?.[name];
            if (!data || data.length === 0)
                continue;
            const seconds = decodeKwzAdpcm(data).length / rate;
            const limit = name === 'bgm' ? KWZ_MAX_BGM_SECONDS : KWZ_MAX_SE_SECONDS;
            if (seconds > limit + 0.1) {
                list.add('warning', 'track-length', `${name} is longer than ${limit} seconds`, true);
            }
        }
        for (const [label, name] of [
            ['root', meta.rootFilename],
            ['parent', meta.parentFilename],
            ['current', meta.currentFilename],
        ]) {
            if (!isKwzFilename(name) && !isPpmFilename(name)) {
                list.add('warning', 'filename', `The ${label} filename "${name}" is not valid`);
            }
        }
        if (meta.isLocked)
            list.add('info', 'locked', 'Locked: only the current author can edit it');
        if (isDsiLibraryNote(file)) {
            list.add('info', 'dsi-library', 'Converted from PPM by the DSi Library service');
        }
    }
    frames.forEach((frame, index) => {
        if (frame.layerDepths.some((depth) => depth > KWZ_MAX_DEPTH)) {
            list.add('warning', 'colors', `Frame ${index} has a layer depth above ${KWZ_MAX_DEPTH}`, true, index);
        }
        if (frame.paper > 6 || frame.colors.some((color) => color > 6)) {
            list.add('error', 'colors', `Frame ${index} uses a color index above 6 (the app has white, black, red, yellow, green, blue and none)`, true, index);
        }
    });
    if (!isCheckingFrames)
        return;
    const decoder = new KwzFrameDecoder(file, { isTolerant: true });
    for (let index = 0; index < frames.length; index++) {
        decoder.decode(index);
        if (decoder.truncatedLayers) {
            list.add('error', 'frame-data', `Frame ${index} layer data is truncated`, true, index);
            break;
        }
    }
}
/**
 * Checks whether the console would accept a file: structure, checksums, signature,
 * app limits and frame data. Never throws for malformed input.
 */
export function checkNote(bytes, options = {}) {
    const list = new IssueList();
    const format = detectFormat(bytes);
    let note = null;
    try {
        note = format === 'ppm' ? readPpm(bytes) : format === 'kwz' ? readKwz(bytes) : null;
    }
    catch (error) {
        if (!(error instanceof FlipnoteError))
            throw error;
        list.add('error', 'unreadable', error.message, true);
    }
    if (!format)
        list.add('error', 'unreadable', 'Not a PPM or KWZ file');
    const isSigned = verifyNote(bytes);
    if (note) {
        const isCheckingFrames = options.isCheckingFrames ?? true;
        if (note.format === 'ppm')
            checkPpm(bytes, note, list, isCheckingFrames);
        else
            checkKwz(bytes, note, list, isCheckingFrames);
        if (!isSigned) {
            list.add('error', 'signature', 'Signature is missing or invalid; the console will reject the file', true);
        }
        if (getFrameCount(note) === 0)
            list.add('error', 'structure', 'The file has no frames');
    }
    const issues = list.issues;
    return {
        format,
        variant: note ? getVariant(note) : null,
        isReadable: note !== null,
        isSigned,
        isCompatible: note !== null && !issues.some((issue) => issue.level === 'error'),
        issues,
    };
}
/**
 * Checks a note before saving: everything checkNote() finds in the file it would produce,
 * plus a missing or mismatched signing key, a lock held by another author and writer warnings.
 */
export function preflightNote(note, options = {}) {
    const warnings = [];
    const keyFormat = options.key ? identifyKey(options.key) : null;
    const key = options.key && keyFormat !== note.format ? null : options.key;
    const bytes = writeNote(note, { key, onWarning: (message) => warnings.push(message) });
    const report = checkNote(bytes, options);
    const extra = [];
    if (options.key && keyFormat !== note.format) {
        const name = keyFormat ? `a ${keyFormat.toUpperCase()} key` : 'not a Flipnote key';
        extra.push({
            level: 'error',
            code: 'signature',
            message: `The signing key is ${name}`,
            isRepairable: false,
        });
    }
    else if (!options.key && !report.isSigned) {
        const message = 'The saved file would be unsigned, so the console would reject it';
        extra.push({ level: 'error', code: 'signature', message, isRepairable: true });
    }
    if (options.author && !canEditNote(note, options.author.id)) {
        const message = 'The note is locked by another author, so it cannot be saved as yours';
        extra.push({ level: 'error', code: 'locked', message, isRepairable: false });
    }
    for (const message of warnings) {
        if (!message.includes('unsigned')) {
            extra.push({ level: 'warning', code: 'structure', message, isRepairable: false });
        }
    }
    const issues = [
        ...extra,
        ...report.issues.filter((issue) => issue.code !== 'signature' || !extra.some((e) => e.code === 'signature')),
    ];
    return {
        ...report,
        issues,
        isCompatible: !issues.some((issue) => issue.level === 'error'),
        bytes,
    };
}
