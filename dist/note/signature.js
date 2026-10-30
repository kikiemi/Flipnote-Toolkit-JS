import { check, fail, FlipnoteError } from '../core/errors.js';
import { findDefaultKey, setDefaultKeys } from '../core/key-store.js';
import { findRsaPrivateKeys, isSameKey, rsaSign, rsaVerify, } from '../core/rsa.js';
import { isKwz, readKwzSections } from '../kwz/kwz-reader.js';
import { KWZ_PRIVATE_KEY, KWZ_PUBLIC_KEY, KWZ_SIGNATURE_SIZE } from '../kwz/kwz-types.js';
import { isPpm, readPpmLayout } from '../ppm/ppm-reader.js';
import { PPM_PRIVATE_KEY, PPM_PUBLIC_KEY, PPM_SIGNATURE_AREA_SIZE, PPM_SIGNATURE_SIZE, } from '../ppm/ppm-types.js';
/**
 * Sets keys that writing, signing, repairing and saving use instead of the built-in ones when
 * none is passed. By default keys in `$FLIPNOTE_KEYS`, then `keys/`, are used when present
 * (Node.js); null goes back to that.
 */
export function setSigningKeys(keys) {
    if (!keys)
        return setDefaultKeys(null);
    for (const format of ['ppm', 'kwz']) {
        const key = keys[format];
        check(!key || identifyKey(key) === format, 'INVALID_KEY', `That is not the ${format.toUpperCase()} signing key`);
    }
    setDefaultKeys([keys.ppm, keys.kwz].filter((key) => !!key));
}
/** The keys used when none is passed: set or found ones first, then the built-in keys. */
export function getSigningKeys() {
    return {
        ppm: findDefaultKey(PPM_PRIVATE_KEY) ?? PPM_PRIVATE_KEY,
        kwz: findDefaultKey(KWZ_PRIVATE_KEY) ?? KWZ_PRIVATE_KEY,
    };
}
/** Tells which app a key pair belongs to by comparing it with the known public keys. */
export function identifyKey(key) {
    if (isSameKey(key, PPM_PUBLIC_KEY))
        return 'ppm';
    if (isSameKey(key, KWZ_PUBLIC_KEY))
        return 'kwz';
    return null;
}
/** Extracts the PPM and KWZ signing keys from any data that embeds them (app code, PEM, source text). */
export function findSigningKeys(...sources) {
    const keys = {};
    for (const source of sources) {
        for (const key of findRsaPrivateKeys(source)) {
            const format = identifyKey(key);
            if (format)
                keys[format] = key;
        }
    }
    return keys;
}
/** Returns a copy of a PPM with a fresh signature (default key: see setSigningKeys). */
export function signPpm(bytes, key = getSigningKeys().ppm) {
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
export function verifyPpm(bytes, key = PPM_PUBLIC_KEY) {
    if (!isPpm(bytes) || bytes.length <= PPM_SIGNATURE_AREA_SIZE)
        return false;
    const end = bytes.length - PPM_SIGNATURE_AREA_SIZE;
    return rsaVerify(key, 'sha1', bytes.subarray(0, end), bytes.subarray(end, end + PPM_SIGNATURE_SIZE), false);
}
/** Returns a copy of a KWZ/KWC with its signature replaced or appended (default key: see setSigningKeys). */
export function signKwz(bytes, key = getSigningKeys().kwz) {
    check(isKwz(bytes), 'INVALID_FORMAT', 'Not a KWZ file');
    const { bodyLength } = readKwzSections(bytes);
    const out = new Uint8Array(bodyLength + KWZ_SIGNATURE_SIZE);
    out.set(bytes.subarray(0, bodyLength));
    out.set(rsaSign(key, 'sha256', out.subarray(0, bodyLength)), bodyLength);
    return out;
}
export function verifyKwz(bytes, key = KWZ_PUBLIC_KEY) {
    if (!isKwz(bytes))
        return false;
    let bodyLength = 0;
    try {
        bodyLength = readKwzSections(bytes).bodyLength;
    }
    catch (error) {
        if (error instanceof FlipnoteError)
            return false;
        throw error;
    }
    if (bytes.length - bodyLength !== KWZ_SIGNATURE_SIZE)
        return false;
    return rsaVerify(key, 'sha256', bytes.subarray(0, bodyLength), bytes.subarray(bodyLength));
}
/** Signs a PPM or KWZ file, detected by its magic bytes (default key: see setSigningKeys). */
export function signNote(bytes, key) {
    if (isPpm(bytes))
        return signPpm(bytes, key);
    if (isKwz(bytes))
        return signKwz(bytes, key);
    return fail('INVALID_FORMAT', 'Unknown file format (expected PPM or KWZ)');
}
/** Verifies a PPM or KWZ signature against the app's public key (or `key`). */
export function verifyNote(bytes, key) {
    if (isPpm(bytes))
        return verifyPpm(bytes, key);
    if (isKwz(bytes))
        return verifyKwz(bytes, key);
    return false;
}
