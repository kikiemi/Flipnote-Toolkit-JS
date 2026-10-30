import { findBytes, isEqualBytes, readU16, readU32 } from '../core/bytes.js';
import { FlipnoteError, ignoreWarning } from '../core/errors.js';
import { analyzeKwzLayer, createKwzFrame, KwzFrameDecoder, KwzFrameEncoder, } from '../kwz/kwz-frame-codec.js';
import { createEmptyKwzMeta, readKwz, readKwzFrameMeta, readKwzMeta, readKwzSections, } from '../kwz/kwz-reader.js';
import { renderKwzFrame } from '../kwz/kwz-render.js';
import { createKwzThumbnail } from '../kwz/kwz-thumbnail.js';
import { KWZ_DEFAULT_FRAME_EXTRA_FLAGS, KWZ_FRAME_META_SIZE, KWZ_HEADER_SIZE, KWZ_MAX_DEPTH, KWZ_SECTION_NAMES, KWZ_SECTION_VERSIONS, KWZ_SIGNATURE_SIZE, KWZ_SOUND_HEADER_SIZE, KWZ_TRACK_NAMES, } from '../kwz/kwz-types.js';
import { decodeJpeg } from '../media/jpeg.js';
import { decodePpmFrame, packPpmAnimation, PpmFrameEncoder, } from '../ppm/ppm-frame-codec.js';
import { computePpmLayout, readPpm, readPpmLayout, readPpmMeta } from '../ppm/ppm-reader.js';
import { renderPpmFrame } from '../ppm/ppm-render.js';
import { createPpmThumbnail } from '../ppm/ppm-thumbnail.js';
import { PPM_ANIMATION_OFFSET, PPM_FORMAT_VERSION, PPM_FRAME_TABLE_OFFSET, PPM_LAYER_SIZE, PPM_SIGNATURE_SIZE, PPM_SOUND_HEADER_SIZE, PPM_TRACK_NAMES, } from '../ppm/ppm-types.js';
import { checkNote } from './check.js';
import { decodeFrames } from './edit.js';
import { detectFormat, getFrameCount, writeNote } from './note.js';
class RepairLog {
    actions = [];
    damagedFrames = [];
    add(action) {
        this.actions.push(action);
    }
}
function clampSpeed(value, min, max, fallback) {
    return value >= min && value <= max ? value : fallback;
}
function fixPpmMeta(file, log) {
    const meta = file.meta;
    const frameCount = file.animation.offsets.length;
    if (meta.frameSpeed < 1 || meta.frameSpeed > 8) {
        meta.frameSpeed = clampSpeed(meta.bgmSpeed, 1, 8, 6);
        log.add(`Set the frame speed to ${meta.frameSpeed}`);
    }
    if (meta.bgmSpeed < 1 || meta.bgmSpeed > 8) {
        meta.bgmSpeed = meta.frameSpeed;
        log.add(`Set the BGM speed to ${meta.bgmSpeed}`);
    }
    if (meta.thumbnailIndex >= frameCount) {
        meta.thumbnailIndex = 0;
        log.add('Reset the thumbnail frame to frame 0');
    }
    if (meta.formatVersion !== PPM_FORMAT_VERSION) {
        meta.formatVersion = PPM_FORMAT_VERSION;
        log.add('Set the format version to 0x24');
    }
}
/** Decodes what it can, frame by frame; damaged frames repeat the last good picture. */
function salvagePpmFrames(data, offsets, soundFlags, thumbnailIndex, log) {
    let previous = [new Uint8Array(PPM_LAYER_SIZE), new Uint8Array(PPM_LAYER_SIZE)];
    let target = [new Uint8Array(PPM_LAYER_SIZE), new Uint8Array(PPM_LAYER_SIZE)];
    const encoder = new PpmFrameEncoder();
    const encoded = [];
    let header = 0x83;
    let thumbnail = null;
    offsets.forEach((offset, index) => {
        try {
            if (offset >= data.length) {
                throw new FlipnoteError('CORRUPT_DATA', 'Frame offset is out of bounds');
            }
            decodePpmFrame(data, offset, previous, target);
            [previous, target] = [target, previous];
            header = data[offset];
        }
        catch (error) {
            if (!(error instanceof FlipnoteError))
                throw error;
            log.damagedFrames.push(index);
        }
        const frame = {
            paper: header & 1,
            pens: [(header >> 1) & 3, (header >> 3) & 3],
            layers: previous,
            soundFlags: soundFlags[index],
        };
        if (index === thumbnailIndex) {
            thumbnail = { ...frame, layers: [previous[0].slice(), previous[1].slice()] };
        }
        encoded.push(encoder.encode(frame));
    });
    if (log.damagedFrames.length) {
        log.add(`Replaced ${log.damagedFrames.length} damaged frames with the previous picture`);
    }
    return { encoded, thumbnail };
}
function salvagePpm(bytes, log) {
    if (bytes.length < PPM_FRAME_TABLE_OFFSET + 4)
        return null;
    const headerCount = readU16(bytes, 0xc) + 1;
    const tableSize = readU16(bytes, PPM_ANIMATION_OFFSET);
    const tableCount = tableSize % 4 === 0 ? tableSize / 4 : 0;
    const fitting = Math.floor((bytes.length - PPM_FRAME_TABLE_OFFSET) / 4);
    const frameCount = tableCount > 0 && tableCount <= fitting ? tableCount : Math.min(headerCount, fitting);
    if (frameCount !== headerCount) {
        log.add(`Corrected the frame count from ${headerCount} to ${frameCount}`);
    }
    const dataStart = PPM_FRAME_TABLE_OFFSET + frameCount * 4;
    let dataEnd = PPM_ANIMATION_OFFSET + readU32(bytes, 4);
    if (dataEnd < dataStart || dataEnd > bytes.length) {
        dataEnd = bytes.length;
        log.add('Animation data size was invalid; read frames up to the end of the file');
    }
    const offsets = Array.from({ length: frameCount }, (_, i) => readU32(bytes, PPM_FRAME_TABLE_OFFSET + i * 4));
    const soundFlags = new Uint8Array(frameCount);
    soundFlags.set(bytes.subarray(dataEnd, Math.min(bytes.length, dataEnd + frameCount)));
    const storedThumbnailIndex = readU16(bytes, 0x12);
    const thumbnailIndex = storedThumbnailIndex < frameCount ? storedThumbnailIndex : 0;
    const data = bytes.subarray(dataStart, dataEnd);
    const { encoded, thumbnail } = salvagePpmFrames(data, offsets, soundFlags, thumbnailIndex, log);
    if (!thumbnail || log.damagedFrames.length === frameCount)
        return null;
    const layout = computePpmLayout(frameCount, dataEnd - dataStart, [0, 0, 0, 0]);
    const hasSound = layout.soundHeaderOffset + PPM_SOUND_HEADER_SIZE <= bytes.length;
    const tracks = {};
    let p = layout.soundHeaderOffset + PPM_SOUND_HEADER_SIZE;
    PPM_TRACK_NAMES.forEach((name, i) => {
        const size = hasSound ? readU32(bytes, layout.soundHeaderOffset + i * 4) : 0;
        const available = Math.max(0, Math.min(size, bytes.length - p));
        if (available < size)
            log.add(`Cut the ${name} track to the ${available} bytes that remain`);
        tracks[name] = bytes.slice(p, p + available);
        p += available;
    });
    if (!hasSound)
        log.add('Sound data is missing; the note was rebuilt without audio');
    const header = new Uint8Array(layout.soundEnd);
    header.set(bytes.subarray(0, Math.min(bytes.length, header.length)));
    if (!hasSound)
        header.fill(2, layout.soundHeaderOffset + 16, layout.soundHeaderOffset + 18);
    const meta = readPpmMeta(header, layout);
    const file = {
        format: 'ppm',
        meta: { ...meta, thumbnailIndex },
        thumbnail: createPpmThumbnail(renderPpmFrame(thumbnail, undefined, { visible: meta.isLayerVisible })),
        animation: packPpmAnimation(encoded, soundFlags),
        tracks,
        signature: new Uint8Array(PPM_SIGNATURE_SIZE),
        source: null,
    };
    log.add('Rebuilt the thumbnail');
    fixPpmMeta(file, log);
    return file;
}
function repairPpm(bytes, log) {
    let file = null;
    try {
        file = readPpm(bytes);
        const decoded = decodeFrames(file);
        if (decoded.length === 0)
            file = null;
    }
    catch (error) {
        if (!(error instanceof FlipnoteError))
            throw error;
        file = null;
    }
    if (!file)
        return salvagePpm(bytes, log);
    file = { ...file, meta: { ...file.meta } };
    fixPpmMeta(file, log);
    const layout = readPpmLayout(bytes);
    if (layout && bytes.length > layout.fileSize) {
        log.add(`Removed ${bytes.length - layout.fileSize} trailing bytes`);
    }
    if (layout && bytes.length < layout.fileSize)
        log.add('Restored the missing signature area');
    return file;
}
/** Finds sections by their magic, even when sizes or order are damaged. */
function scanKwzSections(bytes, log) {
    const found = [];
    for (const name of KWZ_SECTION_NAMES) {
        const magic = Uint8Array.from([...name].map((char) => char.charCodeAt(0)).concat(KWZ_SECTION_VERSIONS[name]));
        const offset = findBytes(bytes, magic, 0, 4);
        if (offset >= 0)
            found.push({ name, offset, size: readU32(bytes, offset + 4) });
    }
    found.sort((a, b) => a.offset - b.offset);
    found.forEach((section, i) => {
        const limit = (found[i + 1]?.offset ?? bytes.length) - section.offset - 8;
        if (section.size > limit && section.name !== 'KIC') {
            log.add(`${section.name} section claimed ${section.size} bytes; only ${limit} are present`);
            section.size = Math.max(0, limit);
        }
    });
    return found;
}
function readFrameRecords(bytes, table, frameCount, dataStart, dataEnd, log) {
    const records = [];
    let p = dataStart;
    for (let i = 0; i < frameCount; i++) {
        const at = table + i * KWZ_FRAME_META_SIZE;
        const layerData = [0, 1, 2].map((layer) => {
            const size = readU16(bytes, at + 4 + layer * 2);
            const data = bytes.subarray(Math.min(p, dataEnd), Math.min(p + size, dataEnd));
            p += size;
            return data;
        });
        records.push({ ...readKwzFrameMeta(bytes, at), layerData });
    }
    if (p > dataEnd) {
        log.add(`Frame data is ${p - dataEnd} bytes short; missing tiles keep the previous picture`);
    }
    return records;
}
/**
 * Rebuilds the frame table from the layer streams alone when KMI is lost: each stream's
 * length is found by walking its tiles. Colors and depths cannot be recovered.
 */
