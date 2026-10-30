import { type WarningHandler } from '../core/errors.ts';
import { type CheckReport } from './check.ts';
import { type NoteFile, type NoteFormat } from './note.ts';
import type { SigningKeys } from './signature.ts';
export interface RepairOptions {
    /** Signing keys (default: see setSigningKeys, then the built-in keys). */
    keys?: SigningKeys;
    onWarning?: WarningHandler;
}
export interface RepairResult {
    /** The repaired note, or null when nothing could be recovered. */
    note: NoteFile | null;
    /** The repaired file, ready to save. */
    bytes: Uint8Array | null;
    /** What was changed, in order. */
    actions: string[];
    /** Frames whose data was lost and replaced by the previous picture. */
    damagedFrames: number[];
    before: CheckReport;
    after: CheckReport | null;
}
/**
 * Repairs a damaged PPM or KWZ: fixes sizes, counts, checksums, speeds and thumbnails,
 * recovers every frame that can still be decoded and signs the result.
 */
export declare function repairNote(bytes: Uint8Array, options?: RepairOptions): RepairResult;
export interface CarvedNote {
    offset: number;
    format: NoteFormat;
    bytes: Uint8Array;
    /** False when the file runs past the end of the data. */
    isComplete: boolean;
}
/** Finds PPM and KWZ files embedded in other data, such as SD card or NAND images. */
export declare function carveNotes(bytes: Uint8Array): CarvedNote[];
