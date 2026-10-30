import { align4, readU16, readU32 } from '../core/bytes.js';
import { check } from '../core/errors.js';
import { bytesToHex, readUtf16 } from '../core/text.js';
import { readPpmFilename, readPpmFsid } from './ppm-filename.js';
import { PPM_ANIMATION_OFFSET, PPM_FRAME_TABLE_OFFSET, PPM_SIGNATURE_AREA_SIZE, PPM_SIGNATURE_SIZE, PPM_SOUND_HEADER_SIZE, PPM_THUMBNAIL_SIZE, PPM_TRACK_NAMES, } from './ppm-types.js';
export function isPpm(bytes) {
    return (bytes.length >= 4 &&
        bytes[0] === 0x50 &&
        bytes[1] === 0x41 &&
        bytes[2] === 0x52 &&
        bytes[3] === 0x41);
}
export function computePpmLayout(frameCount, dataSize, trackSizes) {
    const dataStart = PPM_FRAME_TABLE_OFFSET + frameCount * 4;
    const dataEnd = dataStart + dataSize;
    const soundHeaderOffset = align4(dataEnd + frameCount);
    let soundEnd = soundHeaderOffset + PPM_SOUND_HEADER_SIZE;
    for (const size of trackSizes)
        soundEnd += size;
    return {
        frameCount,
        animationSize: dataEnd - PPM_ANIMATION_OFFSET,
        dataStart,
        dataEnd,
        soundHeaderOffset,
        trackSizes: [...trackSizes],
        soundEnd,
        fileSize: soundEnd + PPM_SIGNATURE_AREA_SIZE,
    };
}
/** Reads the layout from the size fields, or returns null when they are inconsistent. */
export function readPpmLayout(bytes) {
    if (!isPpm(bytes) || bytes.length < PPM_FRAME_TABLE_OFFSET)
        return null;
    const animationSize = readU32(bytes, 4);
    const frameCount = readU16(bytes, 0xc) + 1;
    const tableSize = readU16(bytes, PPM_ANIMATION_OFFSET);
    const dataEnd = PPM_ANIMATION_OFFSET + animationSize;
    const dataStart = PPM_FRAME_TABLE_OFFSET + tableSize;
    if (tableSize !== frameCount * 4 || dataEnd < dataStart || dataEnd > bytes.length)
        return null;
    const soundHeaderOffset = align4(dataEnd + frameCount);
    if (soundHeaderOffset + PPM_SOUND_HEADER_SIZE > bytes.length)
        return null;
    const trackSizes = [0, 1, 2, 3].map((i) => readU32(bytes, soundHeaderOffset + i * 4));
    const layout = computePpmLayout(frameCount, dataEnd - dataStart, trackSizes);
    return layout.soundEnd <= bytes.length ? layout : null;
}
export function readPpmMeta(bytes, layout) {
    const flags = readU16(bytes, 0x6a6);
    const speeds = layout.soundHeaderOffset + 16;
    return {
        formatVersion: readU16(bytes, 0xe),
        isLocked: readU16(bytes, 0x10) !== 0,
        thumbnailIndex: readU16(bytes, 0x12),
        rootAuthorName: readUtf16(bytes, 0x14, 11),
        parentAuthorName: readUtf16(bytes, 0x2a, 11),
        currentAuthorName: readUtf16(bytes, 0x40, 11),
        parentAuthorId: readPpmFsid(bytes, 0x56),
        currentAuthorId: readPpmFsid(bytes, 0x5e),
        parentFilename: readPpmFilename(bytes, 0x66),
        currentFilename: readPpmFilename(bytes, 0x78),
        rootAuthorId: readPpmFsid(bytes, 0x8a),
        rootFilenameFragment: bytesToHex(bytes.subarray(0x92, 0x9a)).toUpperCase(),
        timestamp: readU32(bytes, 0x9a),
        frameSpeed: 8 - bytes[speeds],
        bgmSpeed: 8 - bytes[speeds + 1],
        isLooping: (flags & 0x2) !== 0,
        isLayerVisible: [(flags & 0x10) === 0, (flags & 0x20) === 0],
        extraFlags: flags & ~0x32,
    };
}
/**
 * Parses a PPM file without copying: frames, thumbnail and audio stay encoded and
 * reference `bytes`, which must not be modified while the result is in use.
 */
export function readPpm(bytes) {
    check(isPpm(bytes), 'INVALID_FORMAT', 'Not a PPM file (missing PARA magic)');
    check(bytes.length >= PPM_FRAME_TABLE_OFFSET, 'CORRUPT_DATA', 'PPM file is truncated');
    const layout = readPpmLayout(bytes);
    check(layout, 'CORRUPT_DATA', 'PPM size fields are inconsistent or the file is truncated');
    const { frameCount, dataStart, dataEnd } = layout;
    const offsets = new Uint32Array(frameCount);
    for (let i = 0; i < frameCount; i++) {
        offsets[i] = readU32(bytes, PPM_FRAME_TABLE_OFFSET + i * 4);
        check(offsets[i] < dataEnd - dataStart, 'CORRUPT_DATA', `Frame ${i} offset is out of bounds`);
    }
    const tracks = {};
    let p = layout.soundHeaderOffset + 32;
    PPM_TRACK_NAMES.forEach((name, i) => {
        tracks[name] = bytes.subarray(p, p + layout.trackSizes[i]);
        p += layout.trackSizes[i];
    });
    const signature = bytes.length >= p + PPM_SIGNATURE_SIZE
        ? bytes.subarray(p, p + PPM_SIGNATURE_SIZE)
        : new Uint8Array(PPM_SIGNATURE_SIZE);
    return {
        format: 'ppm',
        meta: readPpmMeta(bytes, layout),
        thumbnail: bytes.subarray(0xa0, 0xa0 + PPM_THUMBNAIL_SIZE),
        animation: {
            data: bytes.subarray(dataStart, dataEnd),
            offsets,
            soundFlags: bytes.subarray(dataEnd, dataEnd + frameCount),
        },
        tracks,
        signature,
        source: bytes,
    };
}
