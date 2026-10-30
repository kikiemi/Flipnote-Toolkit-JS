import type { RsaPrivateKey, RsaPublicKey } from '../core/rsa.ts';
export declare const KWZ_WIDTH = 320;
export declare const KWZ_HEIGHT = 240;
export declare const KWZ_LAYER_SIZE: number;
export declare const KWZ_LAYER_COUNT = 3;
export declare const KWZ_THUMBNAIL_WIDTH = 80;
export declare const KWZ_THUMBNAIL_HEIGHT = 64;
export declare const KWZ_SAMPLE_RATE = 16364;
/** DSi Library conversions store audio at twice the PPM rate the converter assumed. */
export declare const KWZ_DSI_LIBRARY_SAMPLE_RATE = 16384;
export declare const KWZ_MAX_FRAMES = 999;
export declare const KWZ_MAX_BGM_SECONDS = 60;
export declare const KWZ_MAX_SE_SECONDS = 2;
export declare const KWZ_MAX_DEPTH = 6;
export declare const KWZ_SIGNATURE_SIZE = 256;
/** App version written by the last release of Flipnote Studio 3D. */
export declare const KWZ_APP_VERSION = 734;
export declare const KWZ_HEADER_SIZE = 204;
export declare const KWZ_FRAME_META_SIZE = 28;
export declare const KWZ_SOUND_HEADER_SIZE = 28;
/** Author ID of headers and frames that have none. */
export declare const KWZ_EMPTY_AUTHOR_ID: string;
/** Frame flags written by app version 734 (bit 7). */
export declare const KWZ_DEFAULT_FRAME_EXTRA_FLAGS = 128;
export declare const KWZ_TRACK_NAMES: readonly ['bgm', 'se1', 'se2', 'se3', 'se4'];
export declare const KWZ_SE_NAMES: readonly ['se1', 'se2', 'se3', 'se4'];
/** Area the 3DS lets you draw on; the 5-pixel border stays empty. */
export declare const KWZ_CANVAS_RECT: {
    readonly x: 5;
    readonly y: 5;
    readonly width: 310;
    readonly height: 230;
};
/** Where DSi Library conversions place the 256x192 PPM picture. */
export declare const KWZ_DSI_LIBRARY_RECT: {
    readonly x: 32;
    readonly y: 24;
    readonly width: 256;
    readonly height: 192;
};
/** Memory meter capacity of Flipnote Studio 3D (from its function at 0x002b4224). */
export declare const KWZ_MEMORY_LIMIT: number;
/** Fixed amount the meter adds on top of the frame data. */
export declare const KWZ_MEMORY_BASE = 57600;
/** Frame data a KWZ can hold before its memory meter is full. */
export declare const KWZ_MAX_FRAME_DATA_SIZE: number;
/** Frames per second for speeds 0-10. */
export declare const KWZ_FRAME_RATES: readonly number[];
export declare const KWZ_COLOR_WHITE = 0;
export declare const KWZ_COLOR_BLACK = 1;
export declare const KWZ_COLOR_RED = 2;
export declare const KWZ_COLOR_YELLOW = 3;
export declare const KWZ_COLOR_GREEN = 4;
export declare const KWZ_COLOR_BLUE = 5;
export declare const KWZ_COLOR_NONE = 6;
/**
 * Colors as the 3DS screen shows them: the app's colors after the RGB555 framebuffer.
 * Index 6 (no paper) is transparent.
 */
