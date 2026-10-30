export declare function bytesToHex(bytes: Uint8Array): string;
export declare function hexToBytes(hex: string): Uint8Array;
export declare function isHex(text: string, length?: number): boolean;
/** Reads a null-terminated UTF-16LE string from a fixed-size field. */
export declare function readUtf16(bytes: Uint8Array, offset: number, maxChars: number): string;
/** Writes `text` only when the field decodes to something else, keeping bytes after the terminator. */
export declare function updateUtf16(bytes: Uint8Array, offset: number, maxChars: number, text: string): void;
/** Reads a fixed-size ASCII field up to the first null byte. */
export declare function readAscii(bytes: Uint8Array, offset: number, length: number): string;
/** Writes an ASCII string into a fixed-size, zero-padded field. */
export declare function writeAscii(bytes: Uint8Array, offset: number, length: number, text: string): void;
export declare function encodeBase64(bytes: Uint8Array): string;
/** Decodes base64 or base64url; whitespace is ignored. */
export declare function decodeBase64(text: string): Uint8Array;
