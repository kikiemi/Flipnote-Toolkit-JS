export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  let length = 0;
  for (const part of parts) length += part.length;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function align4(value: number): number {
  return (value + 3) & ~3;
}

/** 32-bit view of `bytes` for reading; misaligned input is copied first. */
export function toWords(bytes: Uint8Array): Uint32Array {
  const source = bytes.byteOffset & 3 ? bytes.slice() : bytes;
  return new Uint32Array(source.buffer, source.byteOffset, bytes.length >> 2);
}

/** Runs `write` on a 4-byte-aligned buffer that is copied back into `bytes` when needed. */
export function writeAligned(bytes: Uint8Array, write: (aligned: Uint8Array) => void): void {
  if (!(bytes.byteOffset & 3)) {
    write(bytes);
    return;
  }
  const aligned = bytes.slice();
  write(aligned);
  bytes.set(aligned);
}

export function isEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Index of `pattern` in `bytes` at or after `from` with the given alignment, or -1. */
export function findBytes(bytes: Uint8Array, pattern: Uint8Array, from = 0, step = 1): number {
  const first = pattern[0];
  const last = bytes.length - pattern.length;
  for (let i = from; i <= last; i += step) {
    if (bytes[i] !== first) continue;
    let k = 1;
    while (k < pattern.length && bytes[i + k] === pattern[k]) k++;
    if (k === pattern.length) return i;
  }
  return -1;
}

export function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

export function readU32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

export function writeU16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

export function writeU32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

/** Copy of `object` without properties whose value is undefined, for merging option overrides. */
export function withoutUndefined<T extends object>(object: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
