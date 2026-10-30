import type { RsaPrivateKey } from '../core/rsa.ts';
import { type NoteFile, type NoteFormat, type NoteVariant } from './note.ts';
import { type NoteAuthor } from './save.ts';
export type IssueLevel = 'error' | 'warning' | 'info';
export type IssueCode = 'unreadable' | 'signature' | 'checksum' | 'structure' | 'frame-data' | 'frame-limit' | 'memory-limit' | 'file-size' | 'track-length' | 'thumbnail' | 'speed' | 'colors' | 'author' | 'filename' | 'locked' | 'dsi-library';
export interface Issue {
    code: IssueCode;
    /** 'error': the console will reject or misplay the file; 'warning': beyond app limits. */
    level: IssueLevel;
    message: string;
    /** Whether repairNote() can fix it (signatures need a key). */
    isRepairable: boolean;
    frame?: number;
}
export interface CheckReport {
    format: NoteFormat | null;
    variant: NoteVariant | null;
    isReadable: boolean;
    isSigned: boolean;
    /** True when no error-level issue was found, i.e. the console should accept the file. */
    isCompatible: boolean;
    issues: Issue[];
}
export interface CheckOptions {
    /** Decode every frame to find damaged frame data (default true). */
    isCheckingFrames?: boolean;
}
/**
 * Checks whether the console would accept a file: structure, checksums, signature,
 * app limits and frame data. Never throws for malformed input.
 */
export declare function checkNote(bytes: Uint8Array, options?: CheckOptions): CheckReport;
export interface PreflightOptions extends CheckOptions {
    /** Signing key (default: see setSigningKeys, then the built-in key). */
    key?: RsaPrivateKey;
    /** Who saves the note; locked notes of other authors are reported. */
    author?: NoteAuthor;
}
export interface PreflightReport extends CheckReport {
    /** The file as it would be saved. */
    bytes: Uint8Array;
}
/**
 * Checks a note before saving: everything checkNote() finds in the file it would produce,
 * plus a missing or mismatched signing key, a lock held by another author and writer warnings.
 */
export declare function preflightNote(note: NoteFile, options?: PreflightOptions): PreflightReport;
