import { type KwzFile, type KwzFrame, type KwzFrameInfo, type KwzFrameRecord } from './kwz-types.ts';
/**
 * Decodes one compressed layer on top of `layer` (unchanged tiles are skipped).
 * Truncated data reads as empty tiles like the app does, or, when `isTolerant`,
 * leaves the remaining tiles unchanged. Returns false when the data ran out.
 */
export declare function decodeKwzLayer(data: Uint8Array, layer: Uint8Array, isTolerant?: boolean): boolean;
export interface KwzLayerStats {
    /** Tiles per compression type 0-7 (type 5 counts skip instructions). */
    tileTypes: Uint32Array;
    /** Tiles left unchanged from the previous frame. */
    skippedTiles: number;
    /** Bytes the stream needs; more than the data length when truncated. */
    byteLength: number;
}
/** Walks a compressed layer without decoding pixels. */
export declare function analyzeKwzLayer(data: Uint8Array): KwzLayerStats;
export interface KwzDecoderOptions {
    /** Keep tiles from the previous frame where layer data is truncated (for recovery). */
    isTolerant?: boolean;
}
/**
 * Decodes KWZ frames, following each layer's diff chain independently.
 * Returned layers are reused by the next `decode` call; copy them to keep.
 */
export declare class KwzFrameDecoder {
    private readonly frames;
    private readonly layers;
    private readonly isTolerant;
    private decodedIndex;
    /** Layers of the last decoded frame whose data was truncated. */
    truncatedLayers: number;
    constructor(file: KwzFile | readonly KwzFrameRecord[], options?: KwzDecoderOptions);
    get frameCount(): number;
    decode(index: number): KwzFrame;
}
export declare function copyKwzFrameInfo(frame: KwzFrameInfo): KwzFrameInfo;
/** Compresses a layer; with `previous`, unchanged tiles are skipped. */
export declare function encodeKwzLayer(layer: Uint8Array, previous: Uint8Array | null): {
    data: Uint8Array;
    isKey: boolean;
};
export interface KwzEncodedFrame {
    layerData: [Uint8Array, Uint8Array, Uint8Array];
    keyLayers: number;
}
/** Encodes frames in playback order; layers only store tiles that changed. */
export declare class KwzFrameEncoder {
    private previous;
    private readonly keyFrameInterval;
    private sinceKeyFrame;
    /** `keyFrameInterval` makes every Nth frame independent (0 = never forced). */
    constructor(keyFrameInterval?: number);
    encode(frame: KwzFrame): KwzEncodedFrame;
}
/** Encodes every layer independently of the previous frame. */
export declare function encodeKwzKeyFrame(frame: KwzFrame): KwzEncodedFrame;
export declare function createKwzFrame(info?: Partial<KwzFrameInfo>): KwzFrame;
export declare function cloneKwzFrame(frame: KwzFrame): KwzFrame;
