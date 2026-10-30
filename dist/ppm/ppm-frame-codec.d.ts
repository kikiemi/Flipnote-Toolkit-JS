import { type PpmAnimation, type PpmFile, type PpmFrame, type PpmFrameInfo } from './ppm-types.ts';
export declare function isPpmKeyFrame(data: Uint8Array): boolean;
/** Encoded bytes of one frame (a view into the animation data). */
export declare function getPpmFrameData(animation: PpmAnimation, index: number): Uint8Array;
export type PpmLayers = [Uint8Array, Uint8Array];
/**
 * Decodes the frame at `offset` into `target`; diff frames are applied on top of `previous`
 * (which must be a different buffer pair). Throws on damaged data.
 */
export declare function decodePpmFrame(data: Uint8Array, offset: number, previous: PpmLayers, target: PpmLayers): void;
/**
 * Decodes PPM frames with diff-chain caching, so sequential access costs one frame each.
 * Returned layers are reused by the next `decode` call; copy them to keep.
 */
export declare class PpmFrameDecoder {
    private readonly animation;
    private layers;
    private scratch;
    private decodedIndex;
    constructor(file: PpmFile | PpmAnimation);
    get frameCount(): number;
    decode(index: number): PpmFrame;
    private decodeNext;
}
/** Encodes frames in playback order, choosing key or diff frames by size. */
export declare class PpmFrameEncoder {
    private previous;
    private current;
    private delta;
    private keyBuffer;
    private diffBuffer;
    private readonly keyFrameInterval;
    private sinceKeyFrame;
    /** `keyFrameInterval` forces a key frame every N frames (0 = only when smaller). */
    constructor(keyFrameInterval?: number);
    encode(frame: PpmFrame): Uint8Array;
}
/** Encodes one frame as an independent key frame. */
export declare function encodePpmKeyFrame(frame: PpmFrame): Uint8Array;
/** Packs encoded frames into the stored form; identical frames share one copy of their data. */
export declare function packPpmAnimation(frames: readonly Uint8Array[], soundFlags: ArrayLike<number>): PpmAnimation;
export declare function copyPpmFrameInfo(frame: PpmFrameInfo): PpmFrameInfo;
/** Blank frame; white paper and inverse pens unless given. */
export declare function createPpmFrame(info?: Partial<PpmFrameInfo>): PpmFrame;
export declare function clonePpmFrame(frame: PpmFrame): PpmFrame;
