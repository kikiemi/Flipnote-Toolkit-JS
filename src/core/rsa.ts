import { concatBytes, isEqualBytes } from './bytes.ts';
import { check } from './errors.ts';
import { hash, type HashAlgorithm } from './sha.ts';
import { bytesToHex, decodeBase64, encodeBase64, hexToBytes } from './text.ts';

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

const DIGEST_INFO: Record<HashAlgorithm, Uint8Array> = {
  sha1: hexToBytes('3021300906052b0e03021a05000414'),
  sha256: hexToBytes('3031300d060960864801650304020105000420'),
};
const RSA_OID = hexToBytes('2a864886f70d010101');
const BASE64_CHAR = /[A-Za-z0-9+/=]/;

interface DerNode {
  tag: number;
  start: number;
  end: number;
}

function readDer(bytes: Uint8Array, offset: number, limit = bytes.length): DerNode {
  check(offset + 2 <= limit, 'INVALID_KEY', 'Truncated DER data');
  const tag = bytes[offset];
  let length = bytes[offset + 1];
  let start = offset + 2;
  if (length & 0x80) {
    const size = length & 0x7f;
    check(size >= 1 && size <= 3 && start + size <= limit, 'INVALID_KEY', 'Invalid DER length');
    length = 0;
    for (let i = 0; i < size; i++) length = length * 256 + bytes[start + i];
    start += size;
  }
  check(start + length <= limit, 'INVALID_KEY', 'Truncated DER data');
  return { tag, start, end: start + length };
}

function readDerChildren(bytes: Uint8Array, node: DerNode): DerNode[] {
  const children: DerNode[] = [];
  for (let offset = node.start; offset < node.end;) {
    const child = readDer(bytes, offset, node.end);
    children.push(child);
    offset = child.end;
  }
  return children;
}

function readDerInteger(bytes: Uint8Array, node: DerNode): bigint {
  check(node.tag === 0x02, 'INVALID_KEY', 'Expected a DER integer');
  return bytesToBigInt(bytes.subarray(node.start, node.end));
}

function encodeDer(tag: number, content: Uint8Array): Uint8Array {
  const length = content.length;
  const header =
    length < 0x80
      ? [tag, length]
      : length < 0x100
        ? [tag, 0x81, length]
        : [tag, 0x82, length >> 8, length & 0xff];
  const out = new Uint8Array(header.length + length);
  out.set(header);
  out.set(content, header.length);
  return out;
}

function encodeDerInteger(value: bigint): Uint8Array {
  let hex = value.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  if (parseInt(hex.slice(0, 2), 16) & 0x80) hex = '00' + hex;
  return encodeDer(0x02, hexToBytes(hex));
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  return bytes.length ? BigInt('0x' + bytesToHex(bytes)) : 0n;
}

function bigIntToBytes(value: bigint, length: number): Uint8Array {
  const hex = value.toString(16);
  check(hex.length <= length * 2, 'INVALID_ARGUMENT', 'Integer does not fit');
  return hexToBytes(hex.padStart(length * 2, '0'));
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let b = base % modulus;
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % modulus;
    b = (b * b) % modulus;
    e >>= 1n;
  }
  return result;
}

function modInverse(value: bigint, modulus: bigint): bigint {
  let [a, b] = [value % modulus, modulus];
  let [x, y] = [1n, 0n];
  while (b) {
    const quotient = a / b;
    [a, b] = [b, a - quotient * b];
    [x, y] = [y, x - quotient * y];
  }
  return ((x % modulus) + modulus) % modulus;
}

function rsaKeySize(key: RsaPublicKey): number {
  return Math.ceil(key.n.toString(16).length / 2);
}

function isValidPrivateKey(key: RsaPrivateKey): boolean {
  if (key.p * key.q !== key.n || key.n < 0x10000n) return false;
  const probe = 0x1234567n % key.n;
  return modPow(rsaPrivateOp(key, probe), key.e, key.n) === probe;
}

function rsaPrivateOp(key: RsaPrivateKey, value: bigint): bigint {
  const m1 = modPow(value % key.p, key.dp, key.p);
  const m2 = modPow(value % key.q, key.dq, key.q);
  const h = (key.qi * (((m1 - m2) % key.p) + key.p)) % key.p;
  return m2 + h * key.q;
}

