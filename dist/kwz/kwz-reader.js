import { readU16, readU32 } from '../core/bytes.js';
import { crc32 } from '../core/crc32.js';
import { check } from '../core/errors.js';
import { readAscii, readUtf16 } from '../core/text.js';
import { findJpegEnd } from '../media/jpeg.js';
import { readKwzFilename, readKwzFsid } from './kwz-filename.js';
import { KWZ_EMPTY_AUTHOR_ID, KWZ_FRAME_META_SIZE, KWZ_HEADER_SIZE, KWZ_SECTION_NAMES, KWZ_SIGNATURE_SIZE, KWZ_SOUND_HEADER_SIZE, KWZ_TRACK_NAMES, } from './kwz-types.js';
export function isKwz(bytes) {
    if (bytes.length < 8)
        return false;
    const magic = readAscii(bytes, 0, 3);
    return magic === 'KFH' || magic === 'KMC' || magic === 'KIC';
}
/** Lists the sections and the byte length of the unsigned body. */
export function readKwzSections(bytes) {
    const sections = [];
    let offset = 0;
    while (offset + 8 <= bytes.length && sections.length < 8) {
        const name = readAscii(bytes, offset, 3);
        if (!KWZ_SECTION_NAMES.includes(name))
            break;
        const size = readU32(bytes, offset + 4);
        check(offset + 8 + size <= bytes.length, 'CORRUPT_DATA', `${name} section is truncated`);
        sections.push({ name, version: bytes[offset + 3], offset, size });
        offset += 8 + size;
    }
    return { sections, bodyLength: offset };
}
export function createEmptyKwzMeta() {
    return {
        createdTime: 0,
        modifiedTime: 0,
        appVersion: 0,
        rootAuthorId: KWZ_EMPTY_AUTHOR_ID,
        parentAuthorId: KWZ_EMPTY_AUTHOR_ID,
        currentAuthorId: KWZ_EMPTY_AUTHOR_ID,
        rootAuthorName: '',
        parentAuthorName: '',
        currentAuthorName: '',
        rootFilename: '',
        parentFilename: '',
        currentFilename: '',
        thumbnailIndex: 0,
        frameSpeed: 0,
        bgmSpeed: 0,
        isLocked: false,
        isLooping: false,
        isToolset: false,
        is3d: false,
        extraFlags: 0,
        isLayerVisible: [true, true, true],
        extraLayerFlags: 0,
    };
}
/** Reads KFH metadata from its body (after the 8-byte section header). */
export function readKwzMeta(bytes, body) {
    const flags = readU16(bytes, body + 0xc8);
    const layerFlags = bytes[body + 0xcb];
    return {
        createdTime: readU32(bytes, body + 4),
        modifiedTime: readU32(bytes, body + 8),
        appVersion: readU32(bytes, body + 12),
        rootAuthorId: readKwzFsid(bytes, body + 0x10),
        parentAuthorId: readKwzFsid(bytes, body + 0x1a),
        currentAuthorId: readKwzFsid(bytes, body + 0x24),
        rootAuthorName: readUtf16(bytes, body + 0x2e, 11),
        parentAuthorName: readUtf16(bytes, body + 0x44, 11),
        currentAuthorName: readUtf16(bytes, body + 0x5a, 11),
        rootFilename: readKwzFilename(bytes, body + 0x70),
        parentFilename: readKwzFilename(bytes, body + 0x8c),
        currentFilename: readKwzFilename(bytes, body + 0xa8),
        thumbnailIndex: readU16(bytes, body + 0xc6),
        frameSpeed: bytes[body + 0xca],
        bgmSpeed: bytes[body + 0xca],
        isLocked: (flags & 0x1) !== 0,
        isLooping: (flags & 0x2) !== 0,
        isToolset: (flags & 0x4) !== 0,
        is3d: (flags & 0x10) !== 0,
        extraFlags: flags & ~0x17,
        isLayerVisible: [(layerFlags & 1) === 0, (layerFlags & 2) === 0, (layerFlags & 4) === 0],
        extraLayerFlags: layerFlags & ~7,
    };
}
/** Reads one 28-byte KMI entry; layer data is attached by the caller. */
export function readKwzFrameMeta(bytes, p) {
    const flags = readU32(bytes, p);
    return {
        paper: flags & 0xf,
        colors: [
            (flags >> 8) & 15,
            (flags >> 12) & 15,
            (flags >> 16) & 15,
            (flags >> 20) & 15,
            (flags >> 24) & 15,
            flags >>> 28,
        ],
        layerDepths: [bytes[p + 0x14], bytes[p + 0x15], bytes[p + 0x16]],
        soundFlags: bytes[p + 0x17],
        cameraFlags: readU16(bytes, p + 0x1a),
        authorId: readKwzFsid(bytes, p + 0xa),
        keyLayers: (flags >> 4) & 7,
        extraFlags: flags & 0x80,
        reserved: readU16(bytes, p + 0x18),
    };
}
/**
 * Parses a KWZ note, KWC comment or folder icon without copying: frames, thumbnail and
 * audio stay encoded and reference `bytes`, which must not be modified while in use.
 */