export declare const KWZ_PALETTE: Uint8Array<ArrayBufferLike>;
/** Colors stored in the app itself, used by its own GIF export. */
export declare const KWZ_APP_PALETTE: Uint8Array<ArrayBufferLike>;
/** Public key Flipnote Studio 3D uses to verify KWZ files (RSA-2048, SHA-256). */
export declare const KWZ_PUBLIC_KEY: RsaPublicKey;
/** Private key Flipnote Studio 3D signs KWZ files with. */
export declare const KWZ_PRIVATE_KEY: RsaPrivateKey;
export type KwzSectionName = 'KFH' | 'KTN' | 'KMC' | 'KMI' | 'KSN' | 'KIC';
/** Section magic version bytes as written by Flipnote Studio 3D. */
export declare const KWZ_SECTION_VERSIONS: Readonly<Record<KwzSectionName, number>>;
export declare const KWZ_SECTION_NAMES: KwzSectionName[];
export interface KwzSection {
    name: KwzSectionName;
    /** Fourth byte of the section magic (a per-section version). */
    version: number;
    /** Offset of the section header. */
    offset: number;
    /** Body size, excluding the 8-byte header. */
    size: number;
}
export type KwzPaletteName = 'screen' | 'app';
export type KwzTrackName = (typeof KWZ_TRACK_NAMES)[number];
export type KwzSeName = (typeof KWZ_SE_NAMES)[number];
/** `kwz` notes, `kwc` handwritten comments, `icon` folder icons. */
export type KwzVariant = 'kwz' | 'kwc' | 'icon';
export interface KwzMeta {
    createdTime: number;
    modifiedTime: number;
    appVersion: number;
    /** Author IDs as 20 lowercase hex digits (raw 10 bytes). */
    rootAuthorId: string;
    parentAuthorId: string;
    currentAuthorId: string;
    rootAuthorName: string;
    parentAuthorName: string;
    currentAuthorName: string;
    /**
     * 28-character base32 names, also used as file names on the SD card.
     * DSi Library conversions may hold a PPM filename such as `F78DA8_14768882B56B8_030`.
     */
    rootFilename: string;
    parentFilename: string;
    currentFilename: string;
    thumbnailIndex: number;
    frameSpeed: number;
    bgmSpeed: number;
    isLocked: boolean;
    isLooping: boolean;
    /** Saved with the advanced tool set enabled. */
    isToolset: boolean;
    /** Saved while the 3D slider was on. */
    is3d: boolean;
    /** Header flag bits other than lock, loop, toolset and 3D. */
    extraFlags: number;
    isLayerVisible: [boolean, boolean, boolean];
    extraLayerFlags: number;
}
/** Per-frame values shared by encoded records and decoded frames. */
export interface KwzFrameInfo {
    paper: number;
    /** Color indices: layer A 1/2, layer B 1/2, layer C 1/2. */
    colors: [number, number, number, number, number, number];
    /** 3D depth per layer, 0 (front) to 6. */
    layerDepths: [number, number, number];
    /** Bit 0-3 play SE1-SE4. */
    soundFlags: number;
    cameraFlags: number;
    /** ID of the author who last changed this frame. */
    authorId: string;
}
/** One encoded frame as stored in KMC/KMI. */
export interface KwzFrameRecord extends KwzFrameInfo {
    layerData: [Uint8Array, Uint8Array, Uint8Array];
    /** Bit per layer (A=1, B=2, C=4) set when the layer does not depend on the previous frame. */
    keyLayers: number;
    /** Frame flag bit 7 (set by the latest app versions). */
    extraFlags: number;
    reserved: number;
}
/** A decoded frame: three 1-byte-per-pixel layers holding 0 (empty), 1 or 2 (layer colors). */
export interface KwzFrame extends KwzFrameInfo {
    layers: [Uint8Array, Uint8Array, Uint8Array];
}
export type KwzTracks = Record<KwzTrackName, Uint8Array>;
export interface KwzFile {
    readonly format: 'kwz';
    variant: KwzVariant;
    meta: KwzMeta;
    /** JPEG thumbnail, or null when the file has none. */
    thumbnail: Uint8Array | null;
    frames: KwzFrameRecord[];
    /** Encoded ADPCM tracks, or null when the file has no sound section. */
    tracks: KwzTracks | null;
    signature: Uint8Array | null;
    /** The bytes the file was read from; unchanged sections are copied from here on write. */
    source: Uint8Array | null;
}