function parsePkcs1Private(bytes: Uint8Array, root: DerNode): RsaPrivateKey {
  const parts = readDerChildren(bytes, root);
  check(parts.length >= 9, 'INVALID_KEY', 'Not an RSA private key');
  const [n, e, d, p, q] = parts.slice(1, 6).map((node) => readDerInteger(bytes, node));
  const key: RsaPrivateKey = {
    n,
    e,
    d,
    p,
    q,
    dp: d % (p - 1n),
    dq: d % (q - 1n),
    qi: modInverse(q, p),
  };
  check(isValidPrivateKey(key), 'INVALID_KEY', 'RSA private key is inconsistent');
  return key;
}

function parsePrivateDer(bytes: Uint8Array): RsaPrivateKey {
  const root = readDer(bytes, 0);
  check(root.tag === 0x30, 'INVALID_KEY', 'Expected a DER sequence');
  const parts = readDerChildren(bytes, root);
  if (parts.length === 3 && parts[1].tag === 0x30 && parts[2].tag === 0x04) {
    return parsePrivateDer(bytes.subarray(parts[2].start, parts[2].end));
  }
  return parsePkcs1Private(bytes, root);
}

function parsePublicDer(bytes: Uint8Array): RsaPublicKey {
  const root = readDer(bytes, 0);
  check(root.tag === 0x30, 'INVALID_KEY', 'Expected a DER sequence');
  const parts = readDerChildren(bytes, root);
  if (parts.length === 2 && parts[0].tag === 0x30 && parts[1].tag === 0x03) {
    return parsePublicDer(bytes.subarray(parts[1].start + 1, parts[1].end));
  }
  if (parts.length === 2) {
    return { n: readDerInteger(bytes, parts[0]), e: readDerInteger(bytes, parts[1]) };
  }
  const key = parsePrivateDer(bytes);
  return { n: key.n, e: key.e };
}

function keyInputToDer(input: string | Uint8Array): Uint8Array {
  if (typeof input !== 'string') return input;
  const pem = /-----BEGIN [A-Z ]+-----([^-]+)-----END/.exec(input);
  return decodeBase64(pem ? pem[1] : input);
}

/** Parses a PEM, DER or base64 RSA private key (PKCS#1 or PKCS#8). */
export function parseRsaPrivateKey(input: string | Uint8Array): RsaPrivateKey {
  return parsePrivateDer(keyInputToDer(input));
}

/** Parses a PEM, DER or base64 RSA public key (SPKI or PKCS#1); private keys are reduced. */
export function parseRsaPublicKey(input: string | Uint8Array): RsaPublicKey {
  return parsePublicDer(keyInputToDer(input));
}

function toPem(label: string, der: Uint8Array): string {
  const body = encodeBase64(der).replace(/.{1,64}/g, '$&\n');
  return `-----BEGIN ${label}-----\n${body}-----END ${label}-----\n`;
}

/** Encodes a private key as PKCS#1 DER or PEM. */
export function encodeRsaPrivateKey(
  key: RsaPrivateKey,
  form: 'pem' | 'der' = 'pem',
): string | Uint8Array {
  const values = [0n, key.n, key.e, key.d, key.p, key.q, key.dp, key.dq, key.qi];
  const der = encodeDer(0x30, concatBytes(values.map(encodeDerInteger)));
  return form === 'der' ? der : toPem('RSA PRIVATE KEY', der);
}

/** Encodes a public key as SPKI DER or PEM. */
export function encodeRsaPublicKey(
  key: RsaPublicKey,
  form: 'pem' | 'der' = 'pem',
): string | Uint8Array {
  const algorithm = encodeDer(
    0x30,
    concatBytes([encodeDer(0x06, RSA_OID), new Uint8Array([0x05, 0x00])]),
  );
  const pkcs1 = encodeDer(0x30, concatBytes([encodeDerInteger(key.n), encodeDerInteger(key.e)]));
  const bitString = encodeDer(0x03, concatBytes([new Uint8Array([0]), pkcs1]));
  const der = encodeDer(0x30, concatBytes([algorithm, bitString]));
  return form === 'der' ? der : toPem('PUBLIC KEY', der);
}

function tryParsePrivate(bytes: Uint8Array): RsaPrivateKey | null {
  try {
    const root = readDer(bytes, 0);
    return parsePrivateDer(bytes.subarray(0, root.end));
  } catch {
    return null;
  }
}

