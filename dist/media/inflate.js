import { LsbBitReader } from '../core/bit-reader.js';
import { check, fail } from '../core/errors.js';
import { adler32, CODE_LENGTH_ORDER, DISTANCE_BASE, DISTANCE_EXTRA, LENGTH_BASE, LENGTH_EXTRA, } from './deflate.js';
function createDecodeTable(lengths) {
    let bits = 0;
    for (const length of lengths)
        bits = Math.max(bits, length);
    bits = Math.max(bits, 1);
    const entries = new Uint32Array(1 << bits);
    const counts = new Uint16Array(16);
    for (const length of lengths)
        counts[length]++;
    counts[0] = 0;
    let code = 0;
    const next = new Uint16Array(16);
    for (let length = 1; length < 16; length++) {
        code = (code + counts[length - 1]) << 1;
        next[length] = code;
    }
    for (let symbol = 0; symbol < lengths.length; symbol++) {
        const length = lengths[symbol];
        if (!length)
            continue;
        let reversed = 0;
        for (let i = 0, value = next[length]++; i < length; i++, value >>= 1) {
            reversed = (reversed << 1) | (value & 1);
        }
        for (let index = reversed; index < entries.length; index += 1 << length) {
            entries[index] = (symbol << 4) | length;
        }
    }
    return { entries, bits };
}
function decodeSymbol(reader, table) {
    const entry = table.entries[reader.peekBits(table.bits)];
    check(entry !== 0, 'CORRUPT_DATA', 'Invalid Huffman code in DEFLATE stream');
    reader.dropBits(entry & 15);
    return entry >>> 4;
}
const FIXED_LITERALS = createDecodeTable(new Uint8Array(288).fill(8, 0, 144).fill(9, 144, 256).fill(7, 256, 280).fill(8, 280, 288));
const FIXED_DISTANCES = createDecodeTable(new Uint8Array(30).fill(5));
class Output {
    bytes;
    length = 0;
    constructor(capacity) {
        this.bytes = new Uint8Array(Math.max(1024, capacity));
    }
    reserve(count) {
        if (this.length + count <= this.bytes.length)
            return;
        const bytes = new Uint8Array(Math.max(this.bytes.length * 2, this.length + count));
        bytes.set(this.bytes.subarray(0, this.length));
        this.bytes = bytes;
    }
}
/** Decodes raw DEFLATE (RFC 1951). */
export function inflateRaw(input, expectedSize = 0) {
    const reader = new LsbBitReader(input);
    const out = new Output(expectedSize || input.length * 4);
    let isFinal = false;
    while (!isFinal) {
        isFinal = reader.readBits(1) === 1;
        const type = reader.readBits(2);
        if (type === 0) {
            reader.alignToByte();
            const length = reader.readBits(16);
            const inverse = reader.readBits(16);
            check((length ^ 0xffff) === inverse, 'CORRUPT_DATA', 'Invalid stored DEFLATE block');
            const start = reader.bytePosition;
            check(start + length <= input.length, 'CORRUPT_DATA', 'Truncated stored DEFLATE block');
            out.reserve(length);
            out.bytes.set(input.subarray(start, start + length), out.length);
            out.length += length;
            reader.seekByte(start + length);
            continue;
        }
        let literals = FIXED_LITERALS;
        let distances = FIXED_DISTANCES;
        if (type === 2) {
            const literalCount = reader.readBits(5) + 257;
            const distanceCount = reader.readBits(5) + 1;
            const codeLengthCount = reader.readBits(4) + 4;
            const codeLengths = new Uint8Array(19);
            for (let i = 0; i < codeLengthCount; i++) {
                codeLengths[CODE_LENGTH_ORDER[i]] = reader.readBits(3);
            }
            const codeLengthTable = createDecodeTable(codeLengths);
            const lengths = new Uint8Array(literalCount + distanceCount);
            for (let i = 0; i < lengths.length;) {
                const symbol = decodeSymbol(reader, codeLengthTable);
                if (symbol < 16) {
                    lengths[i++] = symbol;
                    continue;
                }
                let repeat = 0;
                let value = 0;
                if (symbol === 16) {
                    check(i > 0, 'CORRUPT_DATA', 'Invalid DEFLATE code length repeat');
                    value = lengths[i - 1];
                    repeat = 3 + reader.readBits(2);
                }
                else {
                    repeat = symbol === 17 ? 3 + reader.readBits(3) : 11 + reader.readBits(7);
                }
                check(i + repeat <= lengths.length, 'CORRUPT_DATA', 'DEFLATE code lengths overflow');
                lengths.fill(value, i, i + repeat);
                i += repeat;
            }
            literals = createDecodeTable(lengths.subarray(0, literalCount));
            distances = createDecodeTable(lengths.subarray(literalCount));
        }
        else if (type !== 1) {
            fail('CORRUPT_DATA', 'Invalid DEFLATE block type');
        }
        for (;;) {
            const symbol = decodeSymbol(reader, literals);
            if (symbol < 256) {
                out.reserve(1);
                out.bytes[out.length++] = symbol;
                continue;
            }
            if (symbol === 256)
                break;
            const lengthCode = symbol - 257;
            check(lengthCode < 29, 'CORRUPT_DATA', 'Invalid DEFLATE length code');
            const length = LENGTH_BASE[lengthCode] + reader.readBits(LENGTH_EXTRA[lengthCode]);
            const distanceCode = decodeSymbol(reader, distances);
            check(distanceCode < 30, 'CORRUPT_DATA', 'Invalid DEFLATE distance code');
            const distance = DISTANCE_BASE[distanceCode] + reader.readBits(DISTANCE_EXTRA[distanceCode]);
            check(distance <= out.length, 'CORRUPT_DATA', 'DEFLATE distance is too far back');
            out.reserve(length);
            const bytes = out.bytes;
            for (let k = 0; k < length; k++, out.length++) {
                bytes[out.length] = bytes[out.length - distance];
            }
        }
        check(!reader.isOverrun, 'CORRUPT_DATA', 'Truncated DEFLATE stream');
    }
    return out.bytes.slice(0, out.length);
}
/** Decodes a zlib (RFC 1950) stream and checks its Adler-32. */
export function zlibDecompress(input, expectedSize = 0) {
    check(input.length >= 6 && (input[0] & 0x0f) === 8 && ((input[0] << 8) | input[1]) % 31 === 0, 'CORRUPT_DATA', 'Invalid zlib header');
    check((input[1] & 0x20) === 0, 'UNSUPPORTED', 'zlib preset dictionaries are not supported');
    const out = inflateRaw(input.subarray(2), expectedSize);
    const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
    const stored = view.getUint32(input.length - 4, false);
    check(stored === adler32(out), 'CORRUPT_DATA', 'zlib checksum mismatch');
    return out;
}
