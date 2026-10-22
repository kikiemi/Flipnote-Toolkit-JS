import type { Pcm } from '../audio/pcm.ts';
import { ByteWriter } from '../core/byte-writer.ts';
import { check } from '../core/errors.ts';

/** Encodes mono 16-bit PCM as a RIFF WAVE file. */
export function encodeWav(pcm: Pcm): Uint8Array {
  const dataSize = pcm.samples.length * 2;
  const writer = new ByteWriter(44 + dataSize);
  writer.writeAscii('RIFF');
  writer.writeU32(36 + dataSize);
  writer.writeAscii('WAVEfmt ');
  writer.writeU32(16);
  writer.writeU16(1);
  writer.writeU16(1);
  writer.writeU32(pcm.sampleRate);
  writer.writeU32(pcm.sampleRate * 2);
  writer.writeU16(2);
  writer.writeU16(16);
  writer.writeAscii('data');
  writer.writeU32(dataSize);
  for (let i = 0; i < pcm.samples.length; i++) writer.writeI16(pcm.samples[i]);
  return writer.toBytes();
}

/** Decodes PCM (8/16/24/32-bit) or 32-bit float WAVE, mixing channels down to mono. */
export function decodeWav(bytes: Uint8Array): Pcm {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  check(
    bytes.length >= 12 && tag(0) === 'RIFF' && tag(8) === 'WAVE',
    'INVALID_FORMAT',
    'Not a WAVE file',
  );
  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
      if (format === 0xfffe && size >= 26) format = view.getUint16(body + 24, true);
    } else if (id === 'data') {
      check(
        channels > 0 && (format === 1 || format === 3),
        'UNSUPPORTED',
        'Only PCM and float WAVE files are supported',
      );
      const bytesPerSample = bits >> 3;
      const frameSize = bytesPerSample * channels;
      const count = Math.floor(Math.min(size, bytes.length - body) / frameSize);
      const samples = new Int16Array(count);
      for (let i = 0; i < count; i++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) {
          const p = body + i * frameSize + c * bytesPerSample;
          if (format === 3) sum += view.getFloat32(p, true) * 32767;
          else if (bits === 8) sum += (bytes[p] - 128) << 8;
          else if (bits === 16) sum += view.getInt16(p, true);
          else if (bits === 24) {
            sum += ((bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16)) << 8) >> 16;
          } else {
            sum += view.getInt32(p, true) / 65536;
          }
        }
        const value = Math.round(sum / channels);
        samples[i] = value < -32768 ? -32768 : value > 32767 ? 32767 : value;
      }
      return { samples, sampleRate };
    }
    offset = body + size + (size & 1);
  }
  return { samples: new Int16Array(0), sampleRate: sampleRate || 8000 };
}
