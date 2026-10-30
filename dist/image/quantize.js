const BAYER_4X4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((value) => (value + 0.5) / 16 - 0.5);
/** Perceptual ("redmean") squared distance between two RGB colors. */
function colorDistance(r1, g1, b1, r2, g2, b2) {
    const mean = (r1 + r2) / 2;
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    return (2 + mean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - mean) / 256) * db * db;
}
export function nearestColor(palette, allowed, r, g, b) {
    let best = allowed[0];
    let bestDistance = Infinity;
    for (const index of allowed) {
        const distance = colorDistance(r, g, b, palette[index * 4], palette[index * 4 + 1], palette[index * 4 + 2]);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = index;
        }
    }
    return best;
}
/** Maps RGBA pixels to the `allowed` palette entries, optionally dithered. */
export function quantizeImage(image, palette, allowed, options = {}) {
    const { width, height, data } = image;
    const out = new Uint8Array(width * height);
    const dither = options.dither ?? 'none';
    const transparent = options.transparentIndex ?? nearestColor(palette, allowed, 255, 255, 255);
    const cache = new Map();
    const lookup = (r, g, b) => {
        const key = (r << 16) | (g << 8) | b;
        let index = cache.get(key);
        if (index === undefined) {
            index = nearestColor(palette, allowed, r, g, b);
            if (cache.size < 1 << 16)
                cache.set(key, index);
        }
        return index;
    };
    const clamp = (value) => (value < 0 ? 0 : value > 255 ? 255 : Math.round(value));
    const errors = dither === 'diffusion'
        ? [new Float32Array((width + 2) * 3), new Float32Array((width + 2) * 3)]
        : null;
    for (let y = 0; y < height; y++) {
        if (errors) {
            [errors[0], errors[1]] = [errors[1], errors[0]];
            errors[1].fill(0);
        }
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            if (data[i * 4 + 3] < 128) {
                out[i] = transparent;
                continue;
            }
            let r = data[i * 4];
            let g = data[i * 4 + 1];
            let b = data[i * 4 + 2];
            if (dither === 'ordered') {
                const offset = BAYER_4X4[(y & 3) * 4 + (x & 3)] * 96;
                r = clamp(r + offset);
                g = clamp(g + offset);
                b = clamp(b + offset);
            }
            else if (errors) {
                const e = (x + 1) * 3;
                r = clamp(r + errors[0][e]);
                g = clamp(g + errors[0][e + 1]);
                b = clamp(b + errors[0][e + 2]);
            }
            const index = dither === 'none' ? lookup(r, g, b) : nearestColor(palette, allowed, r, g, b);
            out[i] = index;
            if (errors) {
                const residual = [
                    r - palette[index * 4],
                    g - palette[index * 4 + 1],
                    b - palette[index * 4 + 2],
                ];
                for (let c = 0; c < 3; c++) {
                    const value = residual[c];
                    errors[0][(x + 2) * 3 + c] += (value * 7) / 16;
                    errors[1][x * 3 + c] += (value * 3) / 16;
                    errors[1][(x + 1) * 3 + c] += (value * 5) / 16;
                    errors[1][(x + 2) * 3 + c] += value / 16;
                }
            }
        }
    }
    return out;
}
