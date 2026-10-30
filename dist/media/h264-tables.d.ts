/** CAVLC coeff_token tables (H.264 9.2.1), indexed [nC table][totalCoeff * 4 + trailingOnes]. */
export declare const COEFF_TOKEN_LENGTHS: Uint8Array<ArrayBuffer>[];
export declare const COEFF_TOKEN_CODES: Uint8Array<ArrayBuffer>[];
export declare const CHROMA_DC_COEFF_TOKEN_LENGTHS: Uint8Array<ArrayBuffer>;
export declare const CHROMA_DC_COEFF_TOKEN_CODES: Uint8Array<ArrayBuffer>;
/** total_zeros tables, indexed [totalCoeff - 1][totalZeros]. */
export declare const TOTAL_ZEROS_LENGTHS: Uint8Array<ArrayBuffer>[];
export declare const TOTAL_ZEROS_CODES: Uint8Array<ArrayBuffer>[];
export declare const CHROMA_DC_TOTAL_ZEROS_LENGTHS: Uint8Array<ArrayBuffer>[];
export declare const CHROMA_DC_TOTAL_ZEROS_CODES: Uint8Array<ArrayBuffer>[];
/** run_before tables, indexed [min(zerosLeft, 7) - 1][runBefore]. */
export declare const RUN_BEFORE_LENGTHS: Uint8Array<ArrayBuffer>[];
export declare const RUN_BEFORE_CODES: Uint8Array<ArrayBuffer>[];
/** coded_block_pattern code number -> pattern (Table 9-4, 4:2:0). */
export declare const INTRA_CBP_FROM_CODE: Uint8Array<ArrayBuffer>;
export declare const INTER_CBP_FROM_CODE: Uint8Array<ArrayBuffer>;
