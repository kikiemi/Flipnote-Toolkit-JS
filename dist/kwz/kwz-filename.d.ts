import { type FlipnoteRegion } from '../ppm/ppm-filename.ts';
export interface KwzFilenameParts {
    /** First 9 bytes of the author ID as 18 hex digits. */
    authorId: string;
    createdTime: number;
    modifiedTime: number;
}
export declare function readKwzFsid(bytes: Uint8Array, offset: number): string;
export declare function writeKwzFsid(bytes: Uint8Array, offset: number, id: string): void;
/** Display form `xxxx-xxxx-xxxx-xxxxxx` (the last byte is never shown). */
export declare function formatKwzFsid(id: string): string;
export declare function parseKwzFsid(text: string): string;
/** True for IDs that DSi Library conversions derive from a Flipnote Studio (DSi) ID. */
export declare function isDsiLibraryFsid(id: string): boolean;
/** PPM ID -> DSi Library KWZ ID: `prefix` + the PPM ID's stored (reversed) bytes + `00`. */
export declare function convertPpmFsidToKwz(id: string, prefix?: string): string;
/** The four IDs a DSi Library conversion of this PPM ID may use. */
export declare function listDsiLibraryFsids(id: string): string[];
/** Inverse of convertPpmFsidToKwz (bytes 1-8 reversed). */
export declare function convertKwzFsidToPpm(id: string): string;
export declare function getKwzFsidRegion(id: string): FlipnoteRegion;
/** Packs author ID and timestamps into the 28-character base32 file name. */
export declare function encodeKwzFilename(parts: KwzFilenameParts): string;
export declare function decodeKwzFilename(name: string): KwzFilenameParts | null;
export declare function isKwzFilename(name: string): boolean;
/** Reads a KFH filename field, unpacking the PPM filenames some DSi Library notes contain. */
export declare function readKwzFilename(bytes: Uint8Array, offset: number): string;
export declare function writeKwzFilename(bytes: Uint8Array, offset: number, name: string): void;
/** Random author ID shaped like the ones the 3DS writes (`00` + 8 random bytes + `00`). */
export declare function createKwzFsid(random?: () => number): string;
