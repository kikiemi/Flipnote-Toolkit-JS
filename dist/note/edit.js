import { check } from '../core/errors.js';
import { replaceKwzFrames, replaceKwzTracks, } from '../kwz/kwz-create.js';
import { cloneKwzFrame, KwzFrameDecoder } from '../kwz/kwz-frame-codec.js';
import { replacePpmFrames, replacePpmTracks, } from '../ppm/ppm-create.js';
import { clonePpmFrame, PpmFrameDecoder } from '../ppm/ppm-frame-codec.js';
import { decodeTrack, getBgmPlaybackRate, hasTrack } from './audio.js';
import { getFrameCount, getNoteInfo } from './note.js';
export function decodeFrames(note) {
    if (note.format === 'ppm') {
        const decoder = new PpmFrameDecoder(note);
        return Array.from({ length: decoder.frameCount }, (_, index) => clonePpmFrame(decoder.decode(index)));
    }
    const decoder = new KwzFrameDecoder(note);
    return note.frames.map((_, index) => cloneKwzFrame(decoder.decode(index)));
}
/** Yields decoded frames in order without keeping them; each frame is reused by the next. */
export function* iterateFrames(note) {
    const decoder = note.format === 'ppm' ? new PpmFrameDecoder(note) : new KwzFrameDecoder(note);
    for (let index = 0; index < decoder.frameCount; index++)
        yield decoder.decode(index);
}
export function replaceFrames(note, frames, options = {}) {
    return note.format === 'ppm'
        ? replacePpmFrames(note, frames, options)
        : replaceKwzFrames(note, frames, options);
}
export function replaceTracks(note, tracks, options = {}) {
    return note.format === 'ppm'
        ? replacePpmTracks(note, tracks, options)
        : replaceKwzTracks(note, tracks, options);
}
/**
 * Copy of a note with only frames `start` to `end` (exclusive). Frames are re-encoded, sound
 * effects stay on their frames and the BGM is cut to the same span.
 */
export function sliceFrames(note, start, end = getFrameCount(note)) {
    const count = getFrameCount(note);
    check(Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end <= count && start < end, 'INVALID_ARGUMENT', `Frame range ${start}-${end} is outside 0-${count}`);
    const frames = decodeFrames(note).slice(start, end);
    const meta = {
        ...note.meta,
        thumbnailIndex: Math.max(0, Math.min(end - 1, note.meta.thumbnailIndex) - start),
    };
    let sliced = replaceFrames({ ...note, meta }, frames);
    if (hasTrack(note, 'bgm')) {
        const info = getNoteInfo(note);
        const bgm = decodeTrack(note, 'bgm');
        const rate = getBgmPlaybackRate(note, bgm.sampleRate);
        const from = Math.round((start / info.frameRate) * rate);
        const to = Math.round((end / info.frameRate) * rate);
        const samples = bgm.samples.slice(Math.min(from, bgm.samples.length), Math.min(to, bgm.samples.length));
        const pcm = { samples, sampleRate: bgm.sampleRate * (info.frameRate / info.bgmFrameRate) };
        sliced = replaceTracks(sliced, { bgm: samples.length ? pcm : null });
    }
    return sliced;
}
