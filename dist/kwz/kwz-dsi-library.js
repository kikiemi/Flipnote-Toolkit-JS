import { toWords } from '../core/bytes.js';
import { isPpmFilename } from '../ppm/ppm-filename.js';
import { isDsiLibraryFsid } from './kwz-filename.js';
import { KwzFrameDecoder } from './kwz-frame-codec.js';
import { KWZ_DSI_LIBRARY_RECT, KWZ_WIDTH } from './kwz-types.js';
const cache = new WeakMap();
const NOWHERE = { x: 0, y: 0, width: 0, height: 0 };
function hasPixelsOutside(pixels, rect) {
    const words = toWords(pixels);
    for (let w = 0; w < words.length; w++) {
        if (words[w] === 0)
            continue;
        for (let p = w * 4; p < w * 4 + 4; p++) {
            if (!pixels[p])
                continue;
            const x = p % KWZ_WIDTH;
            const y = (p / KWZ_WIDTH) | 0;
            if (x < rect.x || x >= rect.x + rect.width || y < rect.y || y >= rect.y + rect.height) {
                return true;
            }
        }
    }
    return false;
}
/** True when nothing is drawn on layer C or outside the centered 256x192 area. */
export function isDsiLibraryLayout(file) {
    const decoder = new KwzFrameDecoder(file, { isTolerant: true });
    for (let i = 0; i < file.frames.length; i++) {
        const [a, b, c] = decoder.decode(i).layers;
        if (hasPixelsOutside(c, NOWHERE))
            return false;
        if (hasPixelsOutside(a, KWZ_DSI_LIBRARY_RECT) || hasPixelsOutside(b, KWZ_DSI_LIBRARY_RECT)) {
            return false;
        }
    }
    return true;
}
/**
 * Detects notes that Nintendo converted from PPM for the DSi Library service.
 * Their audio runs at 16384 Hz and may need a different initial ADPCM step index.
 */
export function isDsiLibraryNote(file) {
    const cached = cache.get(file);
    if (cached !== undefined)
        return cached;
    const { meta } = file;
    let result = false;
    if (file.variant === 'kwz') {
        const names = [meta.rootFilename, meta.parentFilename, meta.currentFilename];
        const ids = [meta.rootAuthorId, meta.parentAuthorId, meta.currentAuthorId];
        if (names.some(isPpmFilename))
            result = true;
        else if (ids.every(isDsiLibraryFsid))
            result = isDsiLibraryLayout(file);
    }
    cache.set(file, result);
    return result;
}
