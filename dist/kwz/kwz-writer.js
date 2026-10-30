import { align4, concatBytes, isEqualBytes, readU32, writeU16, writeU32 } from '../core/bytes.js';
import { crc32 } from '../core/crc32.js';
import { check, ignoreWarning } from '../core/errors.js';
import { chooseSigningKey } from '../core/key-store.js';
import { rsaSign, rsaVerify } from '../core/rsa.js';
import { updateUtf16 } from '../core/text.js';
import { findJpegEnd } from '../media/jpeg.js';
import { writeKwzFilename, writeKwzFsid } from './kwz-filename.js';
import { readKwzSections } from './kwz-reader.js';
import { KWZ_COLOR_NONE, KWZ_FRAME_META_SIZE, KWZ_HEADER_SIZE, KWZ_PRIVATE_KEY, KWZ_PUBLIC_KEY, KWZ_SECTION_VERSIONS, KWZ_SIGNATURE_SIZE, KWZ_SOUND_HEADER_SIZE, KWZ_TRACK_NAMES, } from './kwz-types.js';
function validateKwz(file) {
    const { meta, frames } = file;
    check(frames.length >= 1 && frames.length <= 0xffff, 'INVALID_ARGUMENT', 'KWZ files need 1-65535 frames');
    check(meta.thumbnailIndex >= 0 && meta.thumbnailIndex < Math.max(1, frames.length), 'INVALID_ARGUMENT', 'Thumbnail index is out of range');
    check(meta.frameSpeed >= 0 && meta.frameSpeed <= 10, 'INVALID_ARGUMENT', 'KWZ frame speed must be 0-10');
    check(meta.bgmSpeed >= 0 && meta.bgmSpeed <= 10, 'INVALID_ARGUMENT', 'KWZ BGM speed must be 0-10');
    check(file.variant !== 'kwz' || file.thumbnail, 'INVALID_ARGUMENT', 'KWZ notes need a JPEG thumbnail');
    for (const frame of frames) {
        for (const data of frame.layerData) {
            check(data.length <= 0xffff && data.length % 2 === 0, 'INVALID_ARGUMENT', 'Invalid KWZ layer data size');
        }
        for (const color of frame.colors) {
            check(color >= 0 && color <= KWZ_COLOR_NONE, 'INVALID_ARGUMENT', 'KWZ colors must be 0-6');
        }
        check(frame.paper >= 0 && frame.paper <= KWZ_COLOR_NONE, 'INVALID_ARGUMENT', 'KWZ paper must be 0-6');
    }
}
/** Sections of the file being rewritten, used to keep unchanged ones byte for byte. */
class SourceSections {
    bytes;
    sections;
    constructor(bytes) {
        this.bytes = bytes;
        let sections = [];
        if (bytes) {
            try {
                sections = readKwzSections(bytes).sections;
            }
            catch {
                sections = [];
            }
        }
        this.sections = sections;
    }
    /** Copy of a section body, or null when the source has none. */
    body(name) {
        const section = this.sections.find((item) => item.name === name);
        if (!section || !this.bytes)
            return null;
        return this.bytes.slice(section.offset + 8, section.offset + 8 + section.size);
    }
    /** The whole section (header, body and padding) when its body starts with `content`. */
    match(name, content, contentOffset) {
        const section = this.sections.find((item) => item.name === name);
        if (!section || !this.bytes)
            return null;
        const body = this.bytes.subarray(section.offset + 8, section.offset + 8 + section.size);
        const end = contentOffset + content.length;
        if (section.size !== align4(end))
            return null;
        if (!isEqualBytes(body.subarray(contentOffset, end), content))
            return null;
        return this.bytes.subarray(section.offset, section.offset + 8 + section.size);
    }
}
function sectionHeader(name, size) {
    const header = new Uint8Array(8);
    for (let i = 0; i < 3; i++)
        header[i] = name.charCodeAt(i);
    header[3] = KWZ_SECTION_VERSIONS[name];
    writeU32(header, 4, size);
    return header;
}
/** Wraps a body (with its CRC slot at `crcOffset`, or -1) into a padded section. */
function buildSection(name, content, crcOffset = -1) {
    const size = align4(content.length);
    const out = new Uint8Array(8 + size);
    out.set(sectionHeader(name, size));
    out.set(content, 8);
    if (crcOffset >= 0)
        writeU32(out, 8 + crcOffset, crc32(out, 8 + crcOffset + 4));
    return out;
}
function encodeHeaderFlags(meta) {
    return ((meta.extraFlags & ~0x17) |
        (meta.isLocked ? 1 : 0) |
        (meta.isLooping ? 2 : 0) |
        (meta.isToolset ? 4 : 0) |
        (meta.is3d ? 0x10 : 0));
}
function encodeLayerFlags(meta) {
    return ((meta.extraLayerFlags & ~7) |
        (meta.isLayerVisible[0] ? 0 : 1) |
        (meta.isLayerVisible[1] ? 0 : 2) |
        (meta.isLayerVisible[2] ? 0 : 4));
}
function writeHeader(source, meta, frameCount) {
    const original = source.body('KFH');
    const body = original && original.length >= KWZ_HEADER_SIZE ? original : new Uint8Array(KWZ_HEADER_SIZE);
    writeU32(body, 4, meta.createdTime >>> 0);
    writeU32(body, 8, meta.modifiedTime >>> 0);
    writeU32(body, 12, meta.appVersion >>> 0);
    writeKwzFsid(body, 0x10, meta.rootAuthorId);
    writeKwzFsid(body, 0x1a, meta.parentAuthorId);
    writeKwzFsid(body, 0x24, meta.currentAuthorId);
    updateUtf16(body, 0x2e, 11, meta.rootAuthorName);
    updateUtf16(body, 0x44, 11, meta.parentAuthorName);
    updateUtf16(body, 0x5a, 11, meta.currentAuthorName);
    writeKwzFilename(body, 0x70, meta.rootFilename);
    writeKwzFilename(body, 0x8c, meta.parentFilename);
    writeKwzFilename(body, 0xa8, meta.currentFilename);
    writeU16(body, 0xc4, frameCount);
    writeU16(body, 0xc6, meta.thumbnailIndex);
    writeU16(body, 0xc8, encodeHeaderFlags(meta));
    body[0xca] = meta.frameSpeed;
    body[0xcb] = encodeLayerFlags(meta);
    const kept = source.match('KFH', body.subarray(4), 4);
    if (kept && readU32(body, 0) === crc32(body, 4))
        return kept;
    writeU32(body, 0, crc32(body, 4));
    return concatBytes([sectionHeader('KFH', body.length), body]);
}
function encodeFrameFlags(frame) {
    const c = frame.colors;
    return (((frame.paper & 15) |
        ((frame.keyLayers & 7) << 4) |
        (frame.extraFlags & 0x80) |
        (c[0] << 8) |
        (c[1] << 12) |
        (c[2] << 16) |
        (c[3] << 20) |
        (c[4] << 24) |
        (c[5] << 28)) >>>
        0);
}
function writeFrameMeta(source, frames) {
    const size = frames.length * KWZ_FRAME_META_SIZE;
    const original = source.body('KMI');
    const body = original && original.length >= size ? original.subarray(0, size) : new Uint8Array(size);
    frames.forEach((frame, i) => {
        const p = i * KWZ_FRAME_META_SIZE;
        writeU32(body, p, encodeFrameFlags(frame));
        frame.layerData.forEach((data, layer) => writeU16(body, p + 4 + layer * 2, data.length));
        writeKwzFsid(body, p + 0xa, frame.authorId);
        body.set(frame.layerDepths, p + 0x14);
        body[p + 0x17] = frame.soundFlags;
        writeU16(body, p + 0x18, frame.reserved);
        writeU16(body, p + 0x1a, frame.cameraFlags);
    });
    return source.match('KMI', body, 0) ?? buildSection('KMI', body);
}
function writeFrameData(source, frames) {
    const parts = [new Uint8Array(4)];
    for (const frame of frames)
        parts.push(...frame.layerData);
    const body = concatBytes(parts);
    const kept = source.match('KMC', body.subarray(4), 4);
    if (kept && readU32(kept, 8) === crc32(kept, 12))
        return kept;
    return buildSection('KMC', body, 0);
}
function writeThumbnail(source, thumbnail) {
    const original = source.body('KTN');
    if (original) {
        const jpeg = original.subarray(4, 4 + findJpegEnd(original.subarray(4)));
        const kept = isEqualBytes(jpeg, thumbnail) ? source.match('KTN', jpeg, 4) : null;
        if (kept && readU32(kept, 8) === crc32(kept, 12))
            return kept;
    }
    return buildSection('KTN', concatBytes([new Uint8Array(4), thumbnail]), 0);
}
function writeSound(source, file) {
    const tracks = file.tracks;
    const header = new Uint8Array(KWZ_SOUND_HEADER_SIZE);
    writeU32(header, 0, file.meta.bgmSpeed);
    KWZ_TRACK_NAMES.forEach((name, i) => writeU32(header, 4 + i * 4, tracks ? tracks[name].length : 0));
    const parts = [header];
    if (tracks)
        for (const name of KWZ_TRACK_NAMES)
            parts.push(tracks[name]);
    const body = concatBytes(parts);
    const original = source.body('KSN');
    if (original && original.length >= KWZ_SOUND_HEADER_SIZE)
        body.set(original.subarray(24, 28), 24);
    const kept = source.match('KSN', body, 0);
    if (kept && readU32(kept, 8 + 24) === crc32(kept, 8 + KWZ_SOUND_HEADER_SIZE))
        return kept;
    const section = buildSection('KSN', body);
    writeU32(section, 8 + 24, crc32(section, 8 + KWZ_SOUND_HEADER_SIZE));
    return section;
}
/**
 * Serializes a KWZ note, comment or folder icon. Sections whose content is unchanged
 * are copied from `file.source` with their original padding, so an unmodified file
 * is written back identically and keeps its signature.
 */
