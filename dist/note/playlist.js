import { readU32, writeU16, writeU32 } from '../core/bytes.js';
import { crc32 } from '../core/crc32.js';
/** XOR key shared by Flipnote Studio .pls/.lst and Flipnote Studio 3D .lst playlists. */
const PLAYLIST_KEY = new Uint8Array([
    0xf7, 0x4c, 0x6a, 0x3a, 0xfb, 0x82, 0xa6, 0x37, 0x6e, 0x11, 0x38, 0xcf, 0xa0, 0xdd, 0x85, 0xc0,
    0xc7, 0x9b, 0xc4, 0xd8, 0xdd, 0x28, 0x8a, 0x87, 0x53, 0x20, 0xee, 0xe0, 0x0b, 0xeb, 0x43, 0xa0,
    0xdb, 0x55, 0x0f, 0x75, 0x36, 0x37, 0xeb, 0x35, 0x6a, 0x34, 0x7f, 0xb5, 0x0f, 0x99, 0xf7, 0xef,
    0x43, 0x25, 0xce, 0xa0, 0x29, 0x46, 0xd9, 0xd4, 0x4d, 0xbb, 0x04, 0x66, 0x68, 0x08, 0xf1, 0xf8,
]);
/** The 3DS app only cycles through the first 61 key bytes. */
const KWZ_KEY_LENGTH = 61;
const SEPARATOR = 0x0a;
function applyKey(bytes, keyLength) {
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++)
        out[i] = bytes[i] ^ PLAYLIST_KEY[i % keyLength];
    return out;
}
function swapHalves(value) {
    return ((value >>> 16) | (value << 16)) >>> 0;
}
function encodeUtf16List(entries) {
    const text = entries.map((entry) => entry + '\n').join('');
    const out = new Uint8Array(text.length * 2);
    for (let i = 0; i < text.length; i++)
        writeU16(out, i * 2, text.charCodeAt(i));
    return out;
}
/** Decodes a playlist: `.pls`/`.lst` from Flipnote Studio or `.lst` from Flipnote Studio 3D. */
export function readPlaylist(bytes, format) {
    if (format === 'ppm') {
        const plain = applyKey(bytes, PLAYLIST_KEY.length);
        const text = String.fromCharCode(...plain);
        const entries = text.split('\n').filter((entry) => entry.length > 0);
        return { format, entries, flags: [], isChecksumValid: null };
    }
    const plain = applyKey(bytes, KWZ_KEY_LENGTH);
    const separator = plain[4] | (plain[5] << 8);
    const entries = [];
    let current = '';
    let p = 6;
    for (; p + 1 < plain.length; p += 2) {
        const code = plain[p] | (plain[p + 1] << 8);
        if (code === separator) {
            entries.push(current);
            current = '';
            if (plain.length - (p + 2) === entries.length) {
                p += 2;
                break;
            }
            continue;
        }
        current += String.fromCharCode(code);
    }
    const listEnd = p;
    const flags = Array.from(plain.subarray(listEnd, listEnd + entries.length));
    const isChecksumValid = swapHalves(readU32(plain, 0)) === crc32(plain, 6, listEnd);
    return { format, entries, flags, isChecksumValid };
}
/** Encodes a playlist in the given app's format. */
export function writePlaylist(entries, format, flags = []) {
    if (format === 'ppm') {
        const text = entries.map((entry) => entry + '\n').join('');
        const plain = new Uint8Array(text.length);
        for (let i = 0; i < text.length; i++)
            plain[i] = text.charCodeAt(i) & 0xff;
        return applyKey(plain, PLAYLIST_KEY.length);
    }
    const list = encodeUtf16List(entries);
    const plain = new Uint8Array(6 + list.length + entries.length);
    writeU32(plain, 0, swapHalves(crc32(list)));
    writeU16(plain, 4, SEPARATOR);
    plain.set(list, 6);
    entries.forEach((_, i) => (plain[6 + list.length + i] = flags[i] ?? 0));
    return applyKey(plain, KWZ_KEY_LENGTH);
}
