import { check } from '../core/errors.js';
import { bytesToHex, hexToBytes, isHex, readAscii, writeAscii } from '../core/text.js';
import { getPpmFsidRegion, isPpmFilename, parsePpmFilename, } from '../ppm/ppm-filename.js';
const ALPHABET = 'cwmfjordvegbalksnthpyxquiz012345';
const FILENAME_LENGTH = 28;
const DSI_LIBRARY_FSID_PATTERN = /^(00|10|12|14)[0-9a-f]{9}0[0-9a-f]{4}[0159][0-9a-f]00$/;
/** DSi Library IDs Nintendo used for its own contest notes, which break the usual pattern. */
const DSI_LIBRARY_SPECIAL_SUFFIXES = [
    '5ffc67437acafa01',
    '2da4f9e259e9d603',
    'fa8705164504f803',
    '158900e126840604',
    'd5d59f19c83e2a09',
    'b841d41bba568d0b',
    '0bd95a9b5cc7610e',
    '3532445ae394e414',
];
export function readKwzFsid(bytes, offset) {
    return bytesToHex(bytes.subarray(offset, offset + 10));
}
export function writeKwzFsid(bytes, offset, id) {
    check(isHex(id, 20), 'INVALID_ARGUMENT', `KWZ author IDs must be 20 hex digits, got "${id}"`);
    if (readKwzFsid(bytes, offset) !== id.toLowerCase())
        bytes.set(hexToBytes(id), offset);
}
/** Display form `xxxx-xxxx-xxxx-xxxxxx` (the last byte is never shown). */
export function formatKwzFsid(id) {
    const hex = id.toLowerCase().slice(0, 18).padEnd(18, '0');
    return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 18)}`;
}
export function parseKwzFsid(text) {
    const hex = text.replace(/-/g, '').toLowerCase();
    check(isHex(hex) && (hex.length === 18 || hex.length === 20), 'INVALID_ARGUMENT', `Invalid KWZ author ID "${text}"`);
    return hex.padEnd(20, '0');
}
/** True for IDs that DSi Library conversions derive from a Flipnote Studio (DSi) ID. */
export function isDsiLibraryFsid(id) {
    const hex = id.toLowerCase();
    if (DSI_LIBRARY_FSID_PATTERN.test(hex))
        return true;
    return DSI_LIBRARY_SPECIAL_SUFFIXES.some((suffix) => hex.slice(2, 18) === suffix);
}
/** PPM ID -> DSi Library KWZ ID: `prefix` + the PPM ID's stored (reversed) bytes + `00`. */
export function convertPpmFsidToKwz(id, prefix = '00') {
    check(isHex(id, 16), 'INVALID_ARGUMENT', `Invalid PPM author ID "${id}"`);
    return (prefix + bytesToHex(hexToBytes(id).reverse()) + '00').toLowerCase();
}
/** The four IDs a DSi Library conversion of this PPM ID may use. */
export function listDsiLibraryFsids(id) {
    return ['00', '10', '12', '14'].map((prefix) => convertPpmFsidToKwz(id, prefix));
}
/** Inverse of convertPpmFsidToKwz (bytes 1-8 reversed). */
export function convertKwzFsidToPpm(id) {
    check(isHex(id, 20) || isHex(id, 18), 'INVALID_ARGUMENT', `Invalid KWZ author ID "${id}"`);
    return bytesToHex(hexToBytes(id.slice(2, 18)).reverse()).toUpperCase();
}
export function getKwzFsidRegion(id) {
    return isDsiLibraryFsid(id) ? getPpmFsidRegion(convertKwzFsidToPpm(id)) : 'unknown';
}
/** Packs author ID and timestamps into the 28-character base32 file name. */
export function encodeKwzFilename(parts) {
    check(isHex(parts.authorId) && parts.authorId.length >= 18, 'INVALID_ARGUMENT', 'Filename author ID needs 18 hex digits');
    const bytes = new Uint8Array(18);
    bytes.set(hexToBytes(parts.authorId.slice(0, 18)));
    const view = new DataView(bytes.buffer);
    view.setUint32(9, parts.createdTime >>> 0, true);
    view.setUint32(13, parts.modifiedTime >>> 0, true);
    let text = '';
    for (let i = 0; i < FILENAME_LENGTH; i++) {
        const bit = i * 5;
        const word = (bytes[bit >> 3] << 8) | bytes[(bit >> 3) + 1];
        text += ALPHABET[(word >> (11 - (bit & 7))) & 31];
    }
    return text;
}
export function decodeKwzFilename(name) {
    const text = name.replace(/\.kw[zc]$/i, '');
    if (text.length !== FILENAME_LENGTH)
        return null;
    const bytes = new Uint8Array(18);
    for (let i = 0; i < FILENAME_LENGTH; i++) {
        const value = ALPHABET.indexOf(text[i]);
        if (value < 0)
            return null;
        const bit = i * 5;
        const word = value << (11 - (bit & 7));
        bytes[bit >> 3] |= word >> 8;
        bytes[(bit >> 3) + 1] |= word & 0xff;
    }
    const view = new DataView(bytes.buffer);
    return {
        authorId: bytesToHex(bytes.subarray(0, 9)),
        createdTime: view.getUint32(9, true),
        modifiedTime: view.getUint32(13, true),
    };
}
export function isKwzFilename(name) {
    return decodeKwzFilename(name) !== null;
}
/** Reads a KFH filename field, unpacking the PPM filenames some DSi Library notes contain. */
export function readKwzFilename(bytes, offset) {
    let isText = true;
    for (let i = 0; i < FILENAME_LENGTH && isText; i++) {
        isText = ALPHABET.includes(String.fromCharCode(bytes[offset + i]));
    }
    if (isText)
        return readAscii(bytes, offset, FILENAME_LENGTH);
    const random = readAscii(bytes, offset + 3, 13);
    const edits = bytes[offset + 16] | (bytes[offset + 17] << 8);
    const packed = `${bytesToHex(bytes.subarray(offset, offset + 3)).toUpperCase()}_${random}_${String(edits).padStart(3, '0')}`;
    return isPpmFilename(packed) ? packed : readAscii(bytes, offset, FILENAME_LENGTH);
}
export function writeKwzFilename(bytes, offset, name) {
    if (readKwzFilename(bytes, offset) === name)
        return;
    if (!isPpmFilename(name)) {
        writeAscii(bytes, offset, FILENAME_LENGTH, name);
        return;
    }
    const parts = parsePpmFilename(name);
    bytes.fill(0, offset, offset + FILENAME_LENGTH);
    bytes.set(hexToBytes(parts.mac), offset);
    writeAscii(bytes, offset + 3, 13, parts.ticks);
    bytes[offset + 16] = parts.edits & 0xff;
    bytes[offset + 17] = parts.edits >> 8;
}
/** Random author ID shaped like the ones the 3DS writes (`00` + 8 random bytes + `00`). */
export function createKwzFsid(random = Math.random) {
    let text = '00';
    for (let i = 0; i < 16; i++)
        text += '0123456789abcdef'[Math.floor(random() * 16) & 15];
    return text + '00';
}