export function writeKwz(file, options = {}) {
    validateKwz(file);
    const source = new SourceSections(file.source);
    const sections = [];
    if (file.variant === 'icon')
        sections.push(sectionHeader('KIC', 0));
    else
        sections.push(writeHeader(source, file.meta, file.frames.length));
    if (file.variant === 'kwz')
        sections.push(writeThumbnail(source, file.thumbnail));
    sections.push(writeFrameData(source, file.frames));
    sections.push(writeFrameMeta(source, file.frames));
    if (file.variant === 'kwz')
        sections.push(writeSound(source, file));
    const body = concatBytes(sections);
    const sourceBody = file.source?.subarray(0, body.length);
    const original = file.signature && sourceBody && isEqualBytes(sourceBody, body) ? file.signature : null;
    const key = chooseSigningKey(options.key, KWZ_PRIVATE_KEY, () => !!original && rsaVerify(KWZ_PUBLIC_KEY, 'sha256', body, original));
    let signature = new Uint8Array(KWZ_SIGNATURE_SIZE);
    if (key) {
        signature = rsaSign(key, 'sha256', body);
    }
    else if (original) {
        signature = original.slice();
    }
    else if (file.signature && file.signature.some((value) => value !== 0)) {
        (options.onWarning ?? ignoreWarning)('The file changed and was left unsigned');
    }
    return concatBytes([body, signature]);
}
