import { fail } from '../core/errors.js';
import { getKwzSampleRate } from '../kwz/kwz-audio.js';
import { isKwz, readKwz } from '../kwz/kwz-reader.js';
import { KWZ_APP_PALETTE, KWZ_FRAME_RATES, KWZ_HEIGHT, KWZ_PALETTE, KWZ_WIDTH, } from '../kwz/kwz-types.js';
import { writeKwz } from '../kwz/kwz-writer.js';
import { formatPpmStorageFilename } from '../ppm/ppm-filename.js';
import { isPpm, readPpm } from '../ppm/ppm-reader.js';
import { PPM_FRAME_RATES, PPM_HEIGHT, PPM_PALETTE, PPM_SAMPLE_RATE, PPM_WIDTH, } from '../ppm/ppm-types.js';
import { writePpm } from '../ppm/ppm-writer.js';
export function detectFormat(bytes) {
    if (isPpm(bytes))
        return 'ppm';
    if (isKwz(bytes))
        return 'kwz';
    return null;
}
/** Reads a PPM note or a KWZ note, KWC comment or folder icon, detected by its magic bytes. */
export function readNote(bytes) {
    const format = detectFormat(bytes);
    if (format === 'ppm')
        return readPpm(bytes);
    if (format === 'kwz')
        return readKwz(bytes);
    return fail('INVALID_FORMAT', 'Unknown file format (expected PPM or KWZ)');
}
export function writeNote(note, options = {}) {
    return note.format === 'ppm' ? writePpm(note, options) : writeKwz(note, options);
}
export function getFrameCount(note) {
    return note.format === 'ppm' ? note.animation.offsets.length : note.frames.length;
}
export function getVariant(note) {
    return note.format === 'ppm' ? 'ppm' : note.variant;
}
/** Name the console stores the note under on the SD card. */
export function getStorageFilename(note) {
    if (note.format === 'ppm')
        return formatPpmStorageFilename(note.meta.currentFilename);
    return note.variant === 'icon' ? '!.ico' : `${note.meta.currentFilename}.${note.variant}`;
}
export function getFrameRates(format) {
    return format === 'ppm' ? PPM_FRAME_RATES : KWZ_FRAME_RATES;
}
/** Palette for rendered frames; KWZ notes can use the screen colors or the app's own. */
export function getPalette(note, palette = 'screen') {
    if ((typeof note === 'string' ? note : note.format) === 'ppm')
        return PPM_PALETTE;
    return palette === 'app' ? KWZ_APP_PALETTE : KWZ_PALETTE;
}
export function getNoteInfo(note) {
    const isPpmNote = note.format === 'ppm';
    const rates = getFrameRates(note.format);
    const frameRate = rates[note.meta.frameSpeed] ?? rates[rates.length - 1];
    const frameCount = getFrameCount(note);
    return {
        format: note.format,
        variant: getVariant(note),
        width: isPpmNote ? PPM_WIDTH : KWZ_WIDTH,
        height: isPpmNote ? PPM_HEIGHT : KWZ_HEIGHT,
        layerCount: isPpmNote ? 2 : 3,
        frameCount,
        frameRate,
        bgmFrameRate: rates[note.meta.bgmSpeed] ?? frameRate,
        duration: frameCount / frameRate,
        sampleRate: isPpmNote ? PPM_SAMPLE_RATE : getKwzSampleRate(note),
        palette: isPpmNote ? PPM_PALETTE : KWZ_PALETTE,
    };
}
