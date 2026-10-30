import { check } from '../core/errors.js';
import { bytesToHex, hexToBytes, isHex } from '../core/text.js';
import { currentTimestamp } from '../core/time.js';
import { PPM_TICKS_PER_SECOND } from './ppm-types.js';
const CHECKSUM_DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const FILENAME_PATTERN = /^([0-9A-F]{6})_([0-9A-Z]{13})_(\d{3,5})$/i;
const STORAGE_PATTERN = /^[0-9A-Z][0-9A-F]{5}_[0-9A-F]{13}_\d{3}$/i;
const FSID_PATTERN = /^[0159][0-9A-F]{15}$/i;
/** Reads an 8-byte ID stored in reverse byte order as 16 uppercase hex digits. */
export function readPpmFsid(bytes, offset) {
    return bytesToHex(bytes.slice(offset, offset + 8).reverse()).toUpperCase();
}
export function writePpmFsid(bytes, offset, id) {
    check(isHex(id, 16), 'INVALID_ARGUMENT', `PPM author IDs must be 16 hex digits, got "${id}"`);
    bytes.set(hexToBytes(id).reverse(), offset);
}
/** True for IDs shaped like the ones Flipnote Studio generates. */
export function isPpmFsid(id) {
    return FSID_PATTERN.test(id);
}
export function getPpmFsidRegion(id) {
    if (!isPpmFsid(id))
        return 'unknown';
    const digit = id[0];
    return digit === '0' || digit === '1' ? 'japan' : digit === '5' ? 'americas' : 'europe';
}
export function formatPpmFilename(name) {
    return `${name.mac.toUpperCase()}_${name.ticks}_${String(name.edits).padStart(3, '0')}`;
}
export function parsePpmFilename(text) {
    const match = FILENAME_PATTERN.exec(text.replace(/\.ppm$/i, ''));
    check(match, 'INVALID_ARGUMENT', `Invalid PPM filename "${text}"`);
    return { mac: match[1].toUpperCase(), ticks: match[2].toUpperCase(), edits: Number(match[3]) };
}
export function isPpmFilename(text) {
    return FILENAME_PATTERN.test(text.replace(/\.ppm$/i, ''));
}
/** Reads the 18-byte form: 3-byte MAC, 13 characters, uint16 edit counter. */
export function readPpmFilename(bytes, offset) {
    let ticks = '';
    for (let i = 3; i < 16 && bytes[offset + i] !== 0; i++) {
        ticks += String.fromCharCode(bytes[offset + i]);
    }
    return {
        mac: bytesToHex(bytes.subarray(offset, offset + 3)).toUpperCase(),
        ticks,
        edits: bytes[offset + 16] | (bytes[offset + 17] << 8),
    };
}
function isEqualPpmFilename(a, b) {
    return a.mac.toUpperCase() === b.mac.toUpperCase() && a.ticks === b.ticks && a.edits === b.edits;
}
export function writePpmFilename(bytes, offset, name) {
    check(isHex(name.mac, 6), 'INVALID_ARGUMENT', `PPM filename MAC must be 6 hex digits, got "${name.mac}"`);
    check(name.ticks.length <= 13, 'INVALID_ARGUMENT', 'PPM filename tick part must be at most 13 characters');
    check(Number.isInteger(name.edits) && name.edits >= 0 && name.edits <= 0xffff, 'INVALID_ARGUMENT', 'PPM edit count must fit 16 bits');
    if (isEqualPpmFilename(readPpmFilename(bytes, offset), name))
        return;
    bytes.set(hexToBytes(name.mac), offset);
    bytes.fill(0, offset + 3, offset + 16);
    for (let i = 0; i < name.ticks.length; i++) {
        bytes[offset + 3 + i] = name.ticks.charCodeAt(i) & 0xff;
    }
    bytes[offset + 16] = name.edits & 0xff;
    bytes[offset + 17] = name.edits >> 8;
}
/** Root fragment: 3-byte MAC plus the first 10 characters of the name packed as hex. */
export function createPpmRootFragment(name) {
    const ticks = name.ticks.slice(0, 10).padEnd(10, '0');
    return (name.mac + (isHex(ticks) ? ticks : '0000000000')).toUpperCase();
}
/** The name used on SD cards and system memory: the first character becomes a checksum. */
export function formatPpmStorageFilename(name) {
    const text = formatPpmFilename(name);
    let sum = parseInt(text.slice(0, 2), 16);
    for (let i = 1; i < 16; i++)
        sum = (sum + text.charCodeAt(i)) & 0xff;
    return CHECKSUM_DIGITS[sum % CHECKSUM_DIGITS.length] + text.slice(1) + '.ppm';
}
export function isPpmStorageFilename(text) {
    return STORAGE_PATTERN.test(text.replace(/\.ppm$/i, ''));
}
function randomHex(count, random) {
    let text = '';
    for (let i = 0; i < count; i++)
        text += '0123456789ABCDEF'[Math.floor(random() * 16) & 15];
    return text;
}
/**
 * New filename for a console whose MAC address ends with `mac`, made at `time` (seconds since
 * 2000). Like the app, the middle part is the console's tick count at that moment; `random`
 * picks the moment within the second.
 */
export function createPpmFilename(mac, time = currentTimestamp(), random = Math.random) {
    check(isHex(mac, 6), 'INVALID_ARGUMENT', 'MAC suffix must be 6 hex digits');
    const ticks = Math.floor((time + random()) * PPM_TICKS_PER_SECOND);
    return {
        mac: mac.toUpperCase(),
        ticks: ticks.toString(16).toUpperCase().padStart(13, '0'),
        edits: 0,
    };
}
/** Random, well-formed Flipnote Studio ID (region 1, zero constant at index 7). */
export function createPpmFsid(random = Math.random) {
    return '1' + randomHex(6, random) + '0' + randomHex(8, random);
}
