/** Zigzag position -> natural (row-major) index. */
export declare const ZIGZAG: Uint8Array<ArrayBuffer>;
/** ITU T.81 Annex K quantization tables in natural order. */
export declare const LUMA_QUANT: Uint8Array<ArrayBuffer>;
export declare const CHROMA_QUANT: Uint8Array<ArrayBuffer>;
/** Annex K Huffman tables: code counts for lengths 1-16 and symbol values. */
export interface HuffmanSpec {
    counts: Uint8Array;
    symbols: Uint8Array;
}
export declare const DC_LUMA: HuffmanSpec;
export declare const DC_CHROMA: HuffmanSpec;
export declare const AC_LUMA: HuffmanSpec;
export declare const AC_CHROMA: HuffmanSpec;
