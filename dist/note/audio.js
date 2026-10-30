import { applyEqualizer } from '../audio/equalizer.js';
import { floatToPcm, mixInto, resamplePcm } from '../audio/pcm.js';
import { check } from '../core/errors.js';
import { decodeKwzTrack, hasKwzTrack } from '../kwz/kwz-audio.js';
import { KWZ_TRACK_NAMES } from '../kwz/kwz-types.js';
import { decodePpmTrack, hasPpmTrack } from '../ppm/ppm-audio.js';
import { PPM_OUTPUT_SAMPLE_RATE, PPM_TRACK_NAMES } from '../ppm/ppm-types.js';
import { getFrameCount, getNoteInfo } from './note.js';
export function getTrackNames(note) {
    return (typeof note === 'string' ? note : note.format) === 'ppm'
        ? PPM_TRACK_NAMES
        : KWZ_TRACK_NAMES;
}
export function hasTrack(note, track) {
    if (note.format === 'ppm')
        return track !== 'se4' && hasPpmTrack(note, track);
    return hasKwzTrack(note, track);
}
/** True when the note has any audio track. */
export function hasAudio(note) {
    return getTrackNames(note).some((track) => hasTrack(note, track));
}
/** Decodes one track at its native sample rate. */
export function decodeTrack(note, track, options = {}) {
    check(getTrackNames(note).includes(track), 'INVALID_ARGUMENT', `${note.format.toUpperCase()} has no ${track} track`);
    if (note.format === 'ppm')
        return decodePpmTrack(note, track);
    return decodeKwzTrack(note, track, options);
}
/** Sound effect flags of each frame (bit 0 = SE1). */
export function getSoundFlags(note) {
    if (note.format === 'ppm')
        return note.animation.soundFlags;
    return Uint8Array.from(note.frames, (frame) => frame.soundFlags);
}
/** BGM sped up or slowed down like the app does when the frame speed changed after recording. */
export function getBgmPlaybackRate(note, nativeRate) {
    const info = getNoteInfo(note);
    return (nativeRate * info.frameRate) / info.bgmFrameRate;
}
/** Mixes the BGM with sound effects at the frames that trigger them, as the app plays them. */
export function mixAudio(note, options = {}) {
    const info = getNoteInfo(note);
    const sampleRate = options.sampleRate ?? PPM_OUTPUT_SAMPLE_RATE;
    const repeat = options.repeat ?? 1;
    const duration = options.duration ?? info.duration * repeat;
    const gain = options.gain ?? 1;
    const tracks = options.tracks ?? getTrackNames(note);
    const buffer = new Float32Array(Math.max(0, Math.round(duration * sampleRate)));
    const flags = getSoundFlags(note);
    const frameCount = getFrameCount(note);
    for (const track of tracks) {
        if (!hasTrack(note, track))
            continue;
        const native = decodeTrack(note, track, options);
        if (track === 'bgm') {
            const adjusted = {
                samples: native.samples,
                sampleRate: getBgmPlaybackRate(note, native.sampleRate),
            };
            mixInto(buffer, resamplePcm(adjusted, sampleRate, options.method).samples, 0, gain);
            continue;
        }
        const effect = resamplePcm(native, sampleRate, options.method).samples;
        const bit = 1 << (Number(track[2]) - 1);
        for (let pass = 0; pass < repeat; pass++) {
            for (let index = 0; index < frameCount; index++) {
                if (!(flags[index] & bit))
                    continue;
                const time = (pass * frameCount + index) / info.frameRate;
                mixInto(buffer, effect, Math.round(time * sampleRate), gain);
            }
        }
    }
    if (options.equalizer)
        applyEqualizer(buffer, sampleRate, options.equalizer);
    return floatToPcm(buffer, sampleRate);
}
