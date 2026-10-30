export declare const LENGTH_BASE: number[];
export declare const LENGTH_EXTRA: number[];
export declare const DISTANCE_BASE: number[];
export declare const DISTANCE_EXTRA: number[];
export declare const CODE_LENGTH_ORDER: number[];
export interface DeflateOptions {
    /** Longest hash chain to search, 0 = store only (default 64). */
    effort?: number;
}
/** Raw DEFLATE (RFC 1951) with hash-chain LZ77 and per-block Huffman choice. */
export declare function deflateRaw(input: Uint8Array, options?: DeflateOptions): Uint8Array;
export declare function adler32(bytes: Uint8Array): number;
/** zlib (RFC 1950) wrapper around raw DEFLATE. */
export declare function zlibCompress(input: Uint8Array, options?: DeflateOptions): Uint8Array;
