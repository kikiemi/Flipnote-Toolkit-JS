import { applyEqualizer, type EqualizerSetting } from '../audio/equalizer.ts';
import { floatToPcm, mixInto, resamplePcm, type Pcm, type ResampleMethod } from '../audio/pcm.ts';
import { check } from '../core/errors.ts';
import { decodeKwzTrack, hasKwzTrack, type KwzTrackOptions } from '../kwz/kwz-audio.ts';
import { KWZ_TRACK_NAMES } from '../kwz/kwz-types.ts';
import { decodePpmTrack, hasPpmTrack } from '../ppm/ppm-audio.ts';
import { PPM_OUTPUT_SAMPLE_RATE, PPM_TRACK_NAMES } from '../ppm/ppm-types.ts';
import { getFrameCount, getNoteInfo, type NoteFile, type NoteFormat } from './note.ts';

export type TrackName = 'bgm' | 'se1' | 'se2' | 'se3' | 'se4';

export type DecodeTrackOptions = KwzTrackOptions;

export interface MixOptions extends DecodeTrackOptions {
  /** Output rate in Hz (default 32728, the consoles' mixing rate). */
  sampleRate?: number;
  /** Tracks to include (default all). */
  tracks?: readonly TrackName[];
  /** Length in seconds (default one playthrough of the animation). */
  duration?: number;
  /** Playthroughs to mix; sound effects repeat, the BGM plays once (default 1). */
  repeat?: number;
  gain?: number;
  /** 'nearest' reproduces the consoles' sample-and-hold upsampling (default 'sinc'). */
  method?: ResampleMethod;
  /** Equalizer for the mix: a preset, ten graphic equalizer gains in dB, or filters. */
  equalizer?: EqualizerSetting;
}

export function getTrackNames(note: NoteFile | NoteFormat): readonly TrackName[] {
  return (typeof note === 'string' ? note : note.format) === 'ppm'
    ? PPM_TRACK_NAMES
    : KWZ_TRACK_NAMES;
}

export function hasTrack(note: NoteFile, track: TrackName): boolean {
  if (note.format === 'ppm') return track !== 'se4' && hasPpmTrack(note, track);
  return hasKwzTrack(note, track);
}

/** True when the note has any audio track. */
export function hasAudio(note: NoteFile): boolean {
  return getTrackNames(note).some((track) => hasTrack(note, track));
}

/** Decodes one track at its native sample rate. */
export function decodeTrack(
  note: NoteFile,
  track: TrackName,
  options: DecodeTrackOptions = {},
): Pcm {
  check(
    getTrackNames(note).includes(track),
    'INVALID_ARGUMENT',
    `${note.format.toUpperCase()} has no ${track} track`,
  );
  if (note.format === 'ppm') return decodePpmTrack(note, track as Exclude<TrackName, 'se4'>);
  return decodeKwzTrack(note, track, options);
}

/** Sound effect flags of each frame (bit 0 = SE1). */
export function getSoundFlags(note: NoteFile): Uint8Array {
  if (note.format === 'ppm') return note.animation.soundFlags;
  return Uint8Array.from(note.frames, (frame) => frame.soundFlags);
}

/** BGM sped up or slowed down like the app does when the frame speed changed after recording. */
export function getBgmPlaybackRate(note: NoteFile, nativeRate: number): number {
  const info = getNoteInfo(note);
  return (nativeRate * info.frameRate) / info.bgmFrameRate;
}

/** Mixes the BGM with sound effects at the frames that trigger them, as the app plays them. */
export function mixAudio(note: NoteFile, options: MixOptions = {}): Pcm {
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
    if (!hasTrack(note, track)) continue;
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
        if (!(flags[index] & bit)) continue;
        const time = (pass * frameCount + index) / info.frameRate;
        mixInto(buffer, effect, Math.round(time * sampleRate), gain);
      }
    }
  }
  if (options.equalizer) applyEqualizer(buffer, sampleRate, options.equalizer);
  return floatToPcm(buffer, sampleRate);
}
