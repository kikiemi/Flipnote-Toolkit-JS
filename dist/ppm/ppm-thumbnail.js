import { check } from '../core/errors.js';
import { PPM_HEIGHT, PPM_THUMBNAIL_HEIGHT, PPM_THUMBNAIL_PALETTE, PPM_THUMBNAIL_SIZE, PPM_THUMBNAIL_WIDTH, PPM_WIDTH, } from './ppm-types.js';
/** Unpacks the 4-bit 8x8-tiled thumbnail into 64x48 palette indices. */
export function decodePpmThumbnail(raw) {
    check(raw.length >= PPM_THUMBNAIL_SIZE, 'CORRUPT_DATA', 'PPM thumbnail is truncated');
    const pixels = new Uint8Array(PPM_THUMBNAIL_WIDTH * PPM_THUMBNAIL_HEIGHT);
    let p = 0;
    for (let tileY = 0; tileY < PPM_THUMBNAIL_HEIGHT; tileY += 8) {
        for (let tileX = 0; tileX < PPM_THUMBNAIL_WIDTH; tileX += 8) {
            for (let line = 0; line < 8; line++) {
                const row = (tileY + line) * PPM_THUMBNAIL_WIDTH + tileX;
                for (let x = 0; x < 8; x += 2) {
                    pixels[row + x] = raw[p] & 15;
                    pixels[row + x + 1] = raw[p++] >> 4;
                }
            }
        }
    }
    return {
        width: PPM_THUMBNAIL_WIDTH,
        height: PPM_THUMBNAIL_HEIGHT,
        pixels,
        palette: PPM_THUMBNAIL_PALETTE,
    };
}
export function encodePpmThumbnail(pixels) {
    check(pixels.length === PPM_THUMBNAIL_WIDTH * PPM_THUMBNAIL_HEIGHT, 'INVALID_ARGUMENT', 'PPM thumbnails are 64x48');
    const raw = new Uint8Array(PPM_THUMBNAIL_SIZE);
    let p = 0;
    for (let tileY = 0; tileY < PPM_THUMBNAIL_HEIGHT; tileY += 8) {
        for (let tileX = 0; tileX < PPM_THUMBNAIL_WIDTH; tileX += 8) {
            for (let line = 0; line < 8; line++) {
                const row = (tileY + line) * PPM_THUMBNAIL_WIDTH + tileX;
                for (let x = 0; x < 8; x += 2) {
                    raw[p++] = (pixels[row + x] & 15) | ((pixels[row + x + 1] & 15) << 4);
                }
            }
        }
    }
    return raw;
}
/**
 * Picks a thumbnail color from rounded 2x2 coverage sums of black (k), red (r) and blue (b),
 * a model fitted to thumbnails written by Flipnote Studio (about 99% identical pixels).
 */
function thumbnailColor(k, r, b) {
    if (r && b) {
        if (r === 1)
            return 2;
        b = 0;
    }
    if (!k && !r && !b)
        return 2;
    if (k >= 6)
        return 1;
    if (!r && !b)
        return k >= 5 ? 1 : 3;
    const amount = r || b;
    const [light, full, dark] = r ? [6, 4, 5] : [10, 8, 9];
    if (k >= 4)
        return amount >= 4 ? dark : k >= 5 ? 1 : amount >= 2 ? (r ? 1 : dark) : 3;
    return amount >= 5 ? full : light;
}
/** Builds a raw thumbnail from a composited frame in PPM palette indices. */
export function createPpmThumbnail(pixels) {
    check(pixels.length === PPM_WIDTH * PPM_HEIGHT, 'INVALID_ARGUMENT', 'Expected a 256x192 frame');
    const out = new Uint8Array(PPM_THUMBNAIL_WIDTH * PPM_THUMBNAIL_HEIGHT);
    for (let ty = 0; ty < PPM_THUMBNAIL_HEIGHT; ty++) {
        for (let tx = 0; tx < PPM_THUMBNAIL_WIDTH; tx++) {
            let k = 0;
            let r = 0;
            let b = 0;
            for (let block = 0; block < 4; block++) {
                const origin = (ty * 4 + (block >> 1) * 2) * PPM_WIDTH + tx * 4 + (block & 1) * 2;
                const counts = [0, 0, 0, 0];
                counts[pixels[origin]]++;
                counts[pixels[origin + 1]]++;
                counts[pixels[origin + PPM_WIDTH]]++;
                counts[pixels[origin + PPM_WIDTH + 1]]++;
                k += (counts[0] + 1) >> 1;
                r += (counts[2] + 1) >> 1;
                b += (counts[3] + 1) >> 1;
            }
            out[ty * PPM_THUMBNAIL_WIDTH + tx] = thumbnailColor(k, r, b);
        }
    }
    return encodePpmThumbnail(out);
}
