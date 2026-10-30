import { isEqualBytes } from '../core/bytes.js';
import { crc32 } from '../core/crc32.js';
import { check } from '../core/errors.js';
import { PPM_HEIGHT, PPM_LAYER_SIZE, PPM_PAPER_BLACK, PPM_PAPER_WHITE, PPM_PEN_INVERSE, PPM_WIDTH, } from './ppm-types.js';
const LINE_BYTES = PPM_WIDTH / 8;
const LINE_WORDS = PPM_WIDTH / 4;
const TYPE_BYTES = PPM_HEIGHT / 4;
const PACKED_SIZE = LINE_BYTES * PPM_HEIGHT;
const MAX_FRAME_SIZE = 3 + TYPE_BYTES * 2 + (4 + LINE_BYTES) * PPM_HEIGHT * 2;
const ONES = 0x01010101;
/** Pixel bytes for every bit pattern, as two 32-bit words per byte (layout-agnostic). */
const BYTE_PIXELS = createBytePixels();
function createBytePixels() {
    const bytes = new Uint8Array(256 * 8);
    for (let value = 0; value < 256; value++) {
        for (let bit = 0; bit < 8; bit++)
            bytes[value * 8 + bit] = (value >> bit) & 1;
    }
    return new Uint32Array(bytes.buffer);
}
function popCount(value) {
    value -= (value >>> 1) & 0x55555555;
    value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
    return (((value + (value >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}
export function isPpmKeyFrame(data) {
    return (data[0] & 0x80) !== 0;
}
/** Returns the byte length of the encoded frame starting at `offset`. */
function measurePpmFrame(data, offset = 0, end = data.length) {
    let p = offset + 1;
    if (data[offset] & 0x40)
        p += 2;
    const types = p;
    p += TYPE_BYTES * 2;
    check(p <= end, 'CORRUPT_DATA', 'PPM frame header is truncated');
    for (let layer = 0; layer < 2; layer++) {
        for (let y = 0; y < PPM_HEIGHT; y++) {
            const type = (data[types + layer * TYPE_BYTES + (y >> 2)] >> ((y & 3) << 1)) & 3;
            if (type === 3)
                p += LINE_BYTES;
            else if (type) {
                check(p + 4 <= end, 'CORRUPT_DATA', 'PPM line is truncated');
                p +=
                    4 +
                        popCount(((data[p] << 24) | (data[p + 1] << 16) | (data[p + 2] << 8) | data[p + 3]) >>> 0);
            }
        }
    }
    check(p <= end, 'CORRUPT_DATA', 'PPM frame data is truncated');
    return p - offset;
}
function decodeLayer(data, typesOffset, offset, layer) {
    let p = offset;
    for (let y = 0; y < PPM_HEIGHT; y++) {
        const type = (data[typesOffset + (y >> 2)] >> ((y & 3) << 1)) & 3;
        if (type === 0)
            continue;
        const row = y * LINE_WORDS;
        if (type === 3) {
            check(p + LINE_BYTES <= data.length, 'CORRUPT_DATA', 'PPM line is truncated');
            for (let w = row; w < row + LINE_WORDS; w += 2) {
                const value = data[p++] << 1;
                layer[w] = BYTE_PIXELS[value];
                layer[w + 1] = BYTE_PIXELS[value + 1];
            }
            continue;
        }
        check(p + 4 <= data.length, 'CORRUPT_DATA', 'PPM line is truncated');
        let flags = (data[p] << 24) | (data[p + 1] << 16) | (data[p + 2] << 8) | data[p + 3];
        p += 4;
        check(p + popCount(flags >>> 0) <= data.length, 'CORRUPT_DATA', 'PPM line is truncated');
        if (type === 2)
            layer.fill(ONES, row, row + LINE_WORDS);
        for (let w = row; flags; w += 2, flags <<= 1) {
            if (flags < 0) {
                const value = data[p++] << 1;
                layer[w] = BYTE_PIXELS[value];
                layer[w + 1] = BYTE_PIXELS[value + 1];
            }
        }
    }
    return p;
}
/** XORs `previous`, shifted by (dx, dy), into `target`. */
function applyDiff(target, previous, dx, dy) {
    if (dx === 0 && dy === 0) {
        const t = new Uint32Array(target.buffer, target.byteOffset, PPM_LAYER_SIZE / 4);
        const s = new Uint32Array(previous.buffer, previous.byteOffset, PPM_LAYER_SIZE / 4);
        for (let i = 0; i < t.length; i++)
            t[i] ^= s[i];
        return;
    }
    const x0 = Math.max(0, dx);
    const x1 = Math.min(PPM_WIDTH, PPM_WIDTH + dx);
    for (let y = Math.max(0, dy); y < Math.min(PPM_HEIGHT, PPM_HEIGHT + dy); y++) {
        const row = y * PPM_WIDTH;
        const source = (y - dy) * PPM_WIDTH - dx;
        for (let x = x0; x < x1; x++)
            target[row + x] ^= previous[source + x];
    }
}
function createLayers() {
    return [new Uint8Array(PPM_LAYER_SIZE), new Uint8Array(PPM_LAYER_SIZE)];
}
function isPpmKeyFrameAt(animation, index) {
    return (animation.data[animation.offsets[index]] & 0x80) !== 0;
}
/** Encoded bytes of one frame (a view into the animation data). */
export function getPpmFrameData(animation, index) {
    const { data, offsets } = animation;
    const start = offsets[index];
    return data.subarray(start, start + measurePpmFrame(data, start));
}
/**
 * Decodes the frame at `offset` into `target`; diff frames are applied on top of `previous`
 * (which must be a different buffer pair). Throws on damaged data.
 */
export function decodePpmFrame(data, offset, previous, target) {
    check(offset + 1 + TYPE_BYTES * 2 <= data.length, 'CORRUPT_DATA', 'PPM frame is truncated');
    const header = data[offset];
    const isKey = (header & 0x80) !== 0;
    let p = offset + 1;
    let dx = 0;
    let dy = 0;
    if (header & 0x40) {
        dx = (data[p] << 24) >> 24;
        dy = (data[p + 1] << 24) >> 24;
        p += 2;
    }
    check(p + TYPE_BYTES * 2 <= data.length, 'CORRUPT_DATA', 'PPM frame header is truncated');
    target[0].fill(0);
    target[1].fill(0);
    const types = p;
    p += TYPE_BYTES * 2;
    for (let layer = 0; layer < 2; layer++) {
        const words = new Uint32Array(target[layer].buffer, target[layer].byteOffset, PPM_LAYER_SIZE / 4);
        p = decodeLayer(data, types + layer * TYPE_BYTES, p, words);
    }
    if (isKey)
        return;
    applyDiff(target[0], previous[0], dx, dy);
    applyDiff(target[1], previous[1], dx, dy);
}
/**
 * Decodes PPM frames with diff-chain caching, so sequential access costs one frame each.
 * Returned layers are reused by the next `decode` call; copy them to keep.
 */
export class PpmFrameDecoder {
    animation;
    layers = createLayers();
    scratch = createLayers();
    decodedIndex = -1;
    constructor(file) {
        this.animation = 'animation' in file ? file.animation : file;
    }
    get frameCount() {
        return this.animation.offsets.length;
    }
    decode(index) {
        const { data, offsets, soundFlags } = this.animation;
        check(Number.isInteger(index) && index >= 0 && index < offsets.length, 'INVALID_ARGUMENT', `Frame ${index} does not exist`);
        if (index !== this.decodedIndex) {
            let start = index;
            while (start > 0 &&
                start - 1 !== this.decodedIndex &&
                !isPpmKeyFrameAt(this.animation, start)) {
                start--;
            }
            const isContinuation = start > 0 && start - 1 === this.decodedIndex;
            if (!isContinuation && !isPpmKeyFrameAt(this.animation, start)) {
                this.layers[0].fill(0);
                this.layers[1].fill(0);
            }
            this.decodedIndex = -1;
            for (let i = start; i <= index; i++)
                this.decodeNext(data, offsets[i]);
            this.decodedIndex = index;
        }
        const header = data[offsets[index]];
        const pens = [(header >> 1) & 3, (header >> 3) & 3];
        for (let i = index - 1; i >= 0 && (!pens[0] || !pens[1]); i--) {
            const previous = data[offsets[i]];
            if (!pens[0])
                pens[0] = (previous >> 1) & 3;
            if (!pens[1])
                pens[1] = (previous >> 3) & 3;
        }
        return {
            paper: header & 1,
            pens: [pens[0] || PPM_PEN_INVERSE, pens[1] || PPM_PEN_INVERSE],
            layers: this.layers,
            soundFlags: soundFlags[index],
        };
    }
    decodeNext(data, offset) {
        decodePpmFrame(data, offset, this.layers, this.scratch);
        [this.layers, this.scratch] = [this.scratch, this.layers];
    }
}
function packLayer(layer, target) {
    check(layer.length === PPM_LAYER_SIZE, 'INVALID_ARGUMENT', `PPM layers must have ${PPM_LAYER_SIZE} pixels`);
    for (let i = 0, p = 0; i < PACKED_SIZE; i++, p += 8) {
        target[i] =
            (layer[p] ? 1 : 0) |
                (layer[p + 1] ? 2 : 0) |
                (layer[p + 2] ? 4 : 0) |
                (layer[p + 3] ? 8 : 0) |
                (layer[p + 4] ? 16 : 0) |
                (layer[p + 5] ? 32 : 0) |
                (layer[p + 6] ? 64 : 0) |
                (layer[p + 7] ? 128 : 0);
    }
}
/** Writes the line types at `typesOffset` and line data from `offset`; returns the end offset. */
function encodeLayer(packed, out, typesOffset, offset) {
    let p = offset;
    for (let y = 0; y < PPM_HEIGHT; y++) {
        const row = y * LINE_BYTES;
        let used = 0;
        let unfilled = 0;
        for (let i = row; i < row + LINE_BYTES; i++) {
            if (packed[i] !== 0)
                used++;
            if (packed[i] !== 0xff)
                unfilled++;
        }
        if (used === 0)
            continue;
        let type = 3;
        if (used + 4 < LINE_BYTES && used <= unfilled)
            type = 1;
        else if (unfilled + 4 < LINE_BYTES)
            type = 2;
        out[typesOffset + (y >> 2)] |= type << ((y & 3) << 1);
        if (type === 3) {
            out.set(packed.subarray(row, row + LINE_BYTES), p);
            p += LINE_BYTES;
            continue;
        }
        const skip = type === 1 ? 0 : 0xff;
        let flags = 0;
        const flagsOffset = p;
        p += 4;
        for (let i = 0; i < LINE_BYTES; i++) {
            const value = packed[row + i];
            if (value !== skip) {
                flags |= 0x80000000 >>> i;
                out[p++] = value;
            }
        }
        out[flagsOffset] = flags >>> 24;
        out[flagsOffset + 1] = (flags >>> 16) & 0xff;
        out[flagsOffset + 2] = (flags >>> 8) & 0xff;
        out[flagsOffset + 3] = flags & 0xff;
    }
    return p;
}
function encodeFrame(frame, packed, isKey, out) {
    check(frame.paper === 0 || frame.paper === 1, 'INVALID_ARGUMENT', 'PPM paper must be 0 (black) or 1 (white)');
    for (const pen of frame.pens) {
        check(pen >= 0 && pen <= 3, 'INVALID_ARGUMENT', 'PPM pens must be 0-3');
    }
    out.fill(0, 0, 1 + TYPE_BYTES * 2);
    out[0] =
        (isKey ? 0x80 : 0) |
            ((frame.pens[1] || PPM_PEN_INVERSE) << 3) |
            ((frame.pens[0] || PPM_PEN_INVERSE) << 1) |
            frame.paper;
    const p = encodeLayer(packed[0], out, 1, 1 + TYPE_BYTES * 2);
    return encodeLayer(packed[1], out, 1 + TYPE_BYTES, p);
}
/** Encodes frames in playback order, choosing key or diff frames by size. */
export class PpmFrameEncoder {
    previous = null;
    current = [new Uint8Array(PACKED_SIZE), new Uint8Array(PACKED_SIZE)];
    delta = [new Uint8Array(PACKED_SIZE), new Uint8Array(PACKED_SIZE)];
    keyBuffer = new Uint8Array(MAX_FRAME_SIZE);
    diffBuffer = new Uint8Array(MAX_FRAME_SIZE);
    keyFrameInterval;
    sinceKeyFrame = 0;
    /** `keyFrameInterval` forces a key frame every N frames (0 = only when smaller). */
    constructor(keyFrameInterval = 0) {
        this.keyFrameInterval = keyFrameInterval;
    }
    encode(frame) {
        packLayer(frame.layers[0], this.current[0]);
        packLayer(frame.layers[1], this.current[1]);
        const keySize = encodeFrame(frame, this.current, true, this.keyBuffer);
        let result = this.keyBuffer.slice(0, keySize);
        const isKeyDue = this.keyFrameInterval > 0 && this.sinceKeyFrame + 1 >= this.keyFrameInterval;
        if (this.previous && !isKeyDue) {
            for (let layer = 0; layer < 2; layer++) {
                const a = this.current[layer];
                const b = this.previous[layer];
                const d = this.delta[layer];
                for (let i = 0; i < PACKED_SIZE; i++)
                    d[i] = a[i] ^ b[i];
            }
            const diffSize = encodeFrame(frame, this.delta, false, this.diffBuffer);
            if (diffSize < keySize)
                result = this.diffBuffer.slice(0, diffSize);
        }
        this.sinceKeyFrame = isPpmKeyFrame(result) ? 0 : this.sinceKeyFrame + 1;
        const previous = this.previous ?? [new Uint8Array(PACKED_SIZE), new Uint8Array(PACKED_SIZE)];
        this.previous = this.current;
        this.current = previous;
        return result;
    }
}
const keyScratch = [new Uint8Array(PACKED_SIZE), new Uint8Array(PACKED_SIZE)];
const keyOutput = new Uint8Array(MAX_FRAME_SIZE);
/** Encodes one frame as an independent key frame. */
export function encodePpmKeyFrame(frame) {
    packLayer(frame.layers[0], keyScratch[0]);
    packLayer(frame.layers[1], keyScratch[1]);
    return keyOutput.slice(0, encodeFrame(frame, keyScratch, true, keyOutput));
}
/** Packs encoded frames into the stored form; identical frames share one copy of their data. */
export function packPpmAnimation(frames, soundFlags) {
    const offsets = new Uint32Array(frames.length);
    const unique = [];
    const known = new Map();
    let size = 0;
    frames.forEach((data, i) => {
        const hash = crc32(data) ^ data.length;
        const candidates = known.get(hash) ?? [];
        const match = candidates.find((index) => isEqualBytes(frames[index], data));
        if (match !== undefined) {
            offsets[i] = offsets[match];
            return;
        }
        candidates.push(i);
        known.set(hash, candidates);
        offsets[i] = size;
        unique.push(data);
        size += data.length;
    });
    const data = new Uint8Array((size + 3) & ~3);
    let p = 0;
    for (const chunk of unique) {
        data.set(chunk, p);
        p += chunk.length;
    }
    return { data, offsets, soundFlags: Uint8Array.from(soundFlags) };
}
export function copyPpmFrameInfo(frame) {
    return { paper: frame.paper, pens: [frame.pens[0], frame.pens[1]], soundFlags: frame.soundFlags };
}
/** Blank frame; white paper and inverse pens unless given. */
export function createPpmFrame(info = {}) {
    const paper = info.paper ?? PPM_PAPER_WHITE;
    check(paper === PPM_PAPER_BLACK || paper === PPM_PAPER_WHITE, 'INVALID_ARGUMENT', 'PPM paper must be 0 or 1');
    return {
        paper,
        pens: info.pens ? [info.pens[0], info.pens[1]] : [PPM_PEN_INVERSE, PPM_PEN_INVERSE],
        soundFlags: info.soundFlags ?? 0,
        layers: createLayers(),
    };
}
export function clonePpmFrame(frame) {
    return {
        ...copyPpmFrameInfo(frame),
        layers: [frame.layers[0].slice(), frame.layers[1].slice()],
    };
}
