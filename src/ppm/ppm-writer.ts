import { isEqualBytes, readU32, writeU16, writeU32 } from '../core/bytes.ts';
import { check, ignoreWarning, type WarningHandler } from '../core/errors.ts';
import { chooseSigningKey } from '../core/key-store.ts';
import { rsaSign, rsaVerify, type RsaPrivateKey } from '../core/rsa.ts';
import { bytesToHex, hexToBytes, isHex, updateUtf16 } from '../core/text.ts';
import { readPpmFsid, writePpmFilename, writePpmFsid } from './ppm-filename.ts';
import { computePpmLayout, readPpmLayout, type PpmLayout } from './ppm-reader.ts';
import {
  PPM_ANIMATION_OFFSET,
  PPM_FRAME_TABLE_OFFSET,
  PPM_PRIVATE_KEY,
  PPM_PUBLIC_KEY,
  PPM_SIGNATURE_SIZE,
  PPM_THUMBNAIL_SIZE,
  PPM_TRACK_NAMES,
  type PpmFile,
  type PpmMeta,
} from './ppm-types.ts';

export interface PpmWriteOptions {
  /** Signing key (default: see setSigningKeys, then the built-in key); null for none. */
  key?: RsaPrivateKey | null;
  onWarning?: WarningHandler;
}

function validatePpm(file: PpmFile): void {
  const { meta, animation } = file;
  const frameCount = animation.offsets.length;
  check(
    frameCount >= 1 && frameCount <= 16383,
    'INVALID_ARGUMENT',
    'PPM files need 1-16383 frames',
  );
  check(
    animation.soundFlags.length === frameCount,
    'INVALID_ARGUMENT',
    'Need one sound flag byte per frame',
  );
  for (const offset of animation.offsets) {
    check(offset < animation.data.length, 'INVALID_ARGUMENT', 'PPM frame offset is out of bounds');
  }
  check(
    meta.thumbnailIndex >= 0 && meta.thumbnailIndex < frameCount,
    'INVALID_ARGUMENT',
    'Thumbnail index is out of range',
  );
  check(
    meta.frameSpeed >= 1 && meta.frameSpeed <= 8,
    'INVALID_ARGUMENT',
    'PPM frame speed must be 1-8',
  );
  check(meta.bgmSpeed >= 1 && meta.bgmSpeed <= 8, 'INVALID_ARGUMENT', 'PPM BGM speed must be 1-8');
  check(
    isHex(meta.rootFilenameFragment, 16),
    'INVALID_ARGUMENT',
    'Root filename fragment must be 16 hex digits',
  );
  check(
    file.thumbnail.length === PPM_THUMBNAIL_SIZE,
    'INVALID_ARGUMENT',
    'PPM thumbnail must be 1536 bytes',
  );
}

function isSameLayout(a: PpmLayout, b: PpmLayout): boolean {
  return (
    a.fileSize === b.fileSize &&
    a.dataEnd === b.dataEnd &&
    a.soundHeaderOffset === b.soundHeaderOffset
  );
}

function encodePpmAnimationFlags(meta: PpmMeta): number {
  return (
    (meta.extraFlags & ~0x32) |
    (meta.isLooping ? 0x2 : 0) |
    (meta.isLayerVisible[0] ? 0 : 0x10) |
    (meta.isLayerVisible[1] ? 0 : 0x20)
  );
}

function updateFsid(out: Uint8Array, offset: number, id: string): void {
  if (readPpmFsid(out, offset) !== id.toUpperCase()) writePpmFsid(out, offset, id);
}

function writeMeta(out: Uint8Array, meta: PpmMeta): void {
  writeU16(out, 0xe, meta.formatVersion);
  writeU16(out, 0x10, meta.isLocked ? 1 : 0);
  writeU16(out, 0x12, meta.thumbnailIndex);
  updateUtf16(out, 0x14, 11, meta.rootAuthorName);
  updateUtf16(out, 0x2a, 11, meta.parentAuthorName);
  updateUtf16(out, 0x40, 11, meta.currentAuthorName);
  updateFsid(out, 0x56, meta.parentAuthorId);
  updateFsid(out, 0x5e, meta.currentAuthorId);
  writePpmFilename(out, 0x66, meta.parentFilename);
  writePpmFilename(out, 0x78, meta.currentFilename);
  updateFsid(out, 0x8a, meta.rootAuthorId);
  if (
    bytesToHex(out.subarray(0x92, 0x9a)).toUpperCase() !== meta.rootFilenameFragment.toUpperCase()
  ) {
    out.set(hexToBytes(meta.rootFilenameFragment), 0x92);
  }
  writeU32(out, 0x9a, meta.timestamp);
}

/**
 * Serializes a PPM file. Bytes the model does not describe (padding, unused fields)
 * are copied from `file.source` when the layout is unchanged, so an unmodified file
 * is written back identically and keeps its signature.
 */
export function writePpm(file: PpmFile, options: PpmWriteOptions = {}): Uint8Array {
  validatePpm(file);
  const { meta, animation, tracks } = file;
  const frameCount = animation.offsets.length;
  const dataSize = (animation.data.length + 3) & ~3;
  const layout = computePpmLayout(
    frameCount,
    dataSize,
    PPM_TRACK_NAMES.map((name) => tracks[name].length),
  );
  const sourceLayout = file.source ? readPpmLayout(file.source) : null;
  const isPatching = !!file.source && !!sourceLayout && isSameLayout(layout, sourceLayout);
  const out = new Uint8Array(layout.fileSize);
  if (isPatching) out.set(file.source!.subarray(0, layout.fileSize));

  out.set([0x50, 0x41, 0x52, 0x41]);
  writeU32(out, 4, layout.animationSize);
  writeU32(
    out,
    8,
    layout.trackSizes.reduce((sum, size) => sum + size, 0),
  );
  writeU16(out, 0xc, frameCount - 1);
  writeMeta(out, meta);
  out.set(file.thumbnail, 0xa0);

  writeU16(out, PPM_ANIMATION_OFFSET, frameCount * 4);
  writeU16(out, 0x6a6, encodePpmAnimationFlags(meta));
  for (let i = 0; i < frameCount; i++) {
    writeU32(out, PPM_FRAME_TABLE_OFFSET + i * 4, animation.offsets[i]);
  }
  out.set(animation.data, layout.dataStart);
  out.set(animation.soundFlags, layout.dataEnd);

  const header = layout.soundHeaderOffset;
  layout.trackSizes.forEach((size, i) => writeU32(out, header + i * 4, size));
  out[header + 16] = 8 - meta.frameSpeed;
  out[header + 17] = 8 - meta.bgmSpeed;
  let p = header + 32;
  for (const name of PPM_TRACK_NAMES) {
    out.set(tracks[name], p);
    p += tracks[name].length;
  }

  const signed = layout.soundEnd;
  const body = out.subarray(0, signed);
  const original =
    isPatching && isEqualBytes(body, file.source!.subarray(0, signed))
      ? file.signature.subarray(0, PPM_SIGNATURE_SIZE)
      : null;
  const key = chooseSigningKey(
    options.key,
    PPM_PRIVATE_KEY,
    () => !!original && rsaVerify(PPM_PUBLIC_KEY, 'sha1', body, original),
  );
  if (key) {
    out.set(rsaSign(key, 'sha1', body), signed);
  } else if (original) {
    out.set(original, signed);
  } else {
    out.fill(0, signed, signed + PPM_SIGNATURE_SIZE);
    if (readU32(file.signature, 0) !== 0) {
      (options.onWarning ?? ignoreWarning)('The file changed and was left unsigned');
    }
  }
  return out;
}
