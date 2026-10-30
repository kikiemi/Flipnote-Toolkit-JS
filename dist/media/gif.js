import { LsbBitReader } from '../core/bit-reader.js';
import { LsbBitWriter } from '../core/bit-writer.js';
import { ByteWriter } from '../core/byte-writer.js';
import { check, fail } from '../core/errors.js';
const MAX_CODES = 4096;
/** GIF LZW compression of palette indices, packed into 255-byte sub-blocks. */
function encodeLzw(pixels, minCodeSize) {
    const writer = new LsbBitWriter();
    const clear = 1 << minCodeSize;
    const end = clear + 1;
    const table = new Int16Array(MAX_CODES << minCodeSize);
    let nextCode = end + 1;
    let codeSize = minCodeSize + 1;
    writer.writeBits(clear, codeSize);
    if (pixels.length) {
        let prefix = pixels[0];
        for (let i = 1; i < pixels.length; i++) {
            const pixel = pixels[i];
            const key = (prefix << minCodeSize) | pixel;
            const existing = table[key];
            if (existing > 0) {
                prefix = existing;
                continue;
            }
            writer.writeBits(prefix, codeSize);
            if (nextCode < MAX_CODES) {
                table[key] = nextCode;
                if (nextCode === 1 << codeSize)
                    codeSize++;
                nextCode++;
            }
            else {
                writer.writeBits(clear, codeSize);
                table.fill(0);
                nextCode = end + 1;
                codeSize = minCodeSize + 1;
            }
            prefix = pixel;
        }
        writer.writeBits(prefix, codeSize);
    }
    writer.writeBits(end, codeSize);
    writer.alignToByte();
    const data = writer.toBytes();
    const out = new Uint8Array(data.length + Math.ceil(data.length / 255) + 1);
    let p = 0;
    for (let i = 0; i < data.length; i += 255) {
        const size = Math.min(255, data.length - i);
        out[p++] = size;
        out.set(data.subarray(i, i + size), p);
        p += size;
    }
    out[p++] = 0;
    return out.subarray(0, p);
}
function changedBounds(current, previous, width, height) {
    let x0 = width;
    let x1 = -1;
    let y0 = -1;
    let y1 = -1;
    for (let y = 0; y < height; y++) {
        const row = y * width;
        for (let x = 0; x < width; x++) {
            if (current[row + x] !== previous[row + x]) {
                if (y0 < 0)
                    y0 = y;
                y1 = y;
                if (x < x0)
                    x0 = x;
                if (x > x1)
                    x1 = x;
            }
        }
    }
    return y0 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}
