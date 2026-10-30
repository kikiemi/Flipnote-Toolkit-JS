import { check } from '../core/errors.ts';
import {
  KWZ_COLOR_BLACK,
  KWZ_COLOR_NONE,
  KWZ_COLOR_WHITE,
  type KwzFrameInfo,
} from '../kwz/kwz-types.ts';
import type { PpmFrameInfo } from '../ppm/ppm-types.ts';

/**
 * How ink reacts to a new paper color: `keep` leaves every ink color as it is, except ink that
 * would vanish into the new paper, which takes the old paper color; `invert` swaps black and
 * white ink, the way PPM's inverse pen follows the paper.
 */
export type PaperInkMode = 'keep' | 'invert';

function swapBlackWhite(color: number): number {
  if (color === KWZ_COLOR_BLACK) return KWZ_COLOR_WHITE;
  if (color === KWZ_COLOR_WHITE) return KWZ_COLOR_BLACK;
  return color;
}

/**
 * Per-frame values for a new paper color. PPM paper is 0 (black) or 1 (white) and its inverse
 * pen always follows the paper, as on the DSi; KWZ paper is a color index 0-6.
 */
export function changePaper<T extends PpmFrameInfo | KwzFrameInfo>(
  info: T,
  paper: number,
  mode: PaperInkMode = 'keep',
): T {
  if ('pens' in info) {
    check(paper === 0 || paper === 1, 'INVALID_ARGUMENT', 'PPM paper is 0 (black) or 1 (white)');
    return { ...info, paper, pens: [info.pens[0], info.pens[1]] };
  }
  check(
    Number.isInteger(paper) && paper >= 0 && paper <= KWZ_COLOR_NONE,
    'INVALID_ARGUMENT',
    'KWZ paper is a color index from 0 to 6',
  );
  const previous = info.paper;
  const colors = info.colors.map((color) => {
    const next = mode === 'invert' ? swapBlackWhite(color) : color;
    return next === paper && paper !== KWZ_COLOR_NONE ? previous : next;
  }) as KwzFrameInfo['colors'];
  return { ...info, paper, colors };
}