export function readKwz(bytes) {
    check(isKwz(bytes), 'INVALID_FORMAT', 'Not a KWZ file (missing KFH, KMC or KIC section)');
    const { sections, bodyLength } = readKwzSections(bytes);
    const find = (name) => sections.find((section) => section.name === name);
    const kfh = find('KFH');
    const ktn = find('KTN');
    const kmc = find('KMC');
    const kmi = find('KMI');
    const ksn = find('KSN');
    const kic = find('KIC');
    check(kmc && kmi, 'CORRUPT_DATA', 'KWZ file has no frame data');
    if (kfh)
        check(kfh.size >= KWZ_HEADER_SIZE, 'CORRUPT_DATA', 'KFH section is too small');
    const meta = kfh ? readKwzMeta(bytes, kfh.offset + 8) : createEmptyKwzMeta();
    const frames = [];
    const frameCount = Math.floor(kmi.size / KWZ_FRAME_META_SIZE);
    let dataOffset = kmc.offset + 12;
    const dataEnd = kmc.offset + 8 + kmc.size;
    for (let i = 0; i < frameCount; i++) {
        const p = kmi.offset + 8 + i * KWZ_FRAME_META_SIZE;
        const record = readKwzFrameMeta(bytes, p);
        const sizes = [readU16(bytes, p + 4), readU16(bytes, p + 6), readU16(bytes, p + 8)];
        const layerData = sizes.map((size) => {
            check(dataOffset + size <= dataEnd, 'CORRUPT_DATA', `Frame ${i} layer data is truncated`);
            const data = bytes.subarray(dataOffset, dataOffset + size);
            dataOffset += size;
            return data;
        });
        frames.push({ ...record, layerData });
    }
    let tracks = null;
    if (ksn) {
        const base = ksn.offset + 8;
        meta.bgmSpeed = readU32(bytes, base);
        let p = base + KWZ_SOUND_HEADER_SIZE;
        tracks = {};
        for (let i = 0; i < KWZ_TRACK_NAMES.length; i++) {
            const size = readU32(bytes, base + 4 + i * 4);
            check(p + size <= base + ksn.size, 'CORRUPT_DATA', 'KSN track data is truncated');
            tracks[KWZ_TRACK_NAMES[i]] = bytes.subarray(p, p + size);
            p += size;
        }
    }
    const variant = kic ? 'icon' : ktn || ksn ? 'kwz' : 'kwc';
    const tail = bytes.length - bodyLength;
    let thumbnail = null;
    if (ktn) {
        const data = bytes.subarray(ktn.offset + 12, ktn.offset + 8 + ktn.size);
        thumbnail = data.subarray(0, findJpegEnd(data));
    }
    return {
        format: 'kwz',
        variant,
        meta,
        thumbnail,
        frames,
        tracks,
        signature: tail >= KWZ_SIGNATURE_SIZE
            ? bytes.subarray(bodyLength, bodyLength + KWZ_SIGNATURE_SIZE)
            : null,
        source: bytes,
    };
}
/** Checks the CRC32 stored at the start of KFH, KTN, KMC and KSN bodies. */
export function verifyKwzChecksums(bytes) {
    const result = {};
    for (const section of readKwzSections(bytes).sections) {
        const body = section.offset + 8;
        const end = body + section.size;
        if (section.name === 'KFH' || section.name === 'KTN' || section.name === 'KMC') {
            result[section.name] = readU32(bytes, body) === crc32(bytes, body + 4, end);
        }
        else if (section.name === 'KSN') {
            result.KSN = readU32(bytes, body + 24) === crc32(bytes, body + 28, end);
        }
    }
    return result;
}
