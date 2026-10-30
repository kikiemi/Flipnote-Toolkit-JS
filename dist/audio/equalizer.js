import { check } from '../core/errors.js';
import { floatToPcm } from './pcm.js';
/** Center frequencies of the ten-band graphic equalizer (octave bands). */
export const EQUALIZER_FREQUENCIES = [
    31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
];
/** Gain range of the graphic equalizer in dB. */
export const EQUALIZER_MAX_GAIN = 12;
/**
 * Graphic equalizer gains in dB. `soft` tames the harsh highs of the consoles' nearest-neighbour
 * upsampling.
 */
export const EQUALIZER_PRESETS = {
    flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    bass: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
    treble: [0, 0, 0, 0, 0, 0, 2, 4, 5, 6],
    voice: [-6, -4, -2, 0, 2, 3, 3, 2, 0, -2],
    loudness: [5, 4, 2, 0, -1, -1, 0, 2, 4, 5],
    soft: [0, 0, 0, 0, 0, 0, -1, -3, -6, -9],
};
const DEFAULT_Q = Math.SQRT2;
/** Resolves a setting into filters; gains become peaking filters at EQUALIZER_FREQUENCIES. */
export function createEqualizerBands(setting) {
    if (typeof setting === 'string') {
        check(setting in EQUALIZER_PRESETS, 'INVALID_ARGUMENT', `Unknown equalizer preset ${setting}`);
        return createEqualizerBands(EQUALIZER_PRESETS[setting]);
    }
    if (setting.length === 0 || typeof setting[0] === 'object') {
        return setting.map((band) => ({ ...band }));
    }
    const gains = setting;
    check(gains.length === EQUALIZER_FREQUENCIES.length && gains.every(Number.isFinite), 'INVALID_ARGUMENT', `The graphic equalizer takes ${EQUALIZER_FREQUENCIES.length} gains in dB`);
    return EQUALIZER_FREQUENCIES.map((frequency, index) => ({
        type: 'peaking',
        frequency,
        gain: Math.max(-EQUALIZER_MAX_GAIN, Math.min(EQUALIZER_MAX_GAIN, gains[index])),
        q: DEFAULT_Q,
    }));
}
/** Peaking bandwidth a band is played with. */
export function getEqualizerQ(band) {
    return band.q ?? DEFAULT_Q;
}
/** Normalized biquad coefficients [b0, b1, b2, a1, a2] (Audio EQ Cookbook, as in Web Audio). */
function biquadCoefficients(band, sampleRate) {
    if (band.gain === 0 || band.frequency <= 0 || band.frequency >= sampleRate / 2)
        return null;
    const a = Math.pow(10, band.gain / 40);
    const w0 = (2 * Math.PI * band.frequency) / sampleRate;
    const cos = Math.cos(w0);
    const sin = Math.sin(w0);
    let b;
    let d;
    if (band.type === 'peaking') {
        const alpha = sin / (2 * getEqualizerQ(band));
        b = [1 + alpha * a, -2 * cos, 1 - alpha * a];
        d = [1 + alpha / a, -2 * cos, 1 - alpha / a];
    }
    else {
        // 2·√A·alpha with the slope fixed at 1; s mirrors the low shelf into the high shelf.
        const k = Math.sqrt(2 * a) * sin;
        const s = band.type === 'lowshelf' ? 1 : -1;
        b = [
            a * (a + 1 - s * (a - 1) * cos + k),
            2 * s * a * (a - 1 - s * (a + 1) * cos),
            a * (a + 1 - s * (a - 1) * cos - k),
        ];
        d = [
            a + 1 + s * (a - 1) * cos + k,
            -2 * s * (a - 1 + s * (a + 1) * cos),
            a + 1 + s * (a - 1) * cos - k,
        ];
    }
    return [b[0] / d[0], b[1] / d[0], b[2] / d[0], d[1] / d[0], d[2] / d[0]];
}
/** Filters samples in place through every band in turn. */
export function applyEqualizer(samples, sampleRate, setting) {
    for (const band of createEqualizerBands(setting)) {
        const c = biquadCoefficients(band, sampleRate);
        if (!c)
            continue;
        const [b0, b1, b2, a1, a2] = c;
        let z1 = 0;
        let z2 = 0;
        for (let i = 0; i < samples.length; i++) {
            const x = samples[i];
            const y = b0 * x + z1;
            z1 = b1 * x - a1 * y + z2;
            z2 = b2 * x - a2 * y;
            samples[i] = y;
        }
    }
}
/** Copy of `pcm` passed through the equalizer; boosts that clip are limited to 16 bits. */
export function equalizePcm(pcm, setting) {
    const samples = Float32Array.from(pcm.samples);
    applyEqualizer(samples, pcm.sampleRate, setting);
    return floatToPcm(samples, pcm.sampleRate);
}
