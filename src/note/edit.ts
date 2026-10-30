import { check } from '../core/errors.ts';
import {
  replaceKwzFrames,
  replaceKwzTracks,
  type KwzEncodeOptions,
  type KwzTrackInput,
} from '../kwz/kwz-create.ts';
import { cloneKwzFrame, KwzFrameDecoder } from '../kwz/kwz-frame-codec.ts';
import type { KwzFile, KwzFrame } from '../kwz/kwz-types.ts';
import {
  replacePpmFrames,
  replacePpmTracks,
  type PpmEncodeOptions,
  type PpmTrackInput,
} from '../ppm/ppm-create.ts';
import { clonePpmFrame, PpmFrameDecoder } from '../ppm/ppm-frame-codec.ts';
import type { PpmFile, PpmFrame } from '../ppm/ppm-types.ts';
import { decodeTrack, getBgmPlaybackRate, hasTrack } from './audio.ts';
import { getFrameCount, getNoteInfo, type NoteFile } from './note.ts';

/** Decodes every frame into independent copies that can be edited freely. */
export function decodeFrames(note: PpmFile): PpmFrame[];
export function decodeFrames(note: KwzFile): KwzFrame[];
export function decodeFrames(note: NoteFile): PpmFrame[] | KwzFrame[];
export function decodeFrames(note: NoteFile): PpmFrame[] | KwzFrame[] {
  if (note.format === 'ppm') {
    const decoder = new PpmFrameDecoder(note);
    return Array.from({ length: decoder.frameCount }, (_, index) =>
      clonePpmFrame(decoder.decode(index)),
    );
  }
  const decoder = new KwzFrameDecoder(note);
  return note.frames.map((_, index) => cloneKwzFrame(decoder.decode(index)));
}

/** Yields decoded frames in order without keeping them; each frame is reused by the next. */
export function* iterateFrames(note: NoteFile): Generator<PpmFrame | KwzFrame> {
  const decoder = note.format === 'ppm' ? new PpmFrameDecoder(note) : new KwzFrameDecoder(note);
  for (let index = 0; index < decoder.frameCount; index++) yield decoder.decode(index);
}

/** Copy of a note with new frames (of the note's own format); metadata and audio are kept. */
export function replaceFrames(
  note: PpmFile,
  frames: Iterable<PpmFrame>,
  options?: PpmEncodeOptions,
): PpmFile;
export function replaceFrames(
  note: KwzFile,
  frames: Iterable<KwzFrame>,
  options?: KwzEncodeOptions,
): KwzFile;
export function replaceFrames(
  note: NoteFile,
  frames: Iterable<PpmFrame> | Iterable<KwzFrame>,
  options: PpmEncodeOptions & KwzEncodeOptions = {},
): NoteFile {
  return note.format === 'ppm'
    ? replacePpmFrames(note, frames as Iterable<PpmFrame>, options)
    : replaceKwzFrames(note, frames as Iterable<KwzFrame>, options);
}

/** Copy of a note with the given tracks re-encoded from PCM (null removes one); others are kept. */
export function replaceTracks(
  note: PpmFile,
  tracks: PpmTrackInput,
  options?: PpmEncodeOptions,
): PpmFile;
export function replaceTracks(
  note: KwzFile,
  tracks: KwzTrackInput,
  options?: KwzEncodeOptions,
): KwzFile;
export function replaceTracks(
  note: NoteFile,
  tracks: PpmTrackInput | KwzTrackInput,
  options: PpmEncodeOptions & KwzEncodeOptions = {},
): NoteFile {
  return note.format === 'ppm'
    ? replacePpmTracks(note, tracks as PpmTrackInput, options)
    : replaceKwzTracks(note, tracks, options);
}

/**
 * Copy of a note with only frames `start` to `end` (exclusive). Frames are re-encoded, sound
 * effects stay on their frames and the BGM is cut to the same span.
 */
export function sliceFrames(note: NoteFile, start: number, end = getFrameCount(note)): NoteFile {
  const count = getFrameCount(note);
  check(
    Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end <= count && start < end,
    'INVALID_ARGUMENT',
    `Frame range ${start}-${end} is outside 0-${count}`,
  );
  const frames = decodeFrames(note).slice(start, end);
  const meta = {
    ...note.meta,
    thumbnailIndex: Math.max(0, Math.min(end - 1, note.meta.thumbnailIndex) - start),
  };
  let sliced = replaceFrames({ ...note, meta } as PpmFile, frames as PpmFrame[]) as NoteFile;
  if (hasTrack(note, 'bgm')) {
    const info = getNoteInfo(note);
    const bgm = decodeTrack(note, 'bgm');
    const rate = getBgmPlaybackRate(note, bgm.sampleRate);
    const from = Math.round((start / info.frameRate) * rate);
    const to = Math.round((end / info.frameRate) * rate);
    const samples = bgm.samples.slice(
      Math.min(from, bgm.samples.length),
      Math.min(to, bgm.samples.length),
    );
    const pcm = { samples, sampleRate: bgm.sampleRate * (info.frameRate / info.bgmFrameRate) };
    sliced = replaceTracks(sliced as PpmFile, { bgm: samples.length ? pcm : null }) as NoteFile;
  }
  return sliced;
}
