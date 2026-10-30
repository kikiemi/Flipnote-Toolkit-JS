import { concatBytes } from '../core/bytes.js';
import { check } from '../core/errors.js';
const TYPE_LONG = 4;
const TYPE_UNDEFINED = 7;
const TYPE_RATIONAL = 5;
const TYPE_SRATIONAL = 10;
/** MP type: multi-frame image, disparity (stereo) image. */
const MP_TYPE_DISPARITY = 0x020002;
const MP_REPRESENTATIVE = 0x20000000;
class BigEndianBuffer {
    bytes = [];
    u16(value) {
        this.bytes.push((value >>> 8) & 0xff, value & 0xff);
    }
    u32(value) {
        this.bytes.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
    }
    raw(values) {
        for (let i = 0; i < values.length; i++)
            this.bytes.push(values[i]);
    }
}
/** Writes an IFD at `start` (relative to the MP header); returns its bytes including out-of-line data. */
function writeIfd(entries, start, next) {
    const buffer = new BigEndianBuffer();
    const extra = new BigEndianBuffer();
    let extraOffset = start + 2 + entries.length * 12 + 4;
    buffer.u16(entries.length);
    for (const entry of entries) {
        buffer.u16(entry.tag);
        buffer.u16(entry.type);
        buffer.u32(entry.count);
        if (typeof entry.value === 'number') {
            buffer.u32(entry.value);
        }
        else if (entry.value.length <= 4) {
            const padded = new Uint8Array(4);
            padded.set(entry.value);
            buffer.raw(padded);
        }
        else {
            buffer.u32(extraOffset);
            extra.raw(entry.value);
            extraOffset += entry.value.length;
        }
    }
    buffer.u32(next);
    return [...buffer.bytes, ...extra.bytes];
}
function rational(numerator, denominator) {
    const buffer = new BigEndianBuffer();
    buffer.u32(numerator >>> 0);
    buffer.u32(denominator >>> 0);
    return Uint8Array.from(buffer.bytes);
}
const VERSION = Uint8Array.from([0x30, 0x31, 0x30, 0x30]);
function attributeEntries(index) {
    return [
        { tag: 0xb000, type: TYPE_UNDEFINED, count: 4, value: VERSION },
        { tag: 0xb101, type: TYPE_LONG, count: 1, value: index },
        { tag: 0xb204, type: TYPE_LONG, count: 1, value: 1 },
        { tag: 0xb205, type: TYPE_SRATIONAL, count: 1, value: rational(0, 1) },
        { tag: 0xb206, type: TYPE_RATIONAL, count: 1, value: rational(35, 1000) },
    ];
}
/** APP2 "MPF" segment around an MP header followed by the given IFD bytes. */
function mpfSegment(ifds) {
    const body = [0x4d, 0x50, 0x46, 0x00, 0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, ...ifds];
    const length = body.length + 2;
    return Uint8Array.from([0xff, 0xe2, length >> 8, length & 0xff, ...body]);
}
/** Position after SOI and any APP0/APP1 segments, where the MPF segment goes. */
function insertionPoint(jpeg) {
    check(jpeg[0] === 0xff && jpeg[1] === 0xd8, 'INVALID_ARGUMENT', 'Expected a JPEG image');
    let p = 2;
    while (jpeg[p] === 0xff && (jpeg[p + 1] === 0xe0 || jpeg[p + 1] === 0xe1)) {
        p += 2 + ((jpeg[p + 2] << 8) | jpeg[p + 3]);
    }
    return p;
}
function buildFirstSegment(firstSize, secondSize, secondOffset) {
    const indexCount = 3;
    const indexIfdSize = 2 + indexCount * 12 + 4;
    const entriesOffset = 8 + indexIfdSize;
    const attributeOffset = entriesOffset + 32;
    const entryData = new BigEndianBuffer();
    entryData.u32(MP_REPRESENTATIVE | MP_TYPE_DISPARITY);
    entryData.u32(firstSize);
    entryData.u32(0);
    entryData.u32(0);
    entryData.u32(MP_TYPE_DISPARITY);
    entryData.u32(secondSize);
    entryData.u32(secondOffset);
    entryData.u32(0);
    const index = writeIfd([
        { tag: 0xb000, type: TYPE_UNDEFINED, count: 4, value: VERSION },
        { tag: 0xb001, type: TYPE_LONG, count: 1, value: 2 },
        { tag: 0xb002, type: TYPE_UNDEFINED, count: 32, value: Uint8Array.from(entryData.bytes) },
    ], 8, attributeOffset);
    const attributes = writeIfd(attributeEntries(1), attributeOffset, 0);
    return mpfSegment([...index, ...attributes]);
}
/**
 * Joins left and right JPEGs into an MPO (CIPA DC-007 multi-picture object),
 * the stereo photo format of the Nintendo 3DS camera and most 3D viewers.
 */
export function encodeMpo(left, right) {
    const leftAt = insertionPoint(left);
    const rightAt = insertionPoint(right);
    const second = concatBytes([
        right.subarray(0, rightAt),
        mpfSegment(writeIfd(attributeEntries(2), 8, 0)),
        right.subarray(rightAt),
    ]);
    const placeholder = buildFirstSegment(0, 0, 0);
    const firstSize = left.length + placeholder.length;
    const headerPosition = leftAt + 8;
    const segment = buildFirstSegment(firstSize, second.length, firstSize - headerPosition);
    return concatBytes([left.subarray(0, leftAt), segment, left.subarray(leftAt), second]);
}
