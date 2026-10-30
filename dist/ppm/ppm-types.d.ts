import type { RsaPrivateKey, RsaPublicKey } from '../core/rsa.ts';
export declare const PPM_WIDTH = 256;
export declare const PPM_HEIGHT = 192;
export declare const PPM_LAYER_SIZE: number;
export declare const PPM_LAYER_COUNT = 2;
export declare const PPM_THUMBNAIL_WIDTH = 64;
export declare const PPM_THUMBNAIL_HEIGHT = 48;
export declare const PPM_THUMBNAIL_SIZE = 1536;
export declare const PPM_SAMPLE_RATE = 8180;
/** Tick rate of the DSi's clock (33.513982 MHz / 64), which PPM filenames count in. */
export declare const PPM_TICKS_PER_SECOND: number;
/** The DSi mixes at about 32728 Hz, upsampling tracks with nearest-neighbour. */
export declare const PPM_OUTPUT_SAMPLE_RATE = 32728;
export declare const PPM_FORMAT_VERSION = 36;
export declare const PPM_MAX_FRAMES = 999;
/** The app stops adding frames once the animation data reaches this size. */
export declare const PPM_MAX_ANIMATION_SIZE = 736800;
export declare const PPM_MAX_BGM_SIZE = 245408;
export declare const PPM_MAX_SE_SIZE = 8192;
export declare const PPM_MAX_FILE_SIZE = 1048720;
export declare const PPM_SIGNATURE_SIZE = 128;
/** The signature is followed by 16 zero bytes. */
export declare const PPM_SIGNATURE_AREA_SIZE: number;
export declare const PPM_ANIMATION_OFFSET = 1696;
export declare const PPM_FRAME_TABLE_OFFSET = 1704;
export declare const PPM_SOUND_HEADER_SIZE = 32;
export declare const PPM_DEFAULT_EXTRA_FLAGS = 64;
export declare const PPM_TRACK_NAMES: readonly ['bgm', 'se1', 'se2', 'se3'];
export declare const PPM_SE_NAMES: readonly ['se1', 'se2', 'se3'];
/** Frames per second for speeds 1-8 (index 0 is unused by the app). */
export declare const PPM_FRAME_RATES: readonly number[];
export declare const PPM_PAPER_BLACK = 0;
export declare const PPM_PAPER_WHITE = 1;
/** Pen values: 0 and 1 draw the inverse of the paper, 2 red, 3 blue. */
export declare const PPM_PEN_INVERSE = 1;
export declare const PPM_PEN_RED = 2;
export declare const PPM_PEN_BLUE = 3;
export declare const PPM_COLOR_BLACK = 0;
export declare const PPM_COLOR_WHITE = 1;
export declare const PPM_COLOR_RED = 2;
export declare const PPM_COLOR_BLUE = 3;
/** Rendered colors by index: black, white, red, blue. */
export declare const PPM_PALETTE: Uint8Array<ArrayBufferLike>;
export declare const PPM_THUMBNAIL_PALETTE: Uint8Array<ArrayBufferLike>;
/** Public key Flipnote Studio (DSi) uses to verify PPM files (RSA-1024, SHA-1). */
export declare const PPM_PUBLIC_KEY: RsaPublicKey;
/** Private key Flipnote Studio (DSi) signs PPM files with. */
export declare const PPM_PRIVATE_KEY: RsaPrivateKey;
export type PpmTrackName = (typeof PPM_TRACK_NAMES)[number];
export type PpmSeName = (typeof PPM_SE_NAMES)[number];
/** `<mac>_<13 characters>_<edits>`, e.g. F78DA8_14768882B56B8_030. */
export interface PpmFilename {
    /** Last 6 hex digits of the console's MAC address (the author ID's last 6). */
    mac: string;
    /** Console ticks since 2000 when the name was made, as 13 hex digits. */
    ticks: string;
    /** Times the author saved the note again (0 for a new note or spin-off). */
    edits: number;
}
export interface PpmMeta {
    formatVersion: number;
    isLocked: boolean;
    thumbnailIndex: number;
    rootAuthorName: string;
    parentAuthorName: string;
    currentAuthorName: string;
    /** Flipnote Studio IDs as 16 uppercase hex digits. */
    rootAuthorId: string;
    parentAuthorId: string;
    currentAuthorId: string;
    parentFilename: PpmFilename;
    currentFilename: PpmFilename;
    /** 16 hex digits: the root file's MAC plus the first 10 characters of its name. */
    rootFilenameFragment: string;
    timestamp: number;
    frameSpeed: number;
    bgmSpeed: number;
    isLooping: boolean;
    isLayerVisible: [boolean, boolean];
    /** Animation flag bits other than loop and layer visibility. */
    extraFlags: number;
}
/** Encoded frames exactly as stored in the file. */
export interface PpmAnimation {
    /** Frame data region; frames may share data and appear in any order. */
    data: Uint8Array;
    /** Start of each frame in `data`, in playback order. */
    offsets: Uint32Array;
    /** One byte per frame: bit 0-2 play SE1-SE3. */
    soundFlags: Uint8Array;
}
/** Encoded IMA ADPCM tracks including their 4-byte headers; empty when absent. */
export type PpmTracks = Record<PpmTrackName, Uint8Array>;
export interface PpmFile {
    readonly format: 'ppm';
    meta: PpmMeta;
    /** Raw 64x48 4-bit tiled thumbnail. */
    thumbnail: Uint8Array;
    animation: PpmAnimation;
    tracks: PpmTracks;
    signature: Uint8Array;
    /** The bytes the file was read from; unknown bytes are copied from here on write. */
    source: Uint8Array | null;
}
/** Per-frame values besides the pixels. */
export interface PpmFrameInfo {
    /** 0 black, 1 white. */
    paper: number;
    /** Pen per layer: 0 and 1 draw the inverse of the paper, 2 red, 3 blue. */
    pens: [number, number];
    /** Bit 0-2 play SE1-SE3. */
    soundFlags: number;
}
/** A decoded frame: two 1-byte-per-pixel layers (0 or 1); layer 1 is drawn on top. */
export interface PpmFrame extends PpmFrameInfo {
    layers: [Uint8Array, Uint8Array];
}
