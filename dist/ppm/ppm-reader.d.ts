import { type PpmFile, type PpmMeta } from './ppm-types.ts';
/** Where each part of a PPM file starts, derived from its size fields. */
export interface PpmLayout {
    frameCount: number;
    animationSize: number;
    dataStart: number;
    dataEnd: number;
    soundHeaderOffset: number;
    trackSizes: number[];
    soundEnd: number;
    fileSize: number;
}
export declare function isPpm(bytes: Uint8Array): boolean;
export declare function computePpmLayout(frameCount: number, dataSize: number, trackSizes: readonly number[]): PpmLayout;
/** Reads the layout from the size fields, or returns null when they are inconsistent. */
export declare function readPpmLayout(bytes: Uint8Array): PpmLayout | null;
export declare function readPpmMeta(bytes: Uint8Array, layout: PpmLayout): PpmMeta;
/**
 * Parses a PPM file without copying: frames, thumbnail and audio stay encoded and
 * reference `bytes`, which must not be modified while the result is in use.
 */
export declare function readPpm(bytes: Uint8Array): PpmFile;
