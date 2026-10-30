import type { Pcm } from '../audio/pcm.ts';
import { withoutUndefined } from '../core/bytes.ts';
import { check, ignoreWarning, type WarningHandler } from '../core/errors.ts';
import { currentTimestamp } from '../core/time.ts';
import { encodeKwzTrack, getKwzTrackMaxDuration } from './kwz-audio.ts';
import { createKwzFsid, encodeKwzFilename } from './kwz-filename.ts';
import { KwzFrameEncoder } from './kwz-frame-codec.ts';
import { createEmptyKwzMeta } from './kwz-reader.ts';
import { renderKwzFrame } from './kwz-render.ts';
import { createKwzThumbnail } from './kwz-thumbnail.ts';
import {
  KWZ_APP_VERSION,
  KWZ_DEFAULT_FRAME_EXTRA_FLAGS,
  KWZ_EMPTY_AUTHOR_ID,
  KWZ_MAX_FRAMES,
  KWZ_TRACK_NAMES,
  type KwzFile,
  type KwzFrame,
  type KwzFrameRecord,
  type KwzMeta,
  type KwzTrackName,
  type KwzTracks,
  type KwzVariant,
} from './kwz-types.ts';

const DEFAULT_AUTHOR_NAME = 'FLIPNOTE';

export interface KwzEncodeOptions {
  /** Make every Nth frame independent of the previous one (0 = never forced). */
  keyFrameInterval?: number;
  /** Frame flag bit 7 for new frames (0x80 as written by app version 734). */
  frameExtraFlags?: number;
  onWarning?: WarningHandler;
}

export type KwzTrackInput = Partial<Record<KwzTrackName, Pcm | null>>;

export interface KwzSource extends KwzEncodeOptions {
  frames: Iterable<KwzFrame>;
  meta?: Partial<KwzMeta>;
  /** PCM at any sample rate; resampled to 16364 Hz. */
  tracks?: KwzTrackInput;
  variant?: KwzVariant;
}

/** Metadata for a new note; filenames encode the author ID and timestamps. */
export function createKwzMeta(overrides: Partial<KwzMeta> = {}): KwzMeta {
  const authorId = (overrides.currentAuthorId ?? createKwzFsid()).toLowerCase();
  const time = overrides.createdTime ?? currentTimestamp();
  const modifiedTime = overrides.modifiedTime ?? time;
  const filename = encodeKwzFilename({ authorId, createdTime: time, modifiedTime: time });
  const name = overrides.currentAuthorName ?? DEFAULT_AUTHOR_NAME;
  const frameSpeed = overrides.frameSpeed ?? 7;
  return {
    ...createEmptyKwzMeta(),
    createdTime: time,
    modifiedTime,
    appVersion: KWZ_APP_VERSION,
    rootAuthorId: authorId,
    parentAuthorId: authorId,
    currentAuthorId: authorId,
    rootAuthorName: name,
    parentAuthorName: name,
    currentAuthorName: name,
    rootFilename: filename,
    parentFilename: filename,
    currentFilename: encodeKwzFilename({ authorId, createdTime: time, modifiedTime }),
    frameSpeed,
    bgmSpeed: frameSpeed,
    ...withoutUndefined(overrides),
  };
}

/** Encodes the given tracks over `base`; null or empty PCM removes a track. */
export function encodeKwzTracks(
  tracks: KwzTrackInput | undefined,
  base: KwzTracks | null,
  warn: WarningHandler = ignoreWarning,
): KwzTracks {
  const result = {} as KwzTracks;
  for (const name of KWZ_TRACK_NAMES) {
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
    const maxSeconds = getKwzTrackMaxDuration(name);
    if (seconds > maxSeconds) {
      warn(`${name} is ${seconds.toFixed(2)} s and was cut to ${maxSeconds.toFixed(2)} s`);
    }
    result[name] = encodeKwzTrack(pcm, name);
  }
  return result;
}

