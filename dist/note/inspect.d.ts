import { type TrackName } from './audio.ts';
import { type Issue } from './check.ts';
import { type MemoryUsage } from './memory.ts';
import { type NoteFormat, type NoteVariant } from './note.ts';
export interface TrackReport {
    name: TrackName;
    bytes: number;
    samples: number;
    sampleRate: number;
    duration: number;
    peak: number;
    rms: number;
}
export interface FrameReport {
    index: number;
    bytes: number;
    /** PPM: whether the frame is independent; KWZ: bitmask of independent layers. */
    key: boolean | number;
    paper: number;
    /** PPM pens, or KWZ color indices (A1, A2, B1, B2, C1, C2). */
    colors: number[];
    /** Drawn pixels per layer. */
    pixels: number[];
    soundFlags: number;
    /** PPM: line encodings 0-3 per layer; KWZ: tile types 0-7 per layer. */
    encodings: number[][];
    /** KWZ only: 3D depth per layer. */
    depths?: number[];
}
export interface NoteReport {
    format: NoteFormat;
    variant: NoteVariant;
    fileSize: number;
    isSigned: boolean;
    /** KWZ section CRC32 results. */
    checksums: Record<string, boolean>;
    meta: Record<string, unknown>;
    animation: {
        width: number;
        height: number;
        frameCount: number;
        frameRate: number;
        bgmFrameRate: number;
        duration: number;
        keyFrames: number;
        encodedBytes: number;
    };
    memory: MemoryUsage;
    tracks: TrackReport[];
    frames: FrameReport[];
    issues: Issue[];
}
export interface InspectOptions {
    /** Decode every frame for per-frame statistics (default true). */
    isDetailed?: boolean;
}
/** Parses and analyzes a PPM or KWZ file: metadata, statistics, memory use and problems. */
export declare function inspectNote(bytes: Uint8Array, options?: InspectOptions): NoteReport;
