function coefficients(matrix) {
    return matrix === 'bt709' ? [0.2126, 0.0722] : [0.299, 0.114];
}
/** Limited-range Y, Cb and Cr of every palette entry, indexed by palette index. */
export function paletteToYuv(palette, matrix) {
    const [kr, kb] = coefficients(matrix);
    const y = new Uint8Array(256);
    const u = new Uint8Array(256);
    const v = new Uint8Array(256);
    for (let i = 0; i < palette.length / 4; i++) {
        const r = palette[i * 4] / 255;
        const g = palette[i * 4 + 1] / 255;
        const b = palette[i * 4 + 2] / 255;
        const luma = kr * r + (1 - kr - kb) * g + kb * b;
        y[i] = Math.round(16 + 219 * luma);
        u[i] = Math.round(128 + (224 * (b - luma)) / (2 * (1 - kb)));
        v[i] = Math.round(128 + (224 * (r - luma)) / (2 * (1 - kr)));
    }
    return [y, u, v];
}
/** Fills a padded 4:2:0 frame from palette indices, repeating edge pixels into the padding. */
export function indicesToYuv(pixels, width, height, encoder, tables, frame) {
    const [ty, tu, tv] = tables;
    const stride = encoder.paddedWidth;
    const columns = new Int32Array(stride);
    for (let x = 0; x < stride; x++)
        columns[x] = Math.min(width - 1, x);
    const row = (y) => Math.min(height - 1, y) * width;
    for (let y = 0; y < encoder.paddedHeight; y++) {
        const source = row(y);
        const out = y * stride;
        for (let x = 0; x < stride; x++)
            frame.y[out + x] = ty[pixels[source + columns[x]]];
    }
    const chromaStride = stride / 2;
    for (let y = 0; y < encoder.paddedHeight / 2; y++) {
        const r0 = row(y * 2);
        const r1 = row(y * 2 + 1);
        const out = y * chromaStride;
        for (let x = 0; x < chromaStride; x++) {
            const x0 = columns[x * 2];
            const x1 = columns[x * 2 + 1];
            const a = pixels[r0 + x0];
            const b = pixels[r0 + x1];
            const c = pixels[r1 + x0];
            const d = pixels[r1 + x1];
            frame.u[out + x] = (tu[a] + tu[b] + tu[c] + tu[d] + 2) >> 2;
            frame.v[out + x] = (tv[a] + tv[b] + tv[c] + tv[d] + 2) >> 2;
        }
    }
}
/** Converts 8-bit planar or semi-planar YUV to RGBA. */
export function yuvToRgba(planes) {
    const { width, height, data, layout, format } = planes;
    const [kr, kb] = coefficients(planes.matrix);
    const kg = 1 - kr - kb;
    const scaleY = planes.isFullRange ? 1 : 255 / 219;
    const scaleC = planes.isFullRange ? 1 : 255 / 224;
    const offsetY = planes.isFullRange ? 0 : 16;
    const out = new Uint8Array(width * height * 4);
    const shiftX = format === 'I444' ? 0 : 1;
    const shiftY = format === 'I420' || format === 'NV12' ? 1 : 0;
    const clamp = (value) => (value < 0 ? 0 : value > 255 ? 255 : Math.round(value));
    for (let y = 0; y < height; y++) {
        const yRow = layout[0].offset + y * layout[0].stride;
        const cy = y >> shiftY;
        for (let x = 0; x < width; x++) {
            const cx = x >> shiftX;
            let cb;
            let cr;
            if (format === 'NV12') {
                const p = layout[1].offset + cy * layout[1].stride + cx * 2;
                cb = data[p];
                cr = data[p + 1];
            }
            else {
                cb = data[layout[1].offset + cy * layout[1].stride + cx];
                cr = data[layout[2].offset + cy * layout[2].stride + cx];
            }
            const luma = (data[yRow + x] - offsetY) * scaleY;
            const pb = (cb - 128) * scaleC;
            const pr = (cr - 128) * scaleC;
            const o = (y * width + x) * 4;
            out[o] = clamp(luma + 2 * (1 - kr) * pr);
            out[o + 1] = clamp(luma - ((2 * (1 - kb) * kb) / kg) * pb - ((2 * (1 - kr) * kr) / kg) * pr);
            out[o + 2] = clamp(luma + 2 * (1 - kb) * pb);
            out[o + 3] = 255;
        }
    }
    return { width, height, data: out };
}
