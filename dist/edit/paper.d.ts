import { type KwzFrameInfo } from '../kwz/kwz-types.ts';
import type { PpmFrameInfo } from '../ppm/ppm-types.ts';
/**
 * How ink reacts to a new paper color: `keep` leaves every ink color as it is, except ink that
 * would vanish into the new paper, which takes the old paper color; `invert` swaps black and
 * white ink, the way PPM's inverse pen follows the paper.
 */
export type PaperInkMode = 'keep' | 'invert';
/**
 * Per-frame values for a new paper color. PPM paper is 0 (black) or 1 (white) and its inverse
 * pen always follows the paper, as on the DSi; KWZ paper is a color index 0-6.
 */
export declare function changePaper<T extends PpmFrameInfo | KwzFrameInfo>(info: T, paper: number, mode?: PaperInkMode): T;
