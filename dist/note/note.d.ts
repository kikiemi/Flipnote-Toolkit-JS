import { type WarningHandler } from '../core/errors.ts';
import type { RsaPrivateKey } from '../core/rsa.ts';
import { type KwzFile, type KwzPaletteName } from '../kwz/kwz-types.ts';
import { type PpmFile } from '../ppm/ppm-types.ts';
export type NoteFile = PpmFile | KwzFile;
export type NoteFormat = NoteFile['format'];
export type NoteVariant = 'ppm' | KwzFile['variant'];
export interface NoteWriteOptions {
    /** Signing key (default: see setSigningKeys, then the built-in key); null for none. */
    key?: RsaPrivateKey | null;
    onWarning?: WarningHandler;
}
/** Format-independent facts about a note. */
export interface NoteInfo {
    format: NoteFormat;
    variant: NoteVariant;
    width: number;
    height: number;
    layerCount: number;
    frameCount: number;
    frameRate: number;
    bgmFrameRate: number;
    /** Duration of one playthrough in seconds. */
    duration: number;
    sampleRate: number;
    palette: Uint8Array;
}
export declare function detectFormat(bytes: Uint8Array): NoteFormat | null;
/** Reads a PPM note or a KWZ note, KWC comment or folder icon, detected by its magic bytes. */
export declare function readNote(bytes: Uint8Array): NoteFile;
export declare function writeNote(note: NoteFile, options?: NoteWriteOptions): Uint8Array;
export declare function getFrameCount(note: NoteFile): number;
export declare function getVariant(note: NoteFile): NoteVariant;
/** Name the console stores the note under on the SD card. */
export declare function getStorageFilename(note: NoteFile): string;
export declare function getFrameRates(format: NoteFormat): readonly number[];
/** Palette for rendered frames; KWZ notes can use the screen colors or the app's own. */
export declare function getPalette(note: NoteFile | NoteFormat, palette?: KwzPaletteName): Uint8Array;
export declare function getNoteInfo(note: NoteFile): NoteInfo;