function rebuildFrameRecords(data, log) {
    const records = [];
    let p = 0;
    while (p < data.length) {
        const layerData = [];
        let keyLayers = 0;
        for (let layer = 0; layer < 3; layer++) {
            const stats = analyzeKwzLayer(data.subarray(p));
            const size = Math.min(stats.byteLength, data.length - p);
            layerData.push(data.subarray(p, p + size));
            if (stats.skippedTiles === 0)
                keyLayers |= 1 << layer;
            p += size;
        }
        records.push({
            ...createKwzFrame(),
            layerData: layerData,
            keyLayers,
            extraFlags: KWZ_DEFAULT_FRAME_EXTRA_FLAGS,
            reserved: 0,
        });
    }
    log.add(`Frame table was lost; rebuilt ${records.length} frames from the layer data with default colors`);
    return records;
}
function salvageKwz(bytes, log) {
    const sections = scanKwzSections(bytes, log);
    const find = (name) => sections.find((section) => section.name === name);
    const kfh = find('KFH');
    const kmc = find('KMC');
    const kmi = find('KMI');
    const ktn = find('KTN');
    const ksn = find('KSN');
    if (!kmc)
        return null;
    const meta = kfh && kfh.size >= KWZ_HEADER_SIZE ? readKwzMeta(bytes, kfh.offset + 8) : createEmptyKwzMeta();
    if (kfh && kfh.size < KWZ_HEADER_SIZE)
        log.add('Header was truncated; metadata was reset');
    const variant = find('KIC') ? 'icon' : ktn || ksn ? 'kwz' : 'kwc';
    const dataStart = kmc.offset + 12;
    const dataEnd = kmc.offset + 8 + kmc.size;
    const records = kmi
        ? readFrameRecords(bytes, kmi.offset + 8, Math.floor(kmi.size / KWZ_FRAME_META_SIZE), dataStart, dataEnd, log)
        : rebuildFrameRecords(bytes.subarray(dataStart, dataEnd), log);
    if (records.length === 0)
        return null;
    const decoder = new KwzFrameDecoder(records, { isTolerant: true });
    const encoder = new KwzFrameEncoder();
    const frames = [];
    let thumbnailPixels = null;
    for (let i = 0; i < records.length; i++) {
        const frame = decoder.decode(i);
        if (decoder.truncatedLayers)
            log.damagedFrames.push(i);
        const layerDepths = frame.layerDepths.map((depth) => Math.min(depth, KWZ_MAX_DEPTH));
        const { layerData, keyLayers } = encoder.encode(frame);
        frames.push({ ...records[i], ...frame, layerDepths, layerData, keyLayers });
        if (i === Math.min(meta.thumbnailIndex, records.length - 1)) {
            thumbnailPixels = renderKwzFrame(frame, undefined, { visible: meta.isLayerVisible });
        }
    }
    if (log.damagedFrames.length) {
        log.add(`Recovered ${log.damagedFrames.length} frames with damaged layer data`);
    }
    log.add('Re-encoded the frame data');
    let tracks = null;
    if (variant === 'kwz') {
        tracks = {};
        const base = ksn ? ksn.offset + 8 : -1;
        let q = base + KWZ_SOUND_HEADER_SIZE;
        const end = ksn ? base + ksn.size : 0;
        for (let i = 0; i < KWZ_TRACK_NAMES.length; i++) {
            const size = ksn && ksn.size >= KWZ_SOUND_HEADER_SIZE ? readU32(bytes, base + 4 + i * 4) : 0;
            const available = Math.max(0, Math.min(size, end - q));
            if (available < size)
                log.add(`Cut the ${KWZ_TRACK_NAMES[i]} track to ${available} bytes`);
            tracks[KWZ_TRACK_NAMES[i]] = ksn ? bytes.slice(q, q + available) : new Uint8Array(0);
            q += available;
        }
        if (ksn && ksn.size >= 4)
            meta.bgmSpeed = readU32(bytes, base);
        if (!ksn)
            log.add('Sound section is missing; the note was rebuilt without audio');
    }
    let thumbnail = null;
    if (variant === 'kwz') {
        const stored = ktn ? bytes.slice(ktn.offset + 12, ktn.offset + 8 + ktn.size) : null;
        thumbnail = stored && isDecodableJpeg(stored) ? stored : createKwzThumbnail(thumbnailPixels);
        if (thumbnail !== stored)
            log.add('Rebuilt the thumbnail');
    }
    return { format: 'kwz', variant, meta, thumbnail, frames, tracks, signature: null, source: null };
}
function isDecodableJpeg(data) {
    try {
        decodeJpeg(data);
        return true;
    }
    catch {
        return false;
    }
}
function fixKwzMeta(file, log) {
    const meta = file.meta;
    if (meta.frameSpeed > 10) {
        meta.frameSpeed = 7;
        log.add('Set the frame speed to 7');
    }
    if (meta.bgmSpeed > 10) {
        meta.bgmSpeed = meta.frameSpeed;
        log.add('Set the BGM speed to the frame speed');
    }
    if (meta.thumbnailIndex >= file.frames.length) {
        meta.thumbnailIndex = 0;
        log.add('Reset the thumbnail frame to frame 0');
    }
}
/** Reads a KWZ that only needs light fixes, or returns null when it must be salvaged. */
function readIntactKwz(bytes, log) {
    try {
        const file = readKwz(bytes);
        const decoder = new KwzFrameDecoder(file, { isTolerant: true });
        for (let i = 0; i < file.frames.length; i++) {
            decoder.decode(i);
            if (decoder.truncatedLayers)
                return null;
        }
        if (file.variant === 'kwz' && !isDecodableJpeg(file.thumbnail))
            return null;
        const extra = bytes.length - readKwzSections(bytes).bodyLength - KWZ_SIGNATURE_SIZE;
        if (extra > 0)
            log.add(`Removed ${extra} trailing bytes`);
        return { ...file, meta: { ...file.meta } };
    }
    catch (error) {
        if (!(error instanceof FlipnoteError))
            throw error;
        return null;
    }
}
function repairKwz(bytes, log) {
    const file = readIntactKwz(bytes, log) ?? salvageKwz(bytes, log);
    if (file)
        fixKwzMeta(file, log);
    return file;
}
/**
 * Repairs a damaged PPM or KWZ: fixes sizes, counts, checksums, speeds and thumbnails,
 * recovers every frame that can still be decoded and signs the result.
 */
