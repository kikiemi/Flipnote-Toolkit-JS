/** Length-limited Huffman code lengths (JPEG Annex K.3 style adjustment). */
export declare function buildCodeLengths(frequencies: ArrayLike<number>, maxLength: number): Uint8Array;
/** Canonical codes for the given lengths (most significant bit first). */
export declare function buildCanonicalCodes(lengths: Uint8Array): Uint32Array;
export declare function reverseBits(value: number, length: number): number;