/** Encodes an animated GIF. Later frames store only changed pixels when the palette has room. */
export function encodeGif(width, height, palette, frames, options = {}) {
    const colorCount = palette.length / 4;
    check(colorCount >= 1 && colorCount <= 256, 'INVALID_ARGUMENT', 'GIF palettes need 1-256 colors');
    let transparent = -1;
    for (let i = 0; i < colorCount; i++)
        if (palette[i * 4 + 3] < 128)
            transparent = i;
    const hasRealTransparency = transparent >= 0;
    const keepIndex = !hasRealTransparency && colorCount < 256 ? colorCount : -1;
    const tableBits = Math.max(1, Math.ceil(Math.log2(Math.max(2, colorCount + (keepIndex >= 0 ? 1 : 0)))));
    const minCodeSize = Math.max(2, tableBits);
    const writer = new ByteWriter(1 << 16);
    writer.writeAscii('GIF89a');
    writer.writeU16(width);
    writer.writeU16(height);
    writer.writeU8(0xf0 | (tableBits - 1));
    writer.writeU8(0);
    writer.writeU8(0);
    for (let i = 0; i < 1 << tableBits; i++) {
        if (i < colorCount)
            writer.writeBytes(palette.subarray(i * 4, i * 4 + 3));
        else
            writer.writeZeros(3);
    }
    if (options.loopCount !== null) {
        writer.writeBytes(new Uint8Array([0x21, 0xff, 0x0b]));
        writer.writeAscii('NETSCAPE2.0');
        writer.writeBytes(new Uint8Array([3, 1]));
        writer.writeU16(options.loopCount ?? 0);
        writer.writeU8(0);
    }
    let previous = null;
    let pending = null;
    let elapsed = 0;
    let written = 0;
    const flush = () => {
        if (!pending)
            return;
        elapsed += pending.duration;
        const delay = Math.max(2, Math.round(elapsed * 100) - written);
        written += delay;
        const [x, y, w, h] = pending.rect;
        writer.writeBytes(new Uint8Array([
            0x21,
            0xf9,
            4,
            (hasRealTransparency ? 2 << 2 : 1 << 2) | (pending.transparent >= 0 ? 1 : 0),
        ]));
        writer.writeU16(delay);
        writer.writeU8(Math.max(0, pending.transparent));
        writer.writeU8(0);
        writer.writeU8(0x2c);
        writer.writeU16(x);
        writer.writeU16(y);
        writer.writeU16(w);
        writer.writeU16(h);
        writer.writeU8(0);
        writer.writeU8(minCodeSize);
        writer.writeBytes(encodeLzw(pending.pixels, minCodeSize));
        pending = null;
    };
    const full = [0, 0, width, height];
    for (const frame of frames) {
        check(frame.pixels.length === width * height, 'INVALID_ARGUMENT', 'GIF frame size does not match');
        const changed = previous ? changedBounds(frame.pixels, previous, width, height) : full;
        if (!changed) {
            if (pending)
                pending.duration += frame.duration;
            continue;
        }
        flush();
        const rect = hasRealTransparency ? full : changed;
        const [x, y, w, h] = rect;
        const pixels = new Uint8Array(w * h);
        let marker = hasRealTransparency ? transparent : -1;
        for (let row = 0; row < h; row++) {
            const source = (y + row) * width + x;
            for (let col = 0; col < w; col++) {
                const value = frame.pixels[source + col];
                if (previous && keepIndex >= 0 && previous[source + col] === value) {
                    pixels[row * w + col] = keepIndex;
                    marker = keepIndex;
                }
                else {
                    pixels[row * w + col] = value;
                }
            }
        }
        pending = { rect, pixels, transparent: marker, duration: frame.duration };
        previous = frame.pixels.slice();
    }
    flush();
    check(written > 0, 'INVALID_ARGUMENT', 'GIF needs at least one frame');
    writer.writeU8(0x3b);
    return writer.toBytes();
}
function decodeLzw(data, minCodeSize, pixelCount) {
    const out = new Uint8Array(pixelCount);
    const reader = new LsbBitReader(data);
    const clear = 1 << minCodeSize;
    const end = clear + 1;
    const prefixes = new Int16Array(MAX_CODES);
    const suffixes = new Uint8Array(MAX_CODES);
    const lengths = new Uint16Array(MAX_CODES);
    for (let i = 0; i < clear; i++) {
        suffixes[i] = i;
        lengths[i] = 1;
    }
    let codeSize = minCodeSize + 1;
    let nextCode = end + 1;
    let previous = -1;
    let p = 0;
    while (p < pixelCount) {
        const code = reader.readBits(codeSize);
        if (reader.isOverrun)
            break;
        if (code === clear) {
            codeSize = minCodeSize + 1;
            nextCode = end + 1;
            previous = -1;
            continue;
        }
        if (code === end)
            break;
        let entry = code;
        let first = 0;
        if (code < nextCode && (code < clear || code > end)) {
            first = writeEntry(out, p, code, prefixes, suffixes, lengths);
        }
        else if (code === nextCode && previous >= 0) {
            first = writeEntry(out, p, previous, prefixes, suffixes, lengths);
            if (p + lengths[previous] < pixelCount)
                out[p + lengths[previous]] = first;
            entry = -1;
        }
        else {
            fail('CORRUPT_DATA', 'Invalid GIF LZW code');
        }
        const length = entry >= 0 ? lengths[entry] : lengths[previous] + 1;
        if (previous >= 0 && nextCode < MAX_CODES) {
            prefixes[nextCode] = previous;
            suffixes[nextCode] = first;
            lengths[nextCode] = lengths[previous] + 1;
            nextCode++;
            if (nextCode === 1 << codeSize && codeSize < 12)
                codeSize++;
        }
        previous = code;
        p += length;
    }
    return out;
}
/** Writes the string for `code` at `p`; returns its first symbol. */
function writeEntry(out, p, code, prefixes, suffixes, lengths) {
    let k = p + lengths[code] - 1;
    let current = code;
    while (lengths[current] > 1) {
        if (k < out.length)
            out[k] = suffixes[current];
        k--;
        current = prefixes[current];
    }
    if (k < out.length)
        out[k] = suffixes[current];
    return suffixes[current];
}
function readBlocks(bytes, offset) {
    const parts = [];
    let p = offset;
    while (p < bytes.length && bytes[p] !== 0) {
        const size = bytes[p];
        for (let i = 1; i <= size && p + i < bytes.length; i++)
            parts.push(bytes[p + i]);
        p += size + 1;
    }
    return { data: new Uint8Array(parts), end: p + 1 };
}
function readGifHeader(bytes) {
    check(bytes.length >= 13, 'INVALID_FORMAT', 'Not a GIF file');
    const signature = String.fromCharCode(...bytes.subarray(0, 6));
    check(signature === 'GIF87a' || signature === 'GIF89a', 'INVALID_FORMAT', 'Not a GIF file');
    const width = bytes[6] | (bytes[7] << 8);
    const height = bytes[8] | (bytes[9] << 8);
    const flags = bytes[10];
    let start = 13;
    let globalTable = null;
    if (flags & 0x80) {
        const size = 3 << ((flags & 7) + 1);
        globalTable = bytes.subarray(start, start + size);
        start += size;
    }
    return { width, height, globalTable, start };
}
/** Walks the blocks of a GIF, calling `onImage` for every image (pixels stay compressed). */
function walkGif(bytes, header, onImage) {
    let p = header.start;
    let loopCount = null;
    let delay = 0;
    let transparent = -1;
    let disposal = 0;
    while (p < bytes.length) {
        const block = bytes[p++];
        if (block === 0x3b)
            break;
        if (block === 0x21) {
            const label = bytes[p++];
            if (label === 0xf9 && bytes[p] >= 4) {
                disposal = (bytes[p + 1] >> 2) & 7;
                delay = bytes[p + 2] | (bytes[p + 3] << 8);
                transparent = bytes[p + 1] & 1 ? bytes[p + 4] : -1;
            }
            const { data, end } = readBlocks(bytes, p);
            if (label === 0xff &&
                data.length >= 14 &&
                String.fromCharCode(...data.subarray(0, 11)) === 'NETSCAPE2.0') {
                loopCount = data[12] | (data[13] << 8);
            }
            p = end;
            continue;
        }
        check(block === 0x2c, 'CORRUPT_DATA', 'Unexpected GIF block');
        check(p + 9 <= bytes.length, 'CORRUPT_DATA', 'GIF image descriptor is truncated');
        const imageFlags = bytes[p + 8];
        const x = bytes[p] | (bytes[p + 1] << 8);
        const y = bytes[p + 2] | (bytes[p + 3] << 8);
        const width = bytes[p + 4] | (bytes[p + 5] << 8);
        const height = bytes[p + 6] | (bytes[p + 7] << 8);
        p += 9;
        let table = header.globalTable;
        if (imageFlags & 0x80) {
            const size = 3 << ((imageFlags & 7) + 1);
            table = bytes.subarray(p, p + size);
            p += size;
        }
        const minCodeSize = bytes[p++];
        const { data, end } = readBlocks(bytes, p);
        p = end;
        onImage({
            x,
            y,
            width,
            height,
            isInterlaced: (imageFlags & 0x40) !== 0,
            table,
            minCodeSize,
            data,
            delay,
            transparent,
            disposal,
        });
        transparent = -1;
        disposal = 0;
        delay = 0;
    }
    return loopCount;
}
/** Size, frame count and timing of a GIF without decompressing pixels. */
export function readGifInfo(bytes) {
    const header = readGifHeader(bytes);
    const durations = [];
    const loopCount = walkGif(bytes, header, (block) => durations.push(block.delay / 100));
    return { width: header.width, height: header.height, durations, loopCount };
}
/**
 * Yields every GIF frame composited onto the full canvas, honoring disposal and transparency.
 * The yielded image is reused; copy it to keep it past the next iteration.
 */
