import { type PpmFilename } from './ppm-types.ts';
export type FlipnoteRegion = 'japan' | 'americas' | 'europe' | 'unknown';
/** Reads an 8-byte ID stored in reverse byte order as 16 uppercase hex digits. */
export declare function readPpmFsid(bytes: Uint8Array, offset: number): string;
export declare function writePpmFsid(bytes: Uint8Array, offset: number, id: string): void;
/** True for IDs shaped like the ones Flipnote Studio generates. */
export declare function isPpmFsid(id: string): boolean;
export declare function getPpmFsidRegion(id: string): FlipnoteRegion;
export declare function formatPpmFilename(name: PpmFilename): string;
export declare function parsePpmFilename(text: string): PpmFilename;
export declare function isPpmFilename(text: string): boolean;
/** Reads the 18-byte form: 3-byte MAC, 13 characters, uint16 edit counter. */
export declare function readPpmFilename(bytes: Uint8Array, offset: number): PpmFilename;
export declare function writePpmFilename(bytes: Uint8Array, offset: number, name: PpmFilename): void;
/** Root fragment: 3-byte MAC plus the first 10 characters of the name packed as hex. */
export declare function createPpmRootFragment(name: PpmFilename): string;
/** The name used on SD cards and system memory: the first character becomes a checksum. */
export declare function formatPpmStorageFilename(name: PpmFilename): string;
export declare function isPpmStorageFilename(text: string): boolean;
/**
 * New filename for a console whose MAC address ends with `mac`, made at `time` (seconds since
 * 2000). Like the app, the middle part is the console's tick count at that moment; `random`
 * picks the moment within the second.
 */
export declare function createPpmFilename(mac: string, time?: number, random?: () => number): PpmFilename;
/** Random, well-formed Flipnote Studio ID (region 1, zero constant at index 7). */
export declare function createPpmFsid(random?: () => number): string;