/** Total encoded layer data, the figure Flipnote Studio 3D's memory meter is based on. */
export function getKwzFrameDataSize(frames: readonly KwzFrameRecord[]): number {
  let size = 0;
  for (const frame of frames) {
    size += frame.layerData[0].length + frame.layerData[1].length + frame.layerData[2].length;
  }
  return size;
}

/** Encodes frames in order and renders the thumbnail frame for notes that have one. */
export function encodeKwzFrames(
  frames: Iterable<KwzFrame>,
  meta: KwzMeta,
  hasThumbnail: boolean,
  options: KwzEncodeOptions = {},
): { frames: KwzFrameRecord[]; thumbnail: Uint8Array | null } {
  const warn = options.onWarning ?? ignoreWarning;
  const encoder = new KwzFrameEncoder(options.keyFrameInterval ?? 0);
  const records: KwzFrameRecord[] = [];
  let thumbnail: Uint8Array | null = null;
  for (const frame of frames) {
    if (hasThumbnail && (records.length === meta.thumbnailIndex || records.length === 0)) {
      thumbnail = createKwzThumbnail(
        renderKwzFrame(frame, undefined, { visible: meta.isLayerVisible }),
      );
    }
    const { layerData, keyLayers } = encoder.encode(frame);
    records.push({
      paper: frame.paper,
      colors: [...frame.colors],
      layerDepths: [...frame.layerDepths],
      soundFlags: frame.soundFlags,
      cameraFlags: frame.cameraFlags,
      authorId: frame.authorId === KWZ_EMPTY_AUTHOR_ID ? meta.currentAuthorId : frame.authorId,
      layerData,
      keyLayers,
      extraFlags: options.frameExtraFlags ?? KWZ_DEFAULT_FRAME_EXTRA_FLAGS,
      reserved: 0,
    });
  }
  check(records.length > 0, 'INVALID_ARGUMENT', 'A KWZ needs at least one frame');
  if (meta.thumbnailIndex >= records.length) {
    warn(`Thumbnail index ${meta.thumbnailIndex} is out of range; using frame 0`);
    meta.thumbnailIndex = 0;
  }
  if (records.length > KWZ_MAX_FRAMES) {
    warn(`${records.length} frames exceed the app limit of ${KWZ_MAX_FRAMES}`);
  }
  return { frames: records, thumbnail };
}

/** Encodes decoded frames and PCM tracks into a new KWZ file (thumbnail included). */
export function createKwz(source: KwzSource): KwzFile {
  const variant = source.variant ?? 'kwz';
  const meta = createKwzMeta(source.meta);
  const warn = source.onWarning ?? ignoreWarning;
  const { frames, thumbnail } = encodeKwzFrames(source.frames, meta, variant === 'kwz', source);
  const tracks = variant === 'kwz' ? encodeKwzTracks(source.tracks ?? {}, null, warn) : null;
  return { format: 'kwz', variant, meta, thumbnail, frames, tracks, signature: null, source: null };
}

/** Copy of `file` with new frames; metadata and audio are kept byte for byte. */
export function replaceKwzFrames(
  file: KwzFile,
  frames: Iterable<KwzFrame>,
  options: KwzEncodeOptions = {},
): KwzFile {
  const meta: KwzMeta = { ...file.meta, isLayerVisible: [...file.meta.isLayerVisible] };
  const encoded = encodeKwzFrames(frames, meta, file.thumbnail !== null, options);
  return { ...file, meta, thumbnail: encoded.thumbnail, frames: encoded.frames };
}

/** Copy of `file` with the given tracks re-encoded (null removes one); other tracks are kept. */
export function replaceKwzTracks(
  file: KwzFile,
  tracks: KwzTrackInput,
  options: Pick<KwzEncodeOptions, 'onWarning'> = {},
): KwzFile {
  check(file.variant === 'kwz', 'INVALID_ARGUMENT', 'Only KWZ notes have sound tracks');
  return {
    ...file,
    tracks: encodeKwzTracks(tracks, file.tracks, options.onWarning ?? ignoreWarning),
  };
}
