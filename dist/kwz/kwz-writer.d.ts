import { type WarningHandler } from '../core/errors.ts';
import { type RsaPrivateKey } from '../core/rsa.ts';
import { type KwzFile } from './kwz-types.ts';
export interface KwzWriteOptions {
    /** Signing key (default: see setSigningKeys, then the built-in key); null for none. */
    key?: RsaPrivateKey | null;
    onWarning?: WarningHandler;
}
/**
 * Serializes a KWZ note, comment or folder icon. Sections whose content is unchanged
 * are copied from `file.source` with their original padding, so an unmodified file
 * is written back identically and keeps its signature.
 */
export declare function writeKwz(file: KwzFile, options?: KwzWriteOptions): Uint8Array;
