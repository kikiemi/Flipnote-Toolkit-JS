import { decodePpmAdpcm, encodePpmAdpcm, PPM_ADPCM_HEADER_SIZE } from '../audio/adpcm.js';
import { resamplePcm } from '../audio/pcm.js';
import { PPM_MAX_BGM_SIZE, PPM_MAX_SE_SIZE, PPM_SAMPLE_RATE, } from './ppm-types.js';
export function hasPpmTrack(file, track) {
    return file.tracks[track].length > PPM_ADPCM_HEADER_SIZE;
}
/** Decodes a track at its native 8180 Hz rate. */
export function decodePpmTrack(file, track) {
    return { samples: decodePpmAdpcm(file.tracks[track]), sampleRate: PPM_SAMPLE_RATE };
}
/** Longest recording a track can hold, in seconds (about 60 s BGM, 2 s sound effects). */
export function getPpmTrackMaxDuration(track) {
    const size = track === 'bgm' ? PPM_MAX_BGM_SIZE : PPM_MAX_SE_SIZE;
    return ((size - PPM_ADPCM_HEADER_SIZE) * 2) / PPM_SAMPLE_RATE;
}
/** Resamples to 8180 Hz and encodes, cutting the sound to the track's maximum length. */
export function encodePpmTrack(pcm, track, method = 'sinc') {
    if (pcm.samples.length === 0)
        return new Uint8Array(0);
    const native = resamplePcm(pcm, PPM_SAMPLE_RATE, method).samples;
    const limit = Math.round(getPpmTrackMaxDuration(track) * PPM_SAMPLE_RATE);
    return encodePpmAdpcm(native.length > limit ? native.subarray(0, limit) : native);
}
