import { type EqualizerSetting } from '../audio/equalizer.ts';
import { type Pcm, type ResampleMethod } from '../audio/pcm.ts';
import { type KwzTrackOptions } from '../kwz/kwz-audio.ts';
import { type NoteFile, type NoteFormat } from './note.ts';
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
export declare function getTrackNames(note: NoteFile | NoteFormat): readonly TrackName[];
export declare function hasTrack(note: NoteFile, track: TrackName): boolean;
/** True when the note has any audio track. */
export declare function hasAudio(note: NoteFile): boolean;
/** Decodes one track at its native sample rate. */
export declare function decodeTrack(note: NoteFile, track: TrackName, options?: DecodeTrackOptions): Pcm;
/** Sound effect flags of each frame (bit 0 = SE1). */
export declare function getSoundFlags(note: NoteFile): Uint8Array;
/** BGM sped up or slowed down like the app does when the frame speed changed after recording. */
export declare function getBgmPlaybackRate(note: NoteFile, nativeRate: number): number;
/** Mixes the BGM with sound effects at the frames that trigger them, as the app plays them. */
export declare function mixAudio(note: NoteFile, options?: MixOptions): Pcm;
