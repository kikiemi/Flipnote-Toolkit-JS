import { MsbBitWriter } from '../core/bit-writer.js';
import { check } from '../core/errors.js';
import { SCALEFACTOR_CODES, SCALEFACTOR_LENGTHS, SPECTRAL_CODES, SPECTRAL_LENGTHS, SWB_OFFSETS, } from './aac-tables.js';
export const AAC_SAMPLE_RATES = [
    96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000,
];
const FRAME = 1024;
const MAX_FRAME_BITS = 6144;
const SF_OFFSET = 100;
const ESCAPE_BOOK = 11;
const BOOK_LIMITS = [0, 1, 1, 2, 2, 4, 4, 7, 7, 12, 12, 16];
const BOOK_DIMENSION = [0, 4, 4, 4, 4, 2, 2, 2, 2, 2, 2, 2];
const BOOK_SIGNED = [
    false,
    true,
    true,
    false,
    false,
    true,
    true,
    false,
    false,
    false,
    false,
    false,
];
const WINDOW = new Float64Array(2 * FRAME);
for (let n = 0; n < 2 * FRAME; n++)
    WINDOW[n] = Math.sin((Math.PI * (n + 0.5)) / (2 * FRAME));
/** In-place radix-2 complex FFT of size `re.length`. */
function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1)
            j ^= bit;
        j ^= bit;
        if (i < j) {
            [re[i], re[j]] = [re[j], re[i]];
            [im[i], im[j]] = [im[j], im[i]];
        }
    }
    for (let size = 2; size <= n; size <<= 1) {
        const angle = (-2 * Math.PI) / size;
        const wr = Math.cos(angle);
        const wi = Math.sin(angle);
        for (let start = 0; start < n; start += size) {
            let cr = 1;
            let ci = 0;
            for (let k = 0; k < size / 2; k++) {
                const a = start + k;
                const b = a + size / 2;
                const tr = re[b] * cr - im[b] * ci;
                const ti = re[b] * ci + im[b] * cr;
                re[b] = re[a] - tr;
                im[b] = im[a] - ti;
                re[a] += tr;
                im[a] += ti;
                const next = cr * wr - ci * wi;
                ci = cr * wi + ci * wr;
                cr = next;
            }
        }
    }
}
/** AAC forward MDCT of 2048 windowed samples into 1024 coefficients (spec scaling, factor 2). */
function forwardMdct(input, out) {
    const m = FRAME;
    const half = m / 2;
    const folded = new Float64Array(m);
    for (let n = 0; n < half; n++) {
        folded[n] = -input[(3 * m) / 2 - 1 - n] - input[(3 * m) / 2 + n];
        folded[half + n] = input[n] - input[m - 1 - n];
    }
    const re = new Float64Array(half);
    const im = new Float64Array(half);
    for (let n = 0; n < half; n++) {
        const angle = (-Math.PI * n) / m;
        const a = folded[2 * n];
        const b = folded[m - 1 - 2 * n];
        re[n] = a * Math.cos(angle) - b * Math.sin(angle);
        im[n] = a * Math.sin(angle) + b * Math.cos(angle);
    }
    fft(re, im);
    for (let k = 0; k < half; k++) {
        const angle = (-Math.PI * (k + 0.25)) / m;
        const yr = re[k] * Math.cos(angle) - im[k] * Math.sin(angle);
        const yi = re[k] * Math.sin(angle) + im[k] * Math.cos(angle);
        out[2 * k] = 2 * yr;
        out[m - 1 - 2 * k] = -2 * yi;
    }
}
function codebookIndex(book, values, offset) {
    if (book <= 2) {
        return ((values[offset] + 1) * 27 +
            (values[offset + 1] + 1) * 9 +
            (values[offset + 2] + 1) * 3 +
            values[offset + 3] +
            1);
    }
    if (book <= 4) {
        return (Math.abs(values[offset]) * 27 +
            Math.abs(values[offset + 1]) * 9 +
            Math.abs(values[offset + 2]) * 3 +
            Math.abs(values[offset + 3]));
    }
    if (book <= 6)
        return (values[offset] + 4) * 9 + values[offset + 1] + 4;
    const a = Math.min(16, Math.abs(values[offset]));
    const b = Math.min(16, Math.abs(values[offset + 1]));
    return book <= 8 ? a * 8 + b : book <= 10 ? a * 13 + b : a * 17 + b;
}
function escapeBits(value) {
    const magnitude = Math.abs(value);
    if (magnitude < 16)
        return 0;
    const n = 31 - Math.clz32(magnitude) - 4;
    return 2 * n + 5;
}
/** Bits needed to code `values[start..end)` with `book`. */
function bandBits(book, values, start, end) {
    const dimension = BOOK_DIMENSION[book];
    const lengths = SPECTRAL_LENGTHS[book];
    let bits = 0;
    for (let i = start; i < end; i += dimension) {
        bits += lengths[codebookIndex(book, values, i)];
        if (!BOOK_SIGNED[book])
            for (let k = 0; k < dimension; k++)
                if (values[i + k] !== 0)
                    bits++;
        if (book === ESCAPE_BOOK)
            bits += escapeBits(values[i]) + escapeBits(values[i + 1]);
    }
    return bits;
}
function writeBand(writer, book, values, start, end) {
    const dimension = BOOK_DIMENSION[book];
    for (let i = start; i < end; i += dimension) {
        const index = codebookIndex(book, values, i);
        writer.writeBits(SPECTRAL_CODES[book][index], SPECTRAL_LENGTHS[book][index]);
        if (!BOOK_SIGNED[book]) {
            for (let k = 0; k < dimension; k++) {
                if (values[i + k] !== 0)
                    writer.writeBits(values[i + k] < 0 ? 1 : 0, 1);
            }
        }
        if (book !== ESCAPE_BOOK)
            continue;
        for (let k = 0; k < 2; k++) {
            const magnitude = Math.abs(values[i + k]);
            if (magnitude < 16)
                continue;
            const n = 31 - Math.clz32(magnitude) - 4;
            writer.writeBits((1 << (n + 1)) - 2, n + 1);
            writer.writeBits(magnitude - (1 << (n + 4)), n + 4);
        }
    }
}
/** Picks the cheapest codebook per band and counts the whole frame. */
function planBands(values, offsets) {
    const bandCount = offsets.length - 1;
    const books = new Uint8Array(bandCount);
    let maxBand = 0;
    let bits = 0;
    for (let band = 0; band < bandCount; band++) {
        let peak = 0;
        for (let i = offsets[band]; i < offsets[band + 1]; i++) {
            peak = Math.max(peak, Math.abs(values[i]));
        }
        if (peak === 0)
            continue;
        maxBand = band + 1;
        let best = ESCAPE_BOOK;
        let bestBits = Infinity;
        for (let book = 1; book <= ESCAPE_BOOK; book++) {
            if (BOOK_LIMITS[book] < peak && book !== ESCAPE_BOOK)
                continue;
            const cost = bandBits(book, values, offsets[band], offsets[band + 1]);
            if (cost < bestBits) {
                bestBits = cost;
                best = book;
            }
        }
        books[band] = best;
        bits += bestBits + 1;
    }
    let sections = 0;
    for (let band = 0; band < maxBand; band++) {
        if (band === 0 || books[band] !== books[band - 1])
            sections++;
    }
    bits += sections * 9 + 3 + 4 + 8 + 9 + 3 + 3 + 8;
    return { maxBand, books, bits };
}
function quantizeSpectrum(spectrum, gain, out, end) {
    const scale = 2 ** (-(gain - SF_OFFSET) / 4);
    let isValid = true;
    for (let i = 0; i < FRAME; i++) {
        if (i >= end) {
            out[i] = 0;
            continue;
        }
        const magnitude = Math.floor((Math.abs(spectrum[i]) * scale) ** 0.75 + 0.4054);
        if (magnitude > 8191)
            isValid = false;
        out[i] = spectrum[i] < 0 ? -magnitude : magnitude;
    }
    return isValid;
}
function writeFrame(values, gain, plan, offsets) {
    const writer = new MsbBitWriter();
    writer.writeBits(0, 3);
    writer.writeBits(0, 4);
    writer.writeBits(gain, 8);
    writer.writeBits(0, 1);
    writer.writeBits(0, 2);
    writer.writeBits(0, 1);
    writer.writeBits(plan.maxBand, 6);
    writer.writeBits(0, 1);
    for (let band = 0; band < plan.maxBand;) {
        const book = plan.books[band];
        let length = 1;
        while (band + length < plan.maxBand && plan.books[band + length] === book)
            length++;
        writer.writeBits(book, 4);
        let remaining = length;
        while (remaining >= 31) {
            writer.writeBits(31, 5);
            remaining -= 31;
        }
        writer.writeBits(remaining, 5);
        band += length;
    }
    for (let band = 0; band < plan.maxBand; band++) {
        if (plan.books[band])
            writer.writeBits(SCALEFACTOR_CODES[60], SCALEFACTOR_LENGTHS[60]);
    }
    writer.writeBits(0, 3);
    for (let band = 0; band < plan.maxBand; band++) {
        if (plan.books[band]) {
            writeBand(writer, plan.books[band], values, offsets[band], offsets[band + 1]);
        }
    }
    writer.writeBits(7, 3);
    writer.alignWith(0);
    return writer.toBytes();
}
/** AudioSpecificConfig for AAC-LC mono. */
function createAacConfig(sampleRate) {
    const index = AAC_SAMPLE_RATES.indexOf(sampleRate);
    check(index >= 0, 'INVALID_ARGUMENT', `AAC does not support ${sampleRate} Hz`);
    return new Uint8Array([(2 << 3) | (index >> 1), ((index & 1) << 7) | (1 << 3)]);
}
/** Encodes mono PCM as AAC-LC with long windows and per-frame rate control. */
export function encodeAac(pcm, options = {}) {
    const sampleRate = pcm.sampleRate;
    const offsets = SWB_OFFSETS[sampleRate];
    check(offsets, 'INVALID_ARGUMENT', `AAC does not support ${sampleRate} Hz`);
    const bitrate = options.bitrate ?? 96000;
    const budget = Math.min(MAX_FRAME_BITS - 64, Math.floor((bitrate * FRAME) / sampleRate));
    const input = pcm.samples;
    const frameCount = Math.ceil(input.length / FRAME) + 1;
    const block = new Float64Array(2 * FRAME);
    const spectrum = new Float64Array(FRAME);
    const values = new Int32Array(FRAME);
    const frames = [];
    const cutoff = offsets[offsets.length - 1];
    let reservoir = 0;
    for (let frame = 0; frame < frameCount; frame++) {
        const start = (frame - 1) * FRAME;
        for (let n = 0; n < 2 * FRAME; n++) {
            const index = start + n;
            block[n] = index >= 0 && index < input.length ? input[index] * WINDOW[n] : 0;
        }
        forwardMdct(block, spectrum);
        const limit = Math.min(MAX_FRAME_BITS - 64, budget + reservoir);
        let low = 0;
        let high = 255;
        while (low < high) {
            const gain = (low + high) >> 1;
            if (quantizeSpectrum(spectrum, gain, values, cutoff) &&
                planBands(values, offsets).bits <= limit) {
                high = gain;
            }
            else {
                low = gain + 1;
            }
        }
        quantizeSpectrum(spectrum, low, values, cutoff);
        const plan = planBands(values, offsets);
        const data = writeFrame(values, plan.maxBand ? low : 0, plan, offsets);
        reservoir = Math.max(0, Math.min(MAX_FRAME_BITS - budget, reservoir + budget - data.length * 8));
        frames.push(data);
    }
    return { sampleRate, config: createAacConfig(sampleRate), frames, priming: FRAME };
}
