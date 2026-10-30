import { check } from '../core/errors.js';
const SINC_HALF_TAPS = 16;
const SINC_PHASES = 256;
function clampSample(value) {
    return value < -32768 ? -32768 : value > 32767 ? 32767 : Math.round(value);
}
function createSincTable(cutoff, half) {
    const width = half * 2;
    const table = new Float32Array((SINC_PHASES + 1) * width);
    for (let phase = 0; phase <= SINC_PHASES; phase++) {
        const frac = phase / SINC_PHASES;
        let sum = 0;
        for (let j = 0; j < width; j++) {
            const t = frac + half - 1 - j;
            const x = Math.PI * cutoff * t;
            const sinc = t === 0 ? 1 : Math.sin(x) / x;
            const w = t / half;
            const window = Math.abs(w) >= 1
                ? 0
                : 0.42 + 0.5 * Math.cos(Math.PI * w) + 0.08 * Math.cos(2 * Math.PI * w);
            const value = sinc * window;
            table[phase * width + j] = value;
            sum += value;
        }
        for (let j = 0; j < width; j++)
            table[phase * width + j] /= sum;
    }
    return table;
}
/** Converts `pcm` to `sampleRate`; `sinc` band-limits, `linear` and `nearest` are cheap. */
export function resamplePcm(pcm, sampleRate, method = 'sinc') {
    check(sampleRate > 0 && pcm.sampleRate > 0, 'INVALID_ARGUMENT', 'Sample rates must be positive');
    const source = pcm.samples;
    if (sampleRate === pcm.sampleRate)
        return { samples: source.slice(), sampleRate };
    const step = pcm.sampleRate / sampleRate;
    const length = Math.round((source.length * sampleRate) / pcm.sampleRate);
    const out = new Int16Array(length);
    const last = source.length - 1;
    if (last < 0)
        return { samples: out, sampleRate };
    if (method === 'nearest') {
        for (let i = 0; i < length; i++)
            out[i] = source[Math.min(last, Math.floor(i * step))];
    }
    else if (method === 'linear') {
        for (let i = 0; i < length; i++) {
            const x = i * step;
            const k = Math.floor(x);
            const f = x - k;
            const a = source[Math.min(last, k)];
            const b = source[Math.min(last, k + 1)];
            out[i] = clampSample(a + (b - a) * f);
        }
    }
    else {
        const scale = Math.min(1, 1 / step);
        const half = Math.ceil(SINC_HALF_TAPS / scale);
        const width = half * 2;
        const table = createSincTable(scale * 0.97, half);
        for (let i = 0; i < length; i++) {
            const x = i * step;
            const base = Math.floor(x);
            const row = Math.round((x - base) * SINC_PHASES) * width;
            const first = base - half + 1;
            let sum = 0;
            if (first >= 0 && first + width <= source.length) {
                for (let j = 0; j < width; j++)
                    sum += source[first + j] * table[row + j];
            }
            else {
                for (let j = 0; j < width; j++) {
                    const k = first + j;
                    if (k >= 0 && k <= last)
                        sum += source[k] * table[row + j];
                }
            }
            out[i] = clampSample(sum);
        }
    }
    return { samples: out, sampleRate };
}
/** Accumulates `source` into `target` starting at `offset` samples. */
export function mixInto(target, source, offset, gain = 1) {
    const start = Math.max(0, offset);
    const end = Math.min(target.length, offset + source.length);
    for (let i = start; i < end; i++)
        target[i] += source[i - offset] * gain;
}
export function floatToPcm(buffer, sampleRate) {
    const samples = new Int16Array(buffer.length);
    for (let i = 0; i < buffer.length; i++)
        samples[i] = clampSample(buffer[i]);
    return { samples, sampleRate };
}
export function measurePcm(samples) {
    let peak = 0;
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
        const value = samples[i];
        const magnitude = value < 0 ? -value : value;
        if (magnitude > peak)
            peak = magnitude;
        sum += value * value;
    }
    return { peak, rms: samples.length ? Math.sqrt(sum / samples.length) : 0 };
}
/** Mixes planar float channels (-1 to 1) down to mono 16-bit PCM. */
export function downmixToPcm(channels, sampleRate) {
    const length = channels.length ? channels[0].length : 0;
    const samples = new Int16Array(length);
    const gain = 32767 / Math.max(1, channels.length);
    for (let i = 0; i < length; i++) {
        let sum = 0;
        for (const channel of channels)
            sum += channel[i];
        samples[i] = clampSample(sum * gain);
    }
    return { samples, sampleRate };
}
/** Copies `pcm`, cut to at most `seconds`. */
export function trimPcm(pcm, seconds) {
    const length = Math.min(pcm.samples.length, Math.round(seconds * pcm.sampleRate));
    return { samples: pcm.samples.slice(0, length), sampleRate: pcm.sampleRate };
}
