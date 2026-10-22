/** CAVLC coeff_token tables (H.264 9.2.1), indexed [nC table][totalCoeff * 4 + trailingOnes]. */
export const COEFF_TOKEN_LENGTHS = [
  new Uint8Array([
    1, 0, 0, 0, 6, 2, 0, 0, 8, 6, 3, 0, 9, 8, 7, 5, 10, 9, 8, 6, 11, 10, 9, 7, 13, 11, 10, 8, 13,
    13, 11, 9, 13, 13, 13, 10, 14, 14, 13, 11, 14, 14, 14, 13, 15, 15, 14, 14, 15, 15, 15, 14, 16,
    15, 15, 15, 16, 16, 16, 15, 16, 16, 16, 16, 16, 16, 16, 16,
  ]),
  new Uint8Array([
    2, 0, 0, 0, 6, 2, 0, 0, 6, 5, 3, 0, 7, 6, 6, 4, 8, 6, 6, 4, 8, 7, 7, 5, 9, 8, 8, 6, 11, 9, 9, 6,
    11, 11, 11, 7, 12, 11, 11, 9, 12, 12, 12, 11, 12, 12, 12, 11, 13, 13, 13, 12, 13, 13, 13, 13,
    13, 14, 13, 13, 14, 14, 14, 13, 14, 14, 14, 14,
  ]),
  new Uint8Array([
    4, 0, 0, 0, 6, 4, 0, 0, 6, 5, 4, 0, 6, 5, 5, 4, 7, 5, 5, 4, 7, 5, 5, 4, 7, 6, 6, 4, 7, 6, 6, 4,
    8, 7, 7, 5, 8, 8, 7, 6, 9, 8, 8, 7, 9, 9, 8, 8, 9, 9, 9, 8, 10, 9, 9, 9, 10, 10, 10, 10, 10, 10,
    10, 10, 10, 10, 10, 10,
  ]),
  new Uint8Array([
    6, 0, 0, 0, 6, 6, 0, 0, 6, 6, 6, 0, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
    6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
    6, 6, 6, 6,
  ]),
];
export const COEFF_TOKEN_CODES = [
  new Uint8Array([
    1, 0, 0, 0, 5, 1, 0, 0, 7, 4, 1, 0, 7, 6, 5, 3, 7, 6, 5, 3, 7, 6, 5, 4, 15, 6, 5, 4, 11, 14, 5,
    4, 8, 10, 13, 4, 15, 14, 9, 4, 11, 10, 13, 12, 15, 14, 9, 12, 11, 10, 13, 8, 15, 1, 9, 12, 11,
    14, 13, 8, 7, 10, 9, 12, 4, 6, 5, 8,
  ]),
  new Uint8Array([
    3, 0, 0, 0, 11, 2, 0, 0, 7, 7, 3, 0, 7, 10, 9, 5, 7, 6, 5, 4, 4, 6, 5, 6, 7, 6, 5, 8, 15, 6, 5,
    4, 11, 14, 13, 4, 15, 10, 9, 4, 11, 14, 13, 12, 8, 10, 9, 8, 15, 14, 13, 12, 11, 10, 9, 12, 7,
    11, 6, 8, 9, 8, 10, 1, 7, 6, 5, 4,
  ]),
  new Uint8Array([
    15, 0, 0, 0, 15, 14, 0, 0, 11, 15, 13, 0, 8, 12, 14, 12, 15, 10, 11, 11, 11, 8, 9, 10, 9, 14,
    13, 9, 8, 10, 9, 8, 15, 14, 13, 13, 11, 14, 10, 12, 15, 10, 13, 12, 11, 14, 9, 12, 8, 10, 13, 8,
    13, 7, 9, 12, 9, 12, 11, 10, 5, 8, 7, 6, 1, 4, 3, 2,
  ]),
  new Uint8Array([
    3, 0, 0, 0, 0, 1, 0, 0, 4, 5, 6, 0, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
    23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46,
    47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63,
  ]),
];
export const CHROMA_DC_COEFF_TOKEN_LENGTHS = new Uint8Array([
  2, 0, 0, 0, 6, 1, 0, 0, 6, 6, 3, 0, 6, 7, 7, 6, 6, 8, 8, 7,
]);
export const CHROMA_DC_COEFF_TOKEN_CODES = new Uint8Array([
  1, 0, 0, 0, 7, 1, 0, 0, 4, 6, 1, 0, 3, 3, 2, 5, 2, 3, 2, 0,
]);
/** total_zeros tables, indexed [totalCoeff - 1][totalZeros]. */
export const TOTAL_ZEROS_LENGTHS = [
  new Uint8Array([1, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 9]),
  new Uint8Array([3, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 6, 6, 6, 6]),
  new Uint8Array([4, 3, 3, 3, 4, 4, 3, 3, 4, 5, 5, 6, 5, 6]),
  new Uint8Array([5, 3, 4, 4, 3, 3, 3, 4, 3, 4, 5, 5, 5]),
  new Uint8Array([4, 4, 4, 3, 3, 3, 3, 3, 4, 5, 4, 5]),
  new Uint8Array([6, 5, 3, 3, 3, 3, 3, 3, 4, 3, 6]),
  new Uint8Array([6, 5, 3, 3, 3, 2, 3, 4, 3, 6]),
  new Uint8Array([6, 4, 5, 3, 2, 2, 3, 3, 6]),
  new Uint8Array([6, 6, 4, 2, 2, 3, 2, 5]),
  new Uint8Array([5, 5, 3, 2, 2, 2, 4]),
  new Uint8Array([4, 4, 3, 3, 1, 3]),
  new Uint8Array([4, 4, 2, 1, 3]),
  new Uint8Array([3, 3, 1, 2]),
  new Uint8Array([2, 2, 1]),
  new Uint8Array([1, 1]),
];
export const TOTAL_ZEROS_CODES = [
  new Uint8Array([1, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 1]),
  new Uint8Array([7, 6, 5, 4, 3, 5, 4, 3, 2, 3, 2, 3, 2, 1, 0]),
  new Uint8Array([5, 7, 6, 5, 4, 3, 4, 3, 2, 3, 2, 1, 1, 0]),
  new Uint8Array([3, 7, 5, 4, 6, 5, 4, 3, 3, 2, 2, 1, 0]),
  new Uint8Array([5, 4, 3, 7, 6, 5, 4, 3, 2, 1, 1, 0]),
  new Uint8Array([1, 1, 7, 6, 5, 4, 3, 2, 1, 1, 0]),
  new Uint8Array([1, 1, 5, 4, 3, 3, 2, 1, 1, 0]),
  new Uint8Array([1, 1, 1, 3, 3, 2, 2, 1, 0]),
  new Uint8Array([1, 0, 1, 3, 2, 1, 1, 1]),
  new Uint8Array([1, 0, 1, 3, 2, 1, 1]),
  new Uint8Array([0, 1, 1, 2, 1, 3]),
  new Uint8Array([0, 1, 1, 1, 1]),
  new Uint8Array([0, 1, 1, 1]),
  new Uint8Array([0, 1, 1]),
  new Uint8Array([0, 1]),
];
export const CHROMA_DC_TOTAL_ZEROS_LENGTHS = [
  new Uint8Array([1, 2, 3, 3]),
  new Uint8Array([1, 2, 2, 0]),
  new Uint8Array([1, 1, 0, 0]),
];
export const CHROMA_DC_TOTAL_ZEROS_CODES = [
  new Uint8Array([1, 1, 1, 0]),
  new Uint8Array([1, 1, 0, 0]),
  new Uint8Array([1, 0, 0, 0]),
];
/** run_before tables, indexed [min(zerosLeft, 7) - 1][runBefore]. */
export const RUN_BEFORE_LENGTHS = [
  new Uint8Array([1, 1]),
  new Uint8Array([1, 2, 2]),
  new Uint8Array([2, 2, 2, 2]),
  new Uint8Array([2, 2, 2, 3, 3]),
  new Uint8Array([2, 2, 3, 3, 3, 3]),
  new Uint8Array([2, 3, 3, 3, 3, 3, 3]),
  new Uint8Array([3, 3, 3, 3, 3, 3, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
];
export const RUN_BEFORE_CODES = [
  new Uint8Array([1, 0]),
  new Uint8Array([1, 1, 0]),
  new Uint8Array([3, 2, 1, 0]),
  new Uint8Array([3, 2, 1, 1, 0]),
  new Uint8Array([3, 2, 3, 2, 1, 0]),
  new Uint8Array([3, 0, 1, 3, 2, 5, 4]),
  new Uint8Array([7, 6, 5, 4, 3, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
];
/** coded_block_pattern code number -> pattern (Table 9-4, 4:2:0). */
export const INTRA_CBP_FROM_CODE = new Uint8Array([
  47, 31, 15, 0, 23, 27, 29, 30, 7, 11, 13, 14, 39, 43, 45, 46, 16, 3, 5, 10, 12, 19, 21, 26, 28,
  35, 37, 42, 44, 1, 2, 4, 8, 17, 18, 20, 24, 6, 9, 22, 25, 32, 33, 34, 36, 40, 38, 41,
]);
export const INTER_CBP_FROM_CODE = new Uint8Array([
  0, 16, 1, 2, 4, 8, 32, 3, 5, 10, 12, 15, 47, 7, 11, 13, 14, 6, 9, 31, 35, 37, 42, 44, 33, 34, 36,
  40, 39, 43, 45, 46, 17, 18, 20, 24, 19, 21, 26, 28, 23, 27, 29, 30, 22, 25, 38, 41,
]);
