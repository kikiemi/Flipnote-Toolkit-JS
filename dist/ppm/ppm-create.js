import { withoutUndefined } from '../core/bytes.js';
import { check, ignoreWarning } from '../core/errors.js';
import { currentTimestamp } from '../core/time.js';
import { encodePpmTrack, getPpmTrackMaxDuration } from './ppm-audio.js';
import { createPpmFilename, createPpmFsid, createPpmRootFragment } from './ppm-filename.js';
import { packPpmAnimation, PpmFrameEncoder } from './ppm-frame-codec.js';
import { renderPpmFrame } from './ppm-render.js';
import { createPpmThumbnail } from './ppm-thumbnail.js';
import { PPM_DEFAULT_EXTRA_FLAGS, PPM_FORMAT_VERSION, PPM_MAX_ANIMATION_SIZE, PPM_MAX_FILE_SIZE, PPM_MAX_FRAMES, PPM_SIGNATURE_SIZE, PPM_TRACK_NAMES, } from './ppm-types.js';
const DEFAULT_AUTHOR_NAME = 'FLIPNOTE';
/** Metadata for a new note; one random author ID and filename unless overridden. */
export function createPpmMeta(overrides = {}) {
    const authorId = (overrides.currentAuthorId ?? createPpmFsid()).toUpperCase();
    const timestamp = overrides.timestamp ?? currentTimestamp();
    const filename = overrides.currentFilename ?? createPpmFilename(authorId.slice(10), timestamp);
    const name = overrides.currentAuthorName ?? DEFAULT_AUTHOR_NAME;
    const frameSpeed = overrides.frameSpeed ?? 6;
    return {
        formatVersion: PPM_FORMAT_VERSION,
        isLocked: false,
        thumbnailIndex: 0,
        rootAuthorName: name,
        parentAuthorName: name,
        currentAuthorName: name,
        rootAuthorId: authorId,
        parentAuthorId: authorId,
        currentAuthorId: authorId,
        parentFilename: filename,
        currentFilename: filename,
        rootFilenameFragment: createPpmRootFragment(filename),
        timestamp,
        frameSpeed,
        bgmSpeed: frameSpeed,
        isLooping: false,
        isLayerVisible: [true, true],
        extraFlags: PPM_DEFAULT_EXTRA_FLAGS,
        ...withoutUndefined(overrides),
    };
}
/** Encodes the given tracks over `base`; null or empty PCM removes a track. */
export function encodePpmTracks(tracks, base, warn = ignoreWarning) {
    const result = {};
    for (const name of PPM_TRACK_NAMES) {
        if (!tracks || !(name in tracks)) {
            result[name] = base ? base[name] : new Uint8Array(0);
            continue;
        }
        const pcm = tracks[name];
        if (!pcm || pcm.samples.length === 0) {
            result[name] = new Uint8Array(0);
            continue;
        }
        const seconds = pcm.samples.length / pcm.sampleRate;
        const maxSeconds = getPpmTrackMaxDuration(name);
        if (seconds > maxSeconds) {
            warn(`${name} is ${seconds.toFixed(2)} s and was cut to ${maxSeconds.toFixed(2)} s`);
        }
        result[name] = encodePpmTrack(pcm, name);
    }
    return result;
}
export function getPpmAnimationSize(animation) {
    return 8 + animation.offsets.length * 4 + animation.data.length;
}
/** Encodes frames in playback order and renders the thumbnail frame. */
export function encodePpmFrames(frames, meta, options = {}) {
    const warn = options.onWarning ?? ignoreWarning;
    const encoder = new PpmFrameEncoder(options.keyFrameInterval ?? 0);
    const encoded = [];
    const soundFlags = [];
    let thumbnail = null;
    for (const frame of frames) {
        if (encoded.length === meta.thumbnailIndex || encoded.length === 0) {
            thumbnail = createPpmThumbnail(renderPpmFrame(frame, undefined, { visible: meta.isLayerVisible }));
        }
        encoded.push(encoder.encode(frame));
        soundFlags.push(frame.soundFlags);
    }
    check(encoded.length > 0 && thumbnail, 'INVALID_ARGUMENT', 'A PPM needs at least one frame');
    if (meta.thumbnailIndex >= encoded.length) {
        warn(`Thumbnail index ${meta.thumbnailIndex} is out of range; using frame 0`);
        meta.thumbnailIndex = 0;
    }
    const animation = packPpmAnimation(encoded, soundFlags);
    const size = animation.data.length;
    if (encoded.length > PPM_MAX_FRAMES) {
        warn(`${encoded.length} frames exceed the app limit of ${PPM_MAX_FRAMES}`);
    }
    if (size > PPM_MAX_ANIMATION_SIZE) {
        warn(`Animation data (${size} bytes) exceeds the app limit of ${PPM_MAX_ANIMATION_SIZE}`);
    }
    return { animation, thumbnail };
}
function warnFileSize(file, warn) {
    const tracks = PPM_TRACK_NAMES.reduce((sum, name) => sum + file.tracks[name].length, 0);
    const total = 0x6a0 +
        getPpmAnimationSize(file.animation) +
        file.animation.offsets.length +
        32 +
        tracks +
        0x93;
    if (total > PPM_MAX_FILE_SIZE) {
        warn(`File size (about ${total} bytes) exceeds the app limit of ${PPM_MAX_FILE_SIZE}`);
    }
    return file;
}
/** Encodes decoded frames and PCM tracks into a new PPM file (thumbnail included). */
export function createPpm(source) {
    const meta = createPpmMeta(source.meta);
    const warn = source.onWarning ?? ignoreWarning;
    const { animation, thumbnail } = encodePpmFrames(source.frames, meta, source);
    const tracks = encodePpmTracks(source.tracks ?? {}, null, warn);
    const file = {
        format: 'ppm',
        meta,
        thumbnail,
        animation,
        tracks,
        signature: new Uint8Array(PPM_SIGNATURE_SIZE),
        source: null,
    };
    return warnFileSize(file, warn);
}
/** Copy of `file` with new frames; metadata and audio are kept byte for byte. */
export function replacePpmFrames(file, frames, options = {}) {
    const meta = { ...file.meta, isLayerVisible: [...file.meta.isLayerVisible] };
    const { animation, thumbnail } = encodePpmFrames(frames, meta, options);
    return warnFileSize({ ...file, meta, thumbnail, animation }, options.onWarning ?? ignoreWarning);
}
/** Copy of `file` with the given tracks re-encoded (null removes one); other tracks are kept. */
export function replacePpmTracks(file, tracks, options = {}) {
    const warn = options.onWarning ?? ignoreWarning;
    return warnFileSize({ ...file, tracks: encodePpmTracks(tracks, file.tracks, warn) }, warn);
}
