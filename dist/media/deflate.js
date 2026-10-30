import { LsbBitWriter } from '../core/bit-writer.js';
import { buildCanonicalCodes, buildCodeLengths, reverseBits } from './huffman.js';
export const LENGTH_BASE = [
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
    163, 195, 227, 258,
];
export const LENGTH_EXTRA = [
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
export const DISTANCE_BASE = [
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
    3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
export const DISTANCE_EXTRA = [
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];
export const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
const WINDOW_SIZE = 32768;
const HASH_BITS = 15;
const MAX_MATCH = 258;
const BLOCK_TOKENS = 1 << 16;
const LENGTH_CODE = new Uint8Array(MAX_MATCH + 1);
const DISTANCE_CODE = new Uint8Array(512);
for (let code = 0; code < 29; code++) {
    for (let length = LENGTH_BASE[code]; length < LENGTH_BASE[code] + (1 << LENGTH_EXTRA[code]) && length <= MAX_MATCH; length++) {
        LENGTH_CODE[length] = code;
    }
}
LENGTH_CODE[MAX_MATCH] = 28;
for (let code = 0; code < 30; code++) {
    for (let distance = DISTANCE_BASE[code]; distance < DISTANCE_BASE[code] + (1 << DISTANCE_EXTRA[code]); distance++) {
        if (distance <= 256)
            DISTANCE_CODE[distance - 1] = code;
        else
            DISTANCE_CODE[256 + ((distance - 1) >> 7)] = code;
    }
}
function distanceCode(distance) {
    return distance <= 256 ? DISTANCE_CODE[distance - 1] : DISTANCE_CODE[256 + ((distance - 1) >> 7)];
}
const FIXED_LITERAL_LENGTHS = new Uint8Array(288)
    .fill(8, 0, 144)
    .fill(9, 144, 256)
    .fill(7, 256, 280)
    .fill(8, 280, 288);
const FIXED_DISTANCE_LENGTHS = new Uint8Array(30).fill(5);
function createTable(lengths) {
    const codes = buildCanonicalCodes(lengths);
    for (let i = 0; i < codes.length; i++)
        codes[i] = reverseBits(codes[i], lengths[i]);
    return { lengths, codes };
}
const FIXED_LITERALS = createTable(FIXED_LITERAL_LENGTHS);
const FIXED_DISTANCES = createTable(FIXED_DISTANCE_LENGTHS);
class Tokens {
    lengths = new Uint16Array(BLOCK_TOKENS);
    distances = new Uint16Array(BLOCK_TOKENS);
    count = 0;
}
function dataBits(tokens, literals, distances) {
    let bits = literals.lengths[256];
    for (let i = 0; i < tokens.count; i++) {
        const length = tokens.lengths[i];
        const distance = tokens.distances[i];
        if (distance === 0) {
            bits += literals.lengths[length];
        }
        else {
            const lc = LENGTH_CODE[length];
            const dc = distanceCode(distance);
            bits +=
                literals.lengths[257 + lc] + LENGTH_EXTRA[lc] + distances.lengths[dc] + DISTANCE_EXTRA[dc];
        }
    }
    return bits;
}
function writeData(writer, tokens, literals, distances) {
    for (let i = 0; i < tokens.count; i++) {
        const length = tokens.lengths[i];
        const distance = tokens.distances[i];
        if (distance === 0) {
            writer.writeBits(literals.codes[length], literals.lengths[length]);
            continue;
        }
        const lc = LENGTH_CODE[length];
        writer.writeBits(literals.codes[257 + lc], literals.lengths[257 + lc]);
        if (LENGTH_EXTRA[lc])
            writer.writeBits(length - LENGTH_BASE[lc], LENGTH_EXTRA[lc]);
        const dc = distanceCode(distance);
        writer.writeBits(distances.codes[dc], distances.lengths[dc]);
        if (DISTANCE_EXTRA[dc])
            writer.writeBits(distance - DISTANCE_BASE[dc], DISTANCE_EXTRA[dc]);
    }
    writer.writeBits(literals.codes[256], literals.lengths[256]);
}
/** Run-length codes for the concatenated code length sequence (symbols 0-18). */
function encodeCodeLengths(lengths) {
    const symbols = [];
    const extras = [];
    for (let i = 0; i < lengths.length;) {
        const value = lengths[i];
        let run = 1;
        while (i + run < lengths.length && lengths[i + run] === value)
            run++;
        if (value === 0 && run >= 3) {
            const count = Math.min(run, 138);
            symbols.push(count >= 11 ? 18 : 17);
            extras.push(count >= 11 ? count - 11 : count - 3);
            i += count;
        }
        else if (value !== 0 && run >= 4) {
            symbols.push(value);
            extras.push(0);
            const count = Math.min(run - 1, 6);
            symbols.push(16);
            extras.push(count - 3);
            i += count + 1;
        }
        else {
            symbols.push(value);
            extras.push(0);
            i++;
        }
    }
    return { symbols, extras };
}
function writeBlock(writer, tokens, input, start, end, isFinal) {
    const literalFrequencies = new Uint32Array(286);
    const distanceFrequencies = new Uint32Array(30);
    literalFrequencies[256] = 1;
    for (let i = 0; i < tokens.count; i++) {
        if (tokens.distances[i] === 0) {
            literalFrequencies[tokens.lengths[i]]++;
        }
        else {
            literalFrequencies[257 + LENGTH_CODE[tokens.lengths[i]]]++;
            distanceFrequencies[distanceCode(tokens.distances[i])]++;
        }
    }
    const literalLengths = buildCodeLengths(literalFrequencies, 15);
    const distanceLengths = buildCodeLengths(distanceFrequencies, 15);
    if (!distanceLengths.some((length) => length > 0))
        distanceLengths[0] = 1;
    let literalCount = 286;
    while (literalCount > 257 && literalLengths[literalCount - 1] === 0)
        literalCount--;
    let distanceCount = 30;
    while (distanceCount > 1 && distanceLengths[distanceCount - 1] === 0)
        distanceCount--;
    const sequence = new Uint8Array(literalCount + distanceCount);
    sequence.set(literalLengths.subarray(0, literalCount));
    sequence.set(distanceLengths.subarray(0, distanceCount), literalCount);
    const { symbols, extras } = encodeCodeLengths(sequence);
    const codeLengthFrequencies = new Uint32Array(19);
    for (const symbol of symbols)
        codeLengthFrequencies[symbol]++;
    const codeLengthTable = createTable(buildCodeLengths(codeLengthFrequencies, 7));
    let codeLengthCount = 19;
    while (codeLengthCount > 4 &&
        codeLengthTable.lengths[CODE_LENGTH_ORDER[codeLengthCount - 1]] === 0) {
        codeLengthCount--;
    }
    const literals = createTable(literalLengths);
    const distances = createTable(distanceLengths);
    let headerBits = 14 + codeLengthCount * 3;
    for (let i = 0; i < symbols.length; i++) {
        const symbol = symbols[i];
        headerBits +=
            codeLengthTable.lengths[symbol] +
                (symbol === 16 ? 2 : symbol === 17 ? 3 : symbol === 18 ? 7 : 0);
    }
    const dynamicBits = 3 + headerBits + dataBits(tokens, literals, distances);
    const fixedBits = 3 + dataBits(tokens, FIXED_LITERALS, FIXED_DISTANCES);
    const storedBits = (end - start) * 8 + Math.ceil((end - start) / 65535 || 1) * 40 + 8;
    if (storedBits <= dynamicBits && storedBits <= fixedBits) {
        writeStored(writer, input, start, end, isFinal);
    }
    else if (fixedBits <= dynamicBits) {
        writer.writeBits(isFinal ? 3 : 2, 3);
        writeData(writer, tokens, FIXED_LITERALS, FIXED_DISTANCES);
    }
    else {
        writer.writeBits(isFinal ? 5 : 4, 3);
        writer.writeBits(literalCount - 257, 5);
        writer.writeBits(distanceCount - 1, 5);
        writer.writeBits(codeLengthCount - 4, 4);
        for (let i = 0; i < codeLengthCount; i++) {
            writer.writeBits(codeLengthTable.lengths[CODE_LENGTH_ORDER[i]], 3);
        }
        for (let i = 0; i < symbols.length; i++) {
            const symbol = symbols[i];
            writer.writeBits(codeLengthTable.codes[symbol], codeLengthTable.lengths[symbol]);
            if (symbol >= 16)
                writer.writeBits(extras[i], symbol === 16 ? 2 : symbol === 17 ? 3 : 7);
        }
        writeData(writer, tokens, literals, distances);
    }
}
function writeStored(writer, input, start, end, isFinal) {
    let offset = start;
    do {
        const size = Math.min(65535, end - offset);
        const isLast = isFinal && offset + size >= end;
        writer.writeBits(isLast ? 1 : 0, 3);
        writer.alignToByte();
        writer.writeBits(size, 16);
        writer.writeBits(size ^ 0xffff, 16);
        writer.writeAlignedBytes(input.subarray(offset, offset + size));
        offset += size;
    } while (offset < end);
}
/** Raw DEFLATE (RFC 1951) with hash-chain LZ77 and per-block Huffman choice. */
export function deflateRaw(input, options = {}) {
    const effort = options.effort ?? 64;
    const writer = new LsbBitWriter();
    if (effort <= 0 || input.length === 0) {
        writeStored(writer, input, 0, input.length, true);
        return writer.toBytes();
    }
    const head = new Int32Array(1 << HASH_BITS).fill(-1);
    const previous = new Int32Array(WINDOW_SIZE);
    const tokens = new Tokens();
    let matchDistance = 0;
    const hashAt = (i) => Math.imul((input[i] << 16) | (input[i + 1] << 8) | input[i + 2], 0x9e3779b1) >>>
        (32 - HASH_BITS);
    const insert = (i) => {
        if (i + 2 >= input.length)
            return;
        const h = hashAt(i);
        previous[i & (WINDOW_SIZE - 1)] = head[h];
        head[h] = i;
    };
    const findMatch = (i) => {
        if (i + 2 >= input.length)
            return 0;
        let candidate = head[hashAt(i)];
        let bestLength = 2;
        let bestDistance = 0;
        const limit = Math.min(MAX_MATCH, input.length - i);
        for (let chain = effort; candidate >= 0 && i - candidate <= WINDOW_SIZE && chain > 0; chain--) {
            if (input[candidate + bestLength] === input[i + bestLength]) {
                let length = 0;
                while (length < limit && input[candidate + length] === input[i + length])
                    length++;
                if (length > bestLength) {
                    bestLength = length;
                    bestDistance = i - candidate;
                    if (length === limit)
                        break;
                }
            }
            const next = previous[candidate & (WINDOW_SIZE - 1)];
            if (next >= candidate)
                break;
            candidate = next;
        }
        matchDistance = bestDistance;
        return bestDistance ? bestLength : 0;
    };
    let blockStart = 0;
    let i = 0;
    while (i < input.length) {
        let length = findMatch(i);
        let distance = matchDistance;
        insert(i);
        if (length >= 3 && length < 32 && i + 1 < input.length) {
            const nextLength = findMatch(i + 1);
            if (nextLength > length) {
                tokens.lengths[tokens.count] = input[i];
                tokens.distances[tokens.count++] = 0;
                i++;
                length = nextLength;
                distance = matchDistance;
                insert(i);
            }
        }
        if (length >= 3) {
            tokens.lengths[tokens.count] = length;
            tokens.distances[tokens.count++] = distance;
            for (let k = 1; k < length; k++)
                insert(i + k);
            i += length;
        }
        else {
            tokens.lengths[tokens.count] = input[i];
            tokens.distances[tokens.count++] = 0;
            i++;
        }
        if (tokens.count >= BLOCK_TOKENS - 2) {
            writeBlock(writer, tokens, input, blockStart, i, i >= input.length);
            tokens.count = 0;
            blockStart = i;
        }
    }
    if (tokens.count > 0 || blockStart === 0)
        writeBlock(writer, tokens, input, blockStart, i, true);
    writer.alignToByte();
    return writer.toBytes();
}
export function adler32(bytes) {
    let a = 1;
    let b = 0;
    for (let i = 0; i < bytes.length;) {
        const end = Math.min(bytes.length, i + 5552);
        for (; i < end; i++) {
            a += bytes[i];
            b += a;
        }
        a %= 65521;
        b %= 65521;
    }
    return ((b << 16) | a) >>> 0;
}
/** zlib (RFC 1950) wrapper around raw DEFLATE. */
export function zlibCompress(input, options = {}) {
    const body = deflateRaw(input, options);
    const out = new Uint8Array(body.length + 6);
    out[0] = 0x78;
    out[1] = 0x9c;
    out.set(body, 2);
    new DataView(out.buffer).setUint32(out.length - 4, adler32(input), false);
    return out;
}
