import { check } from '../core/errors.js';
import { KWZ_COLOR_BLACK, KWZ_COLOR_NONE, KWZ_COLOR_WHITE, } from '../kwz/kwz-types.js';
function swapBlackWhite(color) {
    if (color === KWZ_COLOR_BLACK)
        return KWZ_COLOR_WHITE;
    if (color === KWZ_COLOR_WHITE)
        return KWZ_COLOR_BLACK;
    return color;
}
/**
 * Per-frame values for a new paper color. PPM paper is 0 (black) or 1 (white) and its inverse
 * pen always follows the paper, as on the DSi; KWZ paper is a color index 0-6.
 */
export function changePaper(info, paper, mode = 'keep') {
    if ('pens' in info) {
        check(paper === 0 || paper === 1, 'INVALID_ARGUMENT', 'PPM paper is 0 (black) or 1 (white)');
        return { ...info, paper, pens: [info.pens[0], info.pens[1]] };
    }
    check(Number.isInteger(paper) && paper >= 0 && paper <= KWZ_COLOR_NONE, 'INVALID_ARGUMENT', 'KWZ paper is a color index from 0 to 6');
    const previous = info.paper;
    const colors = info.colors.map((color) => {
        const next = mode === 'invert' ? swapBlackWhite(color) : color;
        return next === paper && paper !== KWZ_COLOR_NONE ? previous : next;
    });
    return { ...info, paper, colors };
}
