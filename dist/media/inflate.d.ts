/** Decodes raw DEFLATE (RFC 1951). */
export declare function inflateRaw(input: Uint8Array, expectedSize?: number): Uint8Array;
/** Decodes a zlib (RFC 1950) stream and checks its Adler-32. */
export declare function zlibDecompress(input: Uint8Array, expectedSize?: number): Uint8Array;
