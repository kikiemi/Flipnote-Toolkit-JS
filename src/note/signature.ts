import { check, fail, FlipnoteError } from '../core/errors.ts';
import { findDefaultKey, setDefaultKeys } from '../core/key-store.ts';
import {
  findRsaPrivateKeys,
  isSameKey,
  rsaSign,
  rsaVerify,
  type RsaPrivateKey,
  type RsaPublicKey,
} from '../core/rsa.ts';
import { isKwz, readKwzSections } from '../kwz/kwz-reader.ts';
import { KWZ_PRIVATE_KEY, KWZ_PUBLIC_KEY, KWZ_SIGNATURE_SIZE } from '../kwz/kwz-types.ts';
import { isPpm, readPpmLayout } from '../ppm/ppm-reader.ts';
import {
  PPM_PRIVATE_KEY,
  PPM_PUBLIC_KEY,
  PPM_SIGNATURE_AREA_SIZE,
  PPM_SIGNATURE_SIZE,
} from '../ppm/ppm-types.ts';
import type { NoteFormat } from './note.ts';

/** Signing keys by note format. */
export type SigningKeys = Partial<Record<NoteFormat, RsaPrivateKey>>;

/**
 * Sets keys that writing, signing, repairing and saving use instead of the built-in ones when
 * none is passed. By default keys in `$FLIPNOTE_KEYS`, then `keys/`, are used when present
 * (Node.js); null goes back to that.
 */
export function setSigningKeys(keys: SigningKeys | null): void {
  if (!keys) return setDefaultKeys(null);
  for (const format of ['ppm', 'kwz'] as const) {
    const key = keys[format];
    check(
      !key || identifyKey(key) === format,
      'INVALID_KEY',
      `That is not the ${format.toUpperCase()} signing key`,
    );
  }
  setDefaultKeys([keys.ppm, keys.kwz].filter((key): key is RsaPrivateKey => !!key));
}

/** The keys used when none is passed: set or found ones first, then the built-in keys. */
export function getSigningKeys(): Required<SigningKeys> {
  return {
    ppm: findDefaultKey(PPM_PRIVATE_KEY) ?? PPM_PRIVATE_KEY,
    kwz: findDefaultKey(KWZ_PRIVATE_KEY) ?? KWZ_PRIVATE_KEY,
  };
}

/** Tells which app a key pair belongs to by comparing it with the known public keys. */
export function identifyKey(key: RsaPublicKey): NoteFormat | null {
  if (isSameKey(key, PPM_PUBLIC_KEY)) return 'ppm';
  if (isSameKey(key, KWZ_PUBLIC_KEY)) return 'kwz';
  return null;
}

/** Extracts the PPM and KWZ signing keys from any data that embeds them (app code, PEM, source text). */
export function findSigningKeys(...sources: Uint8Array[]): SigningKeys {
  const keys: SigningKeys = {};
  for (const source of sources) {
    for (const key of findRsaPrivateKeys(source)) {
      const format = identifyKey(key);
      if (format) keys[format] = key;
    }
  }
  return keys;
}

/** Returns a copy of a PPM with a fresh signature (default key: see setSigningKeys). */
export function signPpm(bytes: Uint8Array, key = getSigningKeys().ppm): Uint8Array {
  check(isPpm(bytes), 'INVALID_FORMAT', 'Not a PPM file');
  const layout = readPpmLayout(bytes);
  check(layout, 'CORRUPT_DATA', 'PPM size fields are inconsistent or the file is truncated');
  const out = new Uint8Array(layout.fileSize);
  const end = layout.soundEnd;
  out.set(bytes.subarray(0, end));
  const signature = rsaSign(key, 'sha1', out.subarray(0, end));
  check(signature.length === PPM_SIGNATURE_SIZE, 'INVALID_KEY', 'PPM signatures must be 128 bytes');
  out.set(signature, end);
  return out;
}

export function verifyPpm(bytes: Uint8Array, key: RsaPublicKey = PPM_PUBLIC_KEY): boolean {
  if (!isPpm(bytes) || bytes.length <= PPM_SIGNATURE_AREA_SIZE) return false;
  const end = bytes.length - PPM_SIGNATURE_AREA_SIZE;
  return rsaVerify(
    key,
    'sha1',
    bytes.subarray(0, end),
    bytes.subarray(end, end + PPM_SIGNATURE_SIZE),
    false,
  );
}

/** Returns a copy of a KWZ/KWC with its signature replaced or appended (default key: see setSigningKeys). */
export function signKwz(bytes: Uint8Array, key = getSigningKeys().kwz): Uint8Array {
  check(isKwz(bytes), 'INVALID_FORMAT', 'Not a KWZ file');
  const { bodyLength } = readKwzSections(bytes);
  const out = new Uint8Array(bodyLength + KWZ_SIGNATURE_SIZE);
  out.set(bytes.subarray(0, bodyLength));
  out.set(rsaSign(key, 'sha256', out.subarray(0, bodyLength)), bodyLength);
  return out;
}

export function verifyKwz(bytes: Uint8Array, key: RsaPublicKey = KWZ_PUBLIC_KEY): boolean {
  if (!isKwz(bytes)) return false;
  let bodyLength = 0;
  try {
    bodyLength = readKwzSections(bytes).bodyLength;
  } catch (error) {
    if (error instanceof FlipnoteError) return false;
    throw error;
  }
  if (bytes.length - bodyLength !== KWZ_SIGNATURE_SIZE) return false;
  return rsaVerify(key, 'sha256', bytes.subarray(0, bodyLength), bytes.subarray(bodyLength));
}

/** Signs a PPM or KWZ file, detected by its magic bytes (default key: see setSigningKeys). */
export function signNote(bytes: Uint8Array, key?: RsaPrivateKey): Uint8Array {
  if (isPpm(bytes)) return signPpm(bytes, key);
  if (isKwz(bytes)) return signKwz(bytes, key);
  return fail('INVALID_FORMAT', 'Unknown file format (expected PPM or KWZ)');
}

/** Verifies a PPM or KWZ signature against the app's public key (or `key`). */
export function verifyNote(bytes: Uint8Array, key?: RsaPublicKey): boolean {
  if (isPpm(bytes)) return verifyPpm(bytes, key);
  if (isKwz(bytes)) return verifyKwz(bytes, key);
  return false;
}
