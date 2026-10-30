import { type EqualizerBand, type EqualizerSetting } from '../audio/equalizer.ts';
import type { KwzPaletteName } from '../kwz/kwz-types.ts';
import { type StereoLayout } from '../note/export.ts';
import { type NoteSource } from '../note/load.ts';
import type { NoteFile } from '../note/note.ts';
import type { CropMode } from '../note/render.ts';
import { type CanvasBackend, type CanvasScaling } from './frame-canvas.ts';
export type PlayerSource = NoteSource;
export interface PlayerRenderOptions {
    /** 3D notes: how both eyes are shown (default: the center view). */
    stereo?: StereoLayout;
    /** 3D slider position from 0 to 1 (default 1). */
    depthStrength?: number;
    /** KWZ colors: 'screen' as the 3DS shows them (default) or 'app'. */
    palette?: KwzPaletteName;
    crop?: CropMode;
    isShowingHiddenLayers?: boolean;
}
export interface PlayerOptions extends PlayerRenderOptions {
    /** Canvas to draw on; one is created when omitted. */
    canvas?: HTMLCanvasElement;
    /** Default 'auto': WebGL when available, otherwise Canvas 2D. */
    backend?: CanvasBackend | 'auto';
    /** Default 'css'; 'sharp' renders at the displayed size with WebGL (canvas sized by CSS). */
    scaling?: CanvasScaling;
    /** Equalizer for the sound: a preset, ten graphic equalizer gains in dB, or filters. */
    equalizer?: EqualizerSetting;
    audioContext?: AudioContext;
    /** Overrides the note's own loop flag. */
    isLooping?: boolean;
    volume?: number;
    /** Upsample audio with nearest-neighbour like the consoles instead of band-limited (default false). */
    isConsoleSound?: boolean;
    /** Play only these frames (`end` exclusive); the default is the whole note. */
    range?: {
        start?: number;
        end?: number;
    };
}
export type PlayerEvent = 'load' | 'play' | 'pause' | 'frame' | 'ended' | 'error';
/**
 * Plays notes on a canvas with sample-accurate sound: frames follow the audio clock, sound
 * effects play on the frames that trigger them and the BGM follows speed changes like the apps.
 */
export declare class FlipnotePlayer extends EventTarget {
    readonly canvas: HTMLCanvasElement;
    note: NoteFile | null;
    private readonly screen;
    private audioContext;
    private readonly options;
    private renderer;
    private audioBuffer;
    private audioNode;
    private filters;
    private gain;
    private equalizerBands;
    private frame;
    private playing;
    private startClock;
    private startFrame;
    private animation;
    private loopOverride;
    private isAudioClock;
    private volumeValue;
    private mutedValue;
    private range;
    constructor(options?: PlayerOptions);
    /** Whether frames are drawn with WebGL or Canvas 2D. */
    get backend(): CanvasBackend;
    get frameCount(): number;
    get frameRate(): number;
    get currentFrame(): number;
    /** First frame of the playback range. */
    get firstFrame(): number;
    /** Last frame of the playback range. */
    get lastFrame(): number;
    /** Restricts playback to frames `start` to `end` (exclusive); call with no arguments to reset. */
    setRange(start?: number, end?: number): void;
    /** Length of the note in seconds. */
    get duration(): number;
    get currentTime(): number;
    get isPlaying(): boolean;
    get isLooping(): boolean;
    set isLooping(value: boolean);
    get volume(): number;
    set volume(value: number);
    get isMuted(): boolean;
    set isMuted(value: boolean);
    /** Filters the sound passes through (empty when the equalizer is off). */
    get equalizer(): readonly EqualizerBand[];
    /** Changes the equalizer, also while playing; null turns it off. */
    setEqualizer(setting: EqualizerSetting | null): void;
    private emit;
    private updateGain;
    private ensureAudio;
    /** Loads a note from bytes, a Blob/File, a URL or a parsed note. */
    load(source: PlayerSource): Promise<void>;
    /** Shows a parsed note at its first frame. */
    open(note: NoteFile): void;
    /** Changes 3D, palette or crop settings and redraws. */
    setRenderOptions(options: PlayerRenderOptions): void;
    private drawFrame;
    private prepareAudio;
    /** The audio clock while sound plays (keeps frames in sync), otherwise wall time. */
    private now;
    private startAudio;
    /** Routes the source through one biquad filter per equalizer band into the volume control. */
    private connectAudio;
    private stopAudio;
    play(): void;
    pause(): void;
    toggle(): void;
    private readonly tick;
    /** Jumps to a frame; playback continues from there. */
    seek(index: number): void;
    stepForward(): void;
    stepBack(): void;
    /** Releases audio and canvas resources. */
    destroy(): void;
}
