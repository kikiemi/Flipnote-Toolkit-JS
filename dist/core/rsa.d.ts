import { type HashAlgorithm } from './sha.ts';
export interface RsaPublicKey {
    readonly n: bigint;
    readonly e: bigint;
}
export interface RsaPrivateKey extends RsaPublicKey {
    readonly d: bigint;
    readonly p: bigint;
    readonly q: bigint;
    readonly dp: bigint;
    readonly dq: bigint;
    readonly qi: bigint;
}
/** Parses a PEM, DER or base64 RSA private key (PKCS#1 or PKCS#8). */
export declare function parseRsaPrivateKey(input: string | Uint8Array): RsaPrivateKey;
/** Parses a PEM, DER or base64 RSA public key (SPKI or PKCS#1); private keys are reduced. */
export declare function parseRsaPublicKey(input: string | Uint8Array): RsaPublicKey;
/** Encodes a private key as PKCS#1 DER or PEM. */
export declare function encodeRsaPrivateKey(key: RsaPrivateKey, form?: 'pem' | 'der'): string | Uint8Array;
/** Encodes a public key as SPKI DER or PEM. */
export declare function encodeRsaPublicKey(key: RsaPublicKey, form?: 'pem' | 'der'): string | Uint8Array;
/** Finds RSA private keys embedded as DER in binaries or as base64/PEM in text. */
export declare function findRsaPrivateKeys(data: Uint8Array): RsaPrivateKey[];
/** RSASSA-PKCS1-v1_5 signature. */
export declare function rsaSign(key: RsaPrivateKey, algorithm: HashAlgorithm, message: Uint8Array): Uint8Array;
export declare function rsaVerify(key: RsaPublicKey, algorithm: HashAlgorithm, message: Uint8Array, signature: Uint8Array, isStrict?: boolean): boolean;
export declare function isSameKey(a: RsaPublicKey, b: RsaPublicKey): boolean;