/** Collects base64 text starting at `start`, skipping quotes, whitespace and `\n` escapes. */
function collectBase64(text: Uint8Array, start: number): string {
  let out = '';
  for (let i = start; i < text.length && out.length < 8192; i++) {
    const char = String.fromCharCode(text[i]);
    if (BASE64_CHAR.test(char)) out += char;
    else if (char === '\\' && (text[i + 1] === 0x6e || text[i + 1] === 0x72)) i++;
    else if (char !== '"' && char !== "'" && !/\s/.test(char)) break;
  }
  return out;
}

/** Finds RSA private keys embedded as DER in binaries or as base64/PEM in text. */
export function findRsaPrivateKeys(data: Uint8Array): RsaPrivateKey[] {
  const keys: RsaPrivateKey[] = [];
  const add = (key: RsaPrivateKey | null) => {
    if (key && !keys.some((known) => known.n === key.n)) keys.push(key);
  };
  for (let i = 0; i + 11 < data.length; i++) {
    if (
      data[i] === 0x30 &&
      data[i + 1] === 0x82 &&
      data[i + 4] === 0x02 &&
      data[i + 5] === 0x01 &&
      data[i + 6] === 0x00 &&
      data[i + 7] === 0x02
    ) {
      add(tryParsePrivate(data.subarray(i)));
    }
    if (data[i] === 0x4d && data[i + 1] === 0x49 && data[i + 2] === 0x49) {
      add(tryParsePrivate(decodeBase64(collectBase64(data, i))));
    }
  }
  return keys;
}

function encodeMessage(algorithm: HashAlgorithm, message: Uint8Array, size: number): bigint {
  const prefix = DIGEST_INFO[algorithm];
  const digest = hash(algorithm, message);
  const padding = size - 3 - prefix.length - digest.length;
  check(padding >= 8, 'INVALID_KEY', 'RSA key is too small for this hash');
  const em = new Uint8Array(size);
  em[1] = 0x01;
  em.fill(0xff, 2, 2 + padding);
  em.set(prefix, 3 + padding);
  em.set(digest, 3 + padding + prefix.length);
  return bytesToBigInt(em);
}

/** RSASSA-PKCS1-v1_5 signature. */
export function rsaSign(
  key: RsaPrivateKey,
  algorithm: HashAlgorithm,
  message: Uint8Array,
): Uint8Array {
  const size = rsaKeySize(key);
  return bigIntToBytes(rsaPrivateOp(key, encodeMessage(algorithm, message, size)), size);
}

export function rsaVerify(
  key: RsaPublicKey,
  algorithm: HashAlgorithm,
  message: Uint8Array,
  signature: Uint8Array,
  isStrict = true,
): boolean {
  const size = rsaKeySize(key);
  if (signature.length !== size) return false;
  const value = bytesToBigInt(signature);
  if (isStrict && value >= key.n) return false;
  const decoded = modPow(value, key.e, key.n);
  if (isStrict) return decoded === encodeMessage(algorithm, message, size);
  return verifyDigestInfo(bigIntToBytes(decoded, size), hash(algorithm, message));
}

function verifyDigestInfo(bytes: Uint8Array, digest: Uint8Array): boolean {
  let offset = 0;
  while (bytes[offset] === 0) offset++;
  if (bytes[offset++] !== 1) return false;
  const padding = offset;
  while (bytes[offset] === 0xff) offset++;
  if (offset - padding < 8 || bytes[offset++] !== 0) return false;
  let remaining = bytes.length - offset;
  const readLength = (tag: number, isNeeded: boolean): number => {
    if (remaining < 2 || bytes[offset++] !== tag) return -1;
    remaining--;
    const first = bytes[offset];
    if (first < 0x80) {
      offset++;
      remaining--;
      return first;
    }
    const count = first & 0x7f;
    if (remaining < count + 1) return -1;
    remaining -= count;
    if (!isNeeded) {
      offset += count;
      return 0;
    }
    const digit = bytes[offset + 1] & 0x7f;
    offset++;
    let length = 0;
    for (let i = 0; i < (count || 256); i++) length = ((length << 7) + digit) >>> 0;
    return length;
  };
  if (readLength(0x30, false) < 0 || readLength(0x30, false) < 0) return false;
  for (const tag of [0x06, 0x05]) {
    const length = readLength(tag, true);
    if (length < 0 || length > remaining) return false;
    offset += length;
    remaining -= length;
  }
  const length = readLength(0x04, true);
  return (
    length === digest.length && length === remaining && isEqualBytes(bytes.subarray(offset), digest)
  );
}

export function isSameKey(a: RsaPublicKey, b: RsaPublicKey): boolean {
  return a.n === b.n && a.e === b.e;
}
