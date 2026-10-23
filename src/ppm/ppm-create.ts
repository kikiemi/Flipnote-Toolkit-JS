import type { Pcm } from '../audio/pcm.ts';
import { withoutUndefined } from '../core/bytes.ts';
import { check, ignoreWarning, type WarningHandler } from '../core/errors.ts';
import { currentTimestamp } from '../core/time.ts';
import { encodePpmTrack, getPpmTrackMaxDuration } from './ppm-audio.ts';
import { createPpmFilename, createPpmFsid, createPpmRootFragment } from './ppm-filename.ts';
import { packPpmAnimation, PpmFrameEncoder } from './ppm-frame-codec.ts';
import { renderPpmFrame } from './ppm-render.ts';
import { createPpmThumbnail } from './ppm-thumbnail.ts';
import {
  PPM_DEFAULT_EXTRA_FLAGS,
  PPM_FORMAT_VERSION,
  PPM_MAX_ANIMATION_SIZE,
  PPM_MAX_FILE_SIZE,
  PPM_MAX_FRAMES,
  PPM_SIGNATURE_SIZE,
  PPM_TRACK_NAMES,
  type PpmAnimation,
  type PpmFile,
  type PpmFrame,
  type PpmMeta,
  type PpmTrackName,
  type PpmTracks,
} from './ppm-types.ts';

const DEFAULT_AUTHOR_NAME = 'FLIPNOTE';

export interface PpmEncodeOptions {
  /** Force a key frame every N frames (0 = only when smaller). */
  keyFrameInterval?: number;
  onWarning?: WarningHandler;
}

export type PpmTrackInput = Partial<Record<PpmTrackName, Pcm | null>>;

export interface PpmSource extends PpmEncodeOptions {
  frames: Iterable<PpmFrame>;
  meta?: Partial<PpmMeta>;
  /** PCM at any sample rate; resampled to 8180 Hz. */
  tracks?: PpmTrackInput;
}

/** Metadata for a new note; one random author ID and filename unless overridden. */
export function createPpmMeta(overrides: Partial<PpmMeta> = {}): PpmMeta {
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
export function encodePpmTracks(
  tracks: PpmTrackInput | undefined,
  base: PpmTracks | null,
  warn: WarningHandler = ignoreWarning,
): PpmTracks {
  const result = {} as PpmTracks;
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

export function getPpmAnimationSize(animation: PpmAnimation): number {
  return 8 + animation.offsets.length * 4 + animation.data.length;
}

/** Encodes frames in playback order and renders the thumbnail frame. */
export function encodePpmFrames(
  frames: Iterable<PpmFrame>,
  meta: PpmMeta,
  options: PpmEncodeOptions = {},
): { animation: PpmAnimation; thumbnail: Uint8Array } {
  const warn = options.onWarning ?? ignoreWarning;
  const encoder = new PpmFrameEncoder(options.keyFrameInterval ?? 0);
  const encoded: Uint8Array[] = [];
  const soundFlags: number[] = [];
  let thumbnail: Uint8Array | null = null;
  for (const frame of frames) {
    if (encoded.length === meta.thumbnailIndex || encoded.length === 0) {
      thumbnail = createPpmThumbnail(
        renderPpmFrame(frame, undefined, { visible: meta.isLayerVisible }),
      );
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
  const size = getPpmAnimationSize(animation);
  if (encoded.length > PPM_MAX_FRAMES) {
    warn(`${encoded.length} frames exceed the app limit of ${PPM_MAX_FRAMES}`);
  }
  if (size > PPM_MAX_ANIMATION_SIZE) {
    warn(`Animation data (${size} bytes) exceeds the app limit of ${PPM_MAX_ANIMATION_SIZE}`);
  }
  return { animation, thumbnail };
}

function warnFileSize(file: PpmFile, warn: WarningHandler): PpmFile {
  const tracks = PPM_TRACK_NAMES.reduce((sum, name) => sum + file.tracks[name].length, 0);
  const total =
    0x6a0 +
    getPpmAnimationSize(file.animation) +
    file.animation.offsets.length +
    32 +
    tracks +
    0x93;
  if (total > PPM_MAX_FILE_SIZE) {
    warn(`File size (about ${total} bytes) exceeds the 1 MiB the app accepts`);
  }
  return file;
}

/** Encodes decoded frames and PCM tracks into a new PPM file (thumbnail included). */
export function createPpm(source: PpmSource): PpmFile {
  const meta = createPpmMeta(source.meta);
  const warn = source.onWarning ?? ignoreWarning;
  const { animation, thumbnail } = encodePpmFrames(source.frames, meta, source);
  const tracks = encodePpmTracks(source.tracks ?? {}, null, warn);
  const file: PpmFile = {
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
export function replacePpmFrames(
  file: PpmFile,
  frames: Iterable<PpmFrame>,
  options: PpmEncodeOptions = {},
): PpmFile {
  const meta: PpmMeta = { ...file.meta, isLayerVisible: [...file.meta.isLayerVisible] };
  const { animation, thumbnail } = encodePpmFrames(frames, meta, options);
  return warnFileSize({ ...file, meta, thumbnail, animation }, options.onWarning ?? ignoreWarning);
}

/** Copy of `file` with the given tracks re-encoded (null removes one); other tracks are kept. */
export function replacePpmTracks(
  file: PpmFile,
  tracks: PpmTrackInput,
  options: Pick<PpmEncodeOptions, 'onWarning'> = {},
): PpmFile {
  const warn = options.onWarning ?? ignoreWarning;
  return warnFileSize({ ...file, tracks: encodePpmTracks(tracks, file.tracks, warn) }, warn);
}
