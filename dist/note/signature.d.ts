import { type RsaPrivateKey, type RsaPublicKey } from '../core/rsa.ts';
import type { NoteFormat } from './note.ts';
/** Signing keys by note format. */
export type SigningKeys = Partial<Record<NoteFormat, RsaPrivateKey>>;
/**
 * Sets keys that writing, signing, repairing and saving use instead of the built-in ones when
 * none is passed. By default keys in `$FLIPNOTE_KEYS`, then `keys/`, are used when present
 * (Node.js); null goes back to that.
 */
export declare function setSigningKeys(keys: SigningKeys | null): void;
/** The keys used when none is passed: set or found ones first, then the built-in keys. */
export declare function getSigningKeys(): Required<SigningKeys>;
/** Tells which app a key pair belongs to by comparing it with the known public keys. */
export declare function identifyKey(key: RsaPublicKey): NoteFormat | null;
/** Extracts the PPM and KWZ signing keys from any data that embeds them (app code, PEM, source text). */
export declare function findSigningKeys(...sources: Uint8Array[]): SigningKeys;
/** Returns a copy of a PPM with a fresh signature (default key: see setSigningKeys). */
export declare function signPpm(bytes: Uint8Array, key?: RsaPrivateKey): Uint8Array;
export declare function verifyPpm(bytes: Uint8Array, key?: RsaPublicKey): boolean;
/** Returns a copy of a KWZ/KWC with its signature replaced or appended (default key: see setSigningKeys). */
export declare function signKwz(bytes: Uint8Array, key?: RsaPrivateKey): Uint8Array;
export declare function verifyKwz(bytes: Uint8Array, key?: RsaPublicKey): boolean;
/** Signs a PPM or KWZ file, detected by its magic bytes (default key: see setSigningKeys). */
export declare function signNote(bytes: Uint8Array, key?: RsaPrivateKey): Uint8Array;
/** Verifies a PPM or KWZ signature against the app's public key (or `key`). */
export declare function verifyNote(bytes: Uint8Array, key?: RsaPublicKey): boolean;
