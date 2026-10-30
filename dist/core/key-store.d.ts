import { type RsaPrivateKey, type RsaPublicKey } from './rsa.ts';
/** Directory signing keys are kept in: `keys/` in the working directory. */
export declare const DEFAULT_KEY_DIRECTORY = "keys";
/** Places signing keys are read from: `$FLIPNOTE_KEYS`, then `keys/` (Node.js only). */
export declare function getDefaultKeyPaths(): string[];
/** Replaces the default signing keys; null reads the default places again when next needed. */
export declare function setDefaultKeys(keys: readonly RsaPrivateKey[] | null): void;
/** The default private key of `publicKey`; the default places are read on first use. */
export declare function findDefaultKey(publicKey: RsaPublicKey): RsaPrivateKey | null;
/**
 * The key a writer signs with: the one passed (null for none); otherwise none while the
 * original signature still matches the content, so unchanged files stay byte-identical; otherwise
 * the default key, or the built-in one when there is no default.
 */
export declare function chooseSigningKey(key: RsaPrivateKey | null | undefined, builtInKey: RsaPrivateKey, isOriginalValid: () => boolean): RsaPrivateKey | null;
