export declare function concatBytes(parts: readonly Uint8Array[]): Uint8Array;
export declare function align4(value: number): number;
/** 32-bit view of `bytes` for reading; misaligned input is copied first. */
export declare function toWords(bytes: Uint8Array): Uint32Array;
/** Runs `write` on a 4-byte-aligned buffer that is copied back into `bytes` when needed. */
export declare function writeAligned(bytes: Uint8Array, write: (aligned: Uint8Array) => void): void;
export declare function isEqualBytes(a: Uint8Array, b: Uint8Array): boolean;
/** Index of `pattern` in `bytes` at or after `from` with the given alignment, or -1. */
export declare function findBytes(bytes: Uint8Array, pattern: Uint8Array, from?: number, step?: number): number;
export declare function readU16(bytes: Uint8Array, offset: number): number;
export declare function readU32(bytes: Uint8Array, offset: number): number;
export declare function writeU16(bytes: Uint8Array, offset: number, value: number): void;
export declare function writeU32(bytes: Uint8Array, offset: number, value: number): void;
/** Copy of `object` without properties whose value is undefined, for merging option overrides. */
export declare function withoutUndefined<T extends object>(object: T): Partial<T>;
