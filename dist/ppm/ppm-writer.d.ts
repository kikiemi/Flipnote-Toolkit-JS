import { type WarningHandler } from '../core/errors.ts';
import { type RsaPrivateKey } from '../core/rsa.ts';
import { type PpmFile } from './ppm-types.ts';
export interface PpmWriteOptions {
    /** Signing key (default: see setSigningKeys, then the built-in key); null for none. */
    key?: RsaPrivateKey | null;
    onWarning?: WarningHandler;
}
/**
 * Serializes a PPM file. Bytes the model does not describe (padding, unused fields)
 * are copied from `file.source` when the layout is unchanged, so an unmodified file
 * is written back identically and keeps its signature.
 */
export declare function writePpm(file: PpmFile, options?: PpmWriteOptions): Uint8Array;
