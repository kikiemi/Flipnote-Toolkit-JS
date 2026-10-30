export interface Mp4VideoTrack {
    width: number;
    height: number;
    timescale: number;
    sps: Uint8Array;
    pps: Uint8Array;
    /** H.264 color description written to the colr box. */
    colorMatrix: 'bt601' | 'bt709';
    samples: {
        data: Uint8Array;
        duration: number;
        isKey: boolean;
    }[];
}
export interface Mp4AudioTrack {
    sampleRate: number;
    config: Uint8Array;
    frames: Uint8Array[];
    /** Encoder delay trimmed by the edit list. */
    priming: number;
    /** Playable length in samples. */
    length: number;
    bitrate: number;
}
/** AVCDecoderConfigurationRecord (the avcC box body, also WebCodecs' description). */
export declare function createAvcConfig(sps: Uint8Array, pps: Uint8Array): Uint8Array;
/** RFC 6381 codec string, e.g. avc1.42c01e. */
export declare function getAvcCodecString(sps: Uint8Array): string;
/** Writes a progressive MP4 (moov before mdat) with an H.264 video track and an optional AAC track. */
export declare function muxMp4(video: Mp4VideoTrack, audio?: Mp4AudioTrack | null): Uint8Array;
