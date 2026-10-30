import { decodeKwzAdpcm, encodeKwzAdpcm, KWZ_ADPCM_STEP_INDEX } from '../audio/adpcm.js';
import { measurePcm, resamplePcm } from '../audio/pcm.js';
import { isDsiLibraryNote } from './kwz-dsi-library.js';
import { KWZ_DSI_LIBRARY_SAMPLE_RATE, KWZ_MAX_BGM_SECONDS, KWZ_MAX_SE_SECONDS, KWZ_SAMPLE_RATE, } from './kwz-types.js';
const estimates = new WeakMap();
export function hasKwzTrack(file, track) {
    return !!file.tracks && file.tracks[track].length > 0;
}
/** Native sample rate: 16364 Hz, or 16384 Hz for DSi Library conversions. */
export function getKwzSampleRate(file) {
    return isDsiLibraryNote(file) ? KWZ_DSI_LIBRARY_SAMPLE_RATE : KWZ_SAMPLE_RATE;
}
function rmsOf(data, state) {
    return measurePcm(decodeKwzAdpcm(data, state.stepIndex, state.predictor)).rms;
}
/**
 * Estimates the decoder state a track was encoded from. DSi Library conversions start from an
 * arbitrary state, which sounds distorted when decoded from the usual one: the step index (0-40)
 * giving the quietest signal is chosen, then the predictor that removes the DC offset.
 */
export function guessKwzAdpcmState(data) {
    const cached = estimates.get(data);
    if (cached)
        return cached;
    let best = { stepIndex: KWZ_ADPCM_STEP_INDEX, predictor: 0 };
    let bestRms = Infinity;
    for (let stepIndex = 0; stepIndex <= KWZ_ADPCM_STEP_INDEX; stepIndex++) {
        const rms = rmsOf(data, { stepIndex, predictor: 0 });
        if (rms < bestRms) {
            bestRms = rms;
            best = { stepIndex, predictor: 0 };
        }
    }
    const samples = decodeKwzAdpcm(data, best.stepIndex);
    let sum = 0;
    for (let i = 0; i < samples.length; i++)
        sum += samples[i];
    const offset = samples.length ? Math.round(sum / samples.length / 16) : 0;
    const shifted = {
        stepIndex: best.stepIndex,
        predictor: Math.max(-2048, Math.min(2047, -offset)),
    };
    if (offset !== 0 && rmsOf(data, shifted) < bestRms)
        best = shifted;
    estimates.set(data, best);
    return best;
}
/** Decodes a track at its native rate; DSi Library notes estimate their step index by default. */
export function decodeKwzTrack(file, track, options = {}) {
    const data = file.tracks ? file.tracks[track] : new Uint8Array(0);
    const stepOption = options.initialStepIndex ?? (isDsiLibraryNote(file) ? 'auto' : KWZ_ADPCM_STEP_INDEX);
    const predictorOption = options.initialPredictor ?? 0;
    const estimate = stepOption === 'auto' || predictorOption === 'auto' ? guessKwzAdpcmState(data) : null;
    const stepIndex = stepOption === 'auto' ? estimate.stepIndex : stepOption;
    const predictor = predictorOption === 'auto' ? estimate.predictor : predictorOption;
    return {
        samples: decodeKwzAdpcm(data, stepIndex, predictor),
        sampleRate: options.sampleRate ?? getKwzSampleRate(file),
    };
}
/** Longest recording a track can hold, in seconds (60 s BGM, 2 s sound effects). */
export function getKwzTrackMaxDuration(track) {
    return track === 'bgm' ? KWZ_MAX_BGM_SECONDS : KWZ_MAX_SE_SECONDS;
}
/** Resamples to 16364 Hz and encodes, cutting the sound to the track's maximum length. */
export function encodeKwzTrack(pcm, track, method = 'sinc') {
    if (pcm.samples.length === 0)
        return new Uint8Array(0);
    const native = resamplePcm(pcm, KWZ_SAMPLE_RATE, method).samples;
    const limit = Math.round(getKwzTrackMaxDuration(track) * KWZ_SAMPLE_RATE);
    return encodeKwzAdpcm(native.length > limit ? native.subarray(0, limit) : native);
}
