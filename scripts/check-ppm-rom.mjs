import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  checkNote,
  encodeRsaPublicKey,
  isPpm,
  PPM_PUBLIC_KEY,
  PpmFrameDecoder,
  readPpm,
  readPpmLayout,
  repairNote,
  signPpm,
  verifyPpm,
  writePpm,
} from '../dist/index.js';

function createBitReader(data, offset) {
  let bit = offset * 8;
  return (count = 1) => {
    assert.ok(bit + count <= data.length * 8, 'ASH bitstream is truncated');
    let value = 0;
    for (let i = 0; i < count; i++, bit++) {
      value = (value << 1) | ((data[bit >> 3] >> (7 - (bit & 7))) & 1);
    }
    return value;
  };
}

function readTree(read, width) {
  if (read() === 0) return read(width);
  return [readTree(read, width), readTree(read, width)];
}

function readSymbol(read, tree) {
  let value = tree;
  while (Array.isArray(value)) value = value[read()];
  return value;
}

function decompressAsh(data) {
  const size = data.readUInt32BE(4) & 0xffffff;
  const symbols = createBitReader(data, 12);
  const distances = createBitReader(data, data.readUInt32BE(8));
  const symbolTree = readTree(symbols, 9);
  const distanceTree = readTree(distances, 11);
  const out = new Uint8Array(size);
  let p = 0;
  while (p < size) {
    const value = readSymbol(symbols, symbolTree);
    if (value < 256) {
      out[p++] = value;
      continue;
    }
    const length = value - 253;
    const distance = readSymbol(distances, distanceTree) + 1;
    assert.ok(distance <= p && p + length <= size, 'ASH backreference is out of bounds');
    for (let i = 0; i < length; i++, p++) out[p] = out[p - distance];
  }
  return out;
}

function verifySample(bytes, publicKey) {
  const file = readPpm(bytes);
  const layout = readPpmLayout(bytes);
  const body = bytes.subarray(0, layout.soundEnd);
  assert.equal(verify('sha1', body, publicKey, file.signature), true);
  assert.equal(verifyPpm(bytes), true);
  assert.deepEqual(writePpm(file), bytes);
  assert.deepEqual(signPpm(bytes), bytes);
  assert.deepEqual(repairNote(bytes).bytes, bytes);
  assert.equal(checkNote(bytes).isCompatible, true);

  const decoder = new PpmFrameDecoder(file);
  for (let i = 0; i < layout.frameCount; i++) decoder.decode(i);

  file.meta.isLooping = !file.meta.isLooping;
  const edited = writePpm(file);
  assert.equal(
    verify(
      'sha1',
      edited.subarray(0, layout.soundEnd),
      publicKey,
      edited.subarray(layout.soundEnd, layout.soundEnd + 128),
    ),
    true,
  );
  return layout.frameCount;
}

const path = process.argv[2];
assert.ok(path, 'Usage: npm run test:ppm-rom -- "path/to/Flipnote Studio.nds"');
const rom = await readFile(path);
assert.ok(rom.length >= 0x50, 'NDS header is truncated');
const fatOffset = rom.readUInt32LE(0x48);
const fatSize = rom.readUInt32LE(0x4c);
assert.ok(fatSize % 8 === 0 && fatOffset + fatSize <= rom.length, 'NDS FAT is out of bounds');
const publicKey = createPublicKey(encodeRsaPublicKey(PPM_PUBLIC_KEY));
let samples = 0;
let frames = 0;
for (let p = fatOffset; p < fatOffset + fatSize; p += 8) {
  const start = rom.readUInt32LE(p);
  const end = rom.readUInt32LE(p + 4);
  assert.ok(start <= end && end <= rom.length, 'NDS file is out of bounds');
  const data = rom.subarray(start, end);
  if (data.length < 12 || data.toString('ascii', 0, 4) !== 'ASH0') continue;
  const bytes = decompressAsh(data);
  if (!isPpm(bytes)) continue;
  const count = verifySample(bytes, publicKey);
  samples++;
  frames += count;
  console.log(`PPM ${samples}: ${count} frames, signature, roundtrip, repair and edit passed`);
}
assert.ok(samples > 0, 'No ASH-compressed PPM samples found in this ROM');
console.log(`${samples} PPM samples and ${frames} frames passed`);
