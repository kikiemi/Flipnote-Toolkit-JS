/** Planar 4:2:0 picture padded to whole macroblocks (strides = padded width, padded width / 2). */
export interface YuvFrame {
    y: Uint8Array;
    u: Uint8Array;
    v: Uint8Array;
}
export interface H264Options {
    /** Quantizer 0-51 (default 20); lower is better quality. */
    qp?: number;
    /** Frames between IDR pictures (default 300). */
    keyFrameInterval?: number;
    /** Signalled color matrix; must match how YUV was produced (default bt601). */
    colorMatrix?: 'bt601' | 'bt709';
}
export interface H264Sample {
    /** One access unit as 4-byte length-prefixed NAL units (MP4 sample format). */
    data: Uint8Array;
    isKey: boolean;
}
/**
 * Baseline-profile H.264 encoder (CAVLC, intra 4x4/16x16, P skip and zero-motion residual, no deblocking).
 * Its reconstruction matches any conforming decoder bit for bit.
 */
export declare class H264Encoder {
    readonly width: number;
    readonly height: number;
    readonly mbWidth: number;
    readonly mbHeight: number;
    readonly paddedWidth: number;
    readonly paddedHeight: number;
    readonly level: number;
    readonly sps: Uint8Array;
    readonly pps: Uint8Array;
    private readonly qp;
    private readonly chromaQp;
    private readonly lambda;
    private readonly keyFrameInterval;
    private recon;
    private reference;
    private previousSource;
    private hasPreviousSource;
    private source;
    private frameNumber;
    private sinceKey;
    private idrCount;
    private isIntraFrame;
    private readonly states;
    private readonly candidates;
    private readonly diff;
    private readonly coefficients;
    private readonly residual;
    private readonly scan;
    private readonly prediction16;
    private readonly prediction4;
    private readonly bestPrediction4;
    private readonly edge;
    private readonly lumaLevels;
    private readonly lumaDc;
    private readonly lumaDcLevels;
    private readonly lumaDcValues;
    private readonly modeCodes;
    private readonly chromaPredictions;
    private readonly chromaLevels;
    private readonly chromaDc;
    private chromaMode;
    private chromaCbp;
    constructor(width: number, height: number, frameRate: number, options?: H264Options);
    createFrame(): YuvFrame;
    /** Last reconstructed picture (what decoders will display). */
    get reconstruction(): YuvFrame;
    private createSps;
    private createPps;
    /** Encodes one picture; `forceKey` starts a new IDR. */
    encode(frame: YuvFrame, forceKey?: boolean): H264Sample;
    private state;
    /** True when the macroblock equals `other` in all three planes. */
    private isSameAs;
    private markSkip;
    /** Picks the cheapest mode; returns its candidate, or null for P_Skip. */
    private encodeMacroblock;
    private distortion;
    /** Copies the macroblock between a frame and a 384-byte buffer (Y, then U, then V). */
    private transferMacroblock;
    private saveMacroblock;
    private restoreMacroblock;
    private copyReference;
    /** nC for a luma block at raster (bx, by) in 4x4 units of the current macroblock. */
    private lumaContext;
    private chromaContext;
    /** Intra 16x16 prediction for `mode` into prediction16; false when neighbors are missing. */
    private predict16;
    /** Loads source minus `prediction` (stride 16) for the 4x4 block at pixel (x, y) of the macroblock. */
    private loadDiff;
    /** Encodes as Intra 16x16; returns true when the reconstruction equals the source exactly. */
    private encodeIntra16;
    /** Fills the 4x4 edge [L3..L0, TL, T0..T7] and returns availability bits (1 top, 2 left, 4 top-left). */
    private loadEdge;
    private encodeIntra4;
    private reconstructBlock;
    /** Writes qp delta and 4x4 luma blocks for I4x4 and P16x16 macroblocks. */
    private writeLumaResidual;
    private encodeInter;
    private chooseChromaMode;
    /** Intra chroma prediction (8.3.4) for one 8x8 block. */
    private predictChroma;
    /** Transforms, quantizes and reconstructs both chroma planes; mode -1 predicts from the reference. */
    private encodeChroma;
    private writeChroma;
}