export function repairNote(bytes, options = {}) {
    const before = checkNote(bytes);
    const log = new RepairLog();
    const format = detectFormat(bytes) ?? findLikelyFormat(bytes);
    let note = null;
    if (format === 'ppm')
        note = repairPpm(bytes, log);
    else if (format === 'kwz')
        note = repairKwz(bytes, log);
    if (!note) {
        return {
            note: null,
            bytes: null,
            actions: log.actions,
            damagedFrames: log.damagedFrames,
            before,
            after: null,
        };
    }
    const key = options.keys?.[note.format];
    const out = writeNote(note, { key, onWarning: options.onWarning ?? ignoreWarning });
    const after = checkNote(out);
    if (!after.isSigned) {
        log.add('Left unsigned; sign it before copying it to a console');
    }
    else if (!before.isSigned || !isEqualBytes(out, bytes)) {
        log.add('Signed the file');
    }
    if (getFrameCount(note) === 0) {
        return {
            note: null,
            bytes: null,
            actions: log.actions,
            damagedFrames: log.damagedFrames,
            before,
            after: null,
        };
    }
    return {
        note,
        bytes: out,
        actions: log.actions,
        damagedFrames: log.damagedFrames,
        before,
        after,
    };
}
function findLikelyFormat(bytes) {
    const text = (value) => Uint8Array.from([...value].map((char) => char.charCodeAt(0)));
    if (findBytes(bytes, text('KMC'), 0, 4) >= 0 && findBytes(bytes, text('KMI'), 0, 4) >= 0) {
        return 'kwz';
    }
    return null;
}
/** Finds PPM and KWZ files embedded in other data, such as SD card or NAND images. */
export function carveNotes(bytes) {
    const found = [];
    const para = Uint8Array.from([0x50, 0x41, 0x52, 0x41]);
    for (let at = findBytes(bytes, para); at >= 0; at = findBytes(bytes, para, at + 4)) {
        if (readU16(bytes, at + 0xe) !== PPM_FORMAT_VERSION)
            continue;
        const rest = bytes.subarray(at);
        const layout = readPpmLayout(rest);
        const size = layout ? Math.min(layout.fileSize, rest.length) : rest.length;
        found.push({
            offset: at,
            format: 'ppm',
            bytes: rest.slice(0, size),
            isComplete: !!layout && layout.fileSize <= rest.length,
        });
    }
    for (const magic of ['KFH', 'KIC']) {
        const pattern = Uint8Array.from([...magic]
            .map((char) => char.charCodeAt(0))
            .concat(KWZ_SECTION_VERSIONS[magic]));
        for (let at = findBytes(bytes, pattern); at >= 0; at = findBytes(bytes, pattern, at + 4)) {
            const rest = bytes.subarray(at);
            let bodyLength = 0;
            let isComplete = true;
            try {
                bodyLength = readKwzSections(rest).bodyLength;
            }
            catch {
                isComplete = false;
                bodyLength = rest.length;
            }
            const size = Math.min(rest.length, bodyLength + KWZ_SIGNATURE_SIZE);
            if (bodyLength + KWZ_SIGNATURE_SIZE > rest.length)
                isComplete = false;
            found.push({ offset: at, format: 'kwz', bytes: rest.slice(0, size), isComplete });
        }
    }
    return found.sort((a, b) => a.offset - b.offset);
}
