/** Scalefactor Huffman code (ISO/IEC 14496-3), indexed by delta + 60. */
export declare const SCALEFACTOR_CODES: Uint32Array<ArrayBuffer>;
export declare const SCALEFACTOR_LENGTHS: Uint8Array<ArrayBuffer>;
/** Spectral codebooks 1-11 in index order (entry 0 is the zero codebook). */
export declare const SPECTRAL_CODES: Uint16Array<ArrayBuffer>[];
export declare const SPECTRAL_LENGTHS: Uint8Array<ArrayBuffer>[];
/** Long-window scalefactor band offsets by sample rate. */
export declare const SWB_OFFSETS: Record<number, Uint16Array>;