export function* decodeGifFrames(bytes) {
    const header = readGifHeader(bytes);
    const { width, height } = header;
    const blocks = [];
    walkGif(bytes, header, (block) => blocks.push(block));
    const canvas = { width, height, data: new Uint8Array(width * height * 4) };
    const pixels = canvas.data;
    for (const block of blocks) {
        const { x, y, table, transparent } = block;
        check(table, 'CORRUPT_DATA', 'GIF frame has no color table');
        check(block.minCodeSize >= 1 && block.minCodeSize <= 11, 'CORRUPT_DATA', 'Invalid GIF code size');
        const indices = decodeLzw(block.data, block.minCodeSize, block.width * block.height);
        const saved = block.disposal === 3 ? pixels.slice() : null;
        const rows = block.isInterlaced ? interlacedRows(block.height) : null;
        for (let row = 0; row < block.height; row++) {
            const targetY = y + (rows ? rows[row] : row);
            if (targetY >= height)
                continue;
            for (let col = 0; col < block.width && x + col < width; col++) {
                const index = indices[row * block.width + col];
                if (index === transparent)
                    continue;
                const o = (targetY * width + x + col) * 4;
                pixels[o] = table[index * 3];
                pixels[o + 1] = table[index * 3 + 1];
                pixels[o + 2] = table[index * 3 + 2];
                pixels[o + 3] = 255;
            }
        }
        yield canvas;
        if (block.disposal === 2) {
            const right = Math.min(width, x + block.width);
            for (let row = y; row < Math.min(height, y + block.height); row++) {
                pixels.fill(0, (row * width + x) * 4, (row * width + right) * 4);
            }
        }
        else if (saved) {
            pixels.set(saved);
        }
    }
}
/** Decodes every frame of a GIF to full-canvas RGBA. */
export function decodeGif(bytes) {
    const info = readGifInfo(bytes);
    const frames = [];
    for (const frame of decodeGifFrames(bytes))
        frames.push({ ...frame, data: frame.data.slice() });
    return { ...info, frames };
}
function interlacedRows(height) {
    const rows = [];
    for (const [start, step] of [
        [0, 8],
        [4, 8],
        [2, 4],
        [1, 2],
    ]) {
        for (let y = start; y < height; y += step)
            rows.push(y);
    }
    return rows;
}
