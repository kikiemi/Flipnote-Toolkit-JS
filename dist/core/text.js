import { fail } from './errors.js';
const HEX_DIGITS = '0123456789abcdef';
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_LOOKUP = createBase64Lookup();
function createBase64Lookup() {
    const lookup = new Int8Array(128).fill(-1);
    for (let i = 0; i < 64; i++)
        lookup[BASE64_ALPHABET.charCodeAt(i)] = i;
    lookup['-'.charCodeAt(0)] = 62;
    lookup['_'.charCodeAt(0)] = 63;
    return lookup;
}
export function bytesToHex(bytes) {
    let text = '';
    for (let i = 0; i < bytes.length; i++) {
        text += HEX_DIGITS[bytes[i] >> 4] + HEX_DIGITS[bytes[i] & 15];
    }
    return text;
}
export function hexToBytes(hex) {
    const clean = hex.replace(/[\s:-]/g, '');
    if (clean.length % 2 || /[^0-9a-f]/i.test(clean)) {
        fail('INVALID_ARGUMENT', `Invalid hex string "${hex}"`);
    }
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++)
        bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    return bytes;
}
export function isHex(text, length) {
    return /^[0-9a-f]*$/i.test(text) && (length === undefined || text.length === length);
}
/** Reads a null-terminated UTF-16LE string from a fixed-size field. */
export function readUtf16(bytes, offset, maxChars) {
    let text = '';
    for (let i = 0; i < maxChars; i++) {
        const code = bytes[offset + i * 2] | (bytes[offset + i * 2 + 1] << 8);
        if (code === 0)
            break;
        text += String.fromCharCode(code);
    }
    return text;
}
/** Writes a UTF-16LE string into a fixed-size, zero-padded field. */
function writeUtf16(bytes, offset, maxChars, text) {
    bytes.fill(0, offset, offset + maxChars * 2);
    const count = Math.min(text.length, maxChars);
    for (let i = 0; i < count; i++) {
        const code = text.charCodeAt(i);
        bytes[offset + i * 2] = code & 0xff;
        bytes[offset + i * 2 + 1] = code >> 8;
    }
}
/** Writes `text` only when the field decodes to something else, keeping bytes after the terminator. */
export function updateUtf16(bytes, offset, maxChars, text) {
    if (readUtf16(bytes, offset, maxChars) !== text)
        writeUtf16(bytes, offset, maxChars, text);
}
/** Reads a fixed-size ASCII field up to the first null byte. */
export function readAscii(bytes, offset, length) {
    let text = '';
    for (let i = 0; i < length && bytes[offset + i] !== 0; i++) {
        text += String.fromCharCode(bytes[offset + i]);
    }
    return text;
}
/** Writes an ASCII string into a fixed-size, zero-padded field. */
export function writeAscii(bytes, offset, length, text) {
    bytes.fill(0, offset, offset + length);
    const count = Math.min(text.length, length);
    for (let i = 0; i < count; i++)
        bytes[offset + i] = text.charCodeAt(i) & 0xff;
}
export function encodeBase64(bytes) {
    let text = '';
    let i = 0;
    for (; i + 2 < bytes.length; i += 3) {
        const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
        text +=
            BASE64_ALPHABET[n >> 18] +
                BASE64_ALPHABET[(n >> 12) & 63] +
                BASE64_ALPHABET[(n >> 6) & 63] +
                BASE64_ALPHABET[n & 63];
    }
    if (i < bytes.length) {
        const n = (bytes[i] << 16) | ((i + 1 < bytes.length ? bytes[i + 1] : 0) << 8);
        text += BASE64_ALPHABET[n >> 18] + BASE64_ALPHABET[(n >> 12) & 63];
        text += i + 1 < bytes.length ? BASE64_ALPHABET[(n >> 6) & 63] + '=' : '==';
    }
    return text;
}
/** Decodes base64 or base64url; whitespace is ignored. */
export function decodeBase64(text) {
    const clean = text.replace(/[\s=]/g, '');
    const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
    let bits = 0;
    let bitCount = 0;
    let length = 0;
    for (let i = 0; i < clean.length; i++) {
        const code = clean.charCodeAt(i);
        const value = code < 128 ? BASE64_LOOKUP[code] : -1;
        if (value < 0)
            fail('INVALID_ARGUMENT', 'Invalid base64 data');
        bits = ((bits << 6) | value) & 0xffffff;
        bitCount += 6;
        if (bitCount >= 8) {
            bitCount -= 8;
            bytes[length++] = (bits >> bitCount) & 0xff;
        }
    }
    return bytes.subarray(0, length);
}
