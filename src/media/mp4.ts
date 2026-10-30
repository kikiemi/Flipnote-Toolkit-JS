import { ByteWriter } from '../core/byte-writer.ts';
import { concatBytes } from '../core/bytes.ts';
import { check } from '../core/errors.ts';

export interface Mp4VideoTrack {
  width: number;
  height: number;
  timescale: number;
  sps: Uint8Array;
  pps: Uint8Array;
  /** H.264 color description written to the colr box. */
  colorMatrix: 'bt601' | 'bt709';
  samples: { data: Uint8Array; duration: number; isKey: boolean }[];
}

export interface Mp4AudioTrack {
  sampleRate: number;
  config: Uint8Array;
  frames: Uint8Array[];
  /** Encoder delay trimmed by the edit list. */
  priming: number;
  /** Playable length in samples. */
  length: number;
  bitrate: number;
}

const MOVIE_TIMESCALE = 1000;
const MATRIX = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000];

/** AVCDecoderConfigurationRecord (the avcC box body, also WebCodecs' description). */
export function createAvcConfig(sps: Uint8Array, pps: Uint8Array): Uint8Array {
  const out = new Uint8Array(11 + sps.length + pps.length);
  out.set([1, sps[1], sps[2], sps[3], 0xff, 0xe1, sps.length >> 8, sps.length & 0xff]);
  out.set(sps, 8);
  out.set([1, pps.length >> 8, pps.length & 0xff], 8 + sps.length);
  out.set(pps, 11 + sps.length);
  return out;
}

/** RFC 6381 codec string, e.g. avc1.42c01e. */
export function getAvcCodecString(sps: Uint8Array): string {
  return (
    'avc1.' + [sps[1], sps[2], sps[3]].map((value) => value.toString(16).padStart(2, '0')).join('')
  );
}

function box(writer: ByteWriter, type: string, body: (writer: ByteWriter) => void): void {
  const start = writer.length;
  writer.writeU32Be(0);
  writer.writeAscii(type);
  body(writer);
  writer.patchU32Be(start, writer.length - start);
}

function fullBox(
  writer: ByteWriter,
  type: string,
  version: number,
  flags: number,
  body: (writer: ByteWriter) => void,
): void {
  box(writer, type, (w) => {
    w.writeU8(version);
    w.writeU24Be(flags);
    body(w);
  });
}

function writeMatrix(writer: ByteWriter): void {
  for (const value of MATRIX) writer.writeU32Be(value);
}

function descriptor(tag: number, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(body.length + 5);
  out[0] = tag;
  out[1] = 0x80 | ((body.length >> 21) & 0x7f);
  out[2] = 0x80 | ((body.length >> 14) & 0x7f);
  out[3] = 0x80 | ((body.length >> 7) & 0x7f);
  out[4] = body.length & 0x7f;
  out.set(body, 5);
  return out;
}

function writeTrackHeader(
  writer: ByteWriter,
  trackId: number,
  duration: number,
  video: { width: number; height: number } | null,
): void {
  fullBox(writer, 'tkhd', 0, 3, (w) => {
    w.writeU32Be(0);
    w.writeU32Be(0);
    w.writeU32Be(trackId);
    w.writeU32Be(0);
    w.writeU32Be(duration);
    w.writeZeros(8);
    w.writeU16Be(0);
    w.writeU16Be(0);
    w.writeU16Be(video ? 0 : 0x0100);
    w.writeU16Be(0);
    writeMatrix(w);
    w.writeU32Be(video ? video.width << 16 : 0);
    w.writeU32Be(video ? video.height << 16 : 0);
  });
}

function writeTables(
  writer: ByteWriter,
  sizes: number[],
  durations: number[],
  syncSamples: number[] | null,
  chunkOffsetPosition: { value: number },
): void {
  fullBox(writer, 'stts', 0, 0, (w) => {
    const runs: [number, number][] = [];
    for (const duration of durations) {
      const last = runs[runs.length - 1];
      if (last && last[1] === duration) last[0]++;
      else runs.push([1, duration]);
    }
    w.writeU32Be(runs.length);
    for (const [count, delta] of runs) {
      w.writeU32Be(count);
      w.writeU32Be(delta);
    }
  });
  if (syncSamples) {
    fullBox(writer, 'stss', 0, 0, (w) => {
      w.writeU32Be(syncSamples.length);
      for (const sample of syncSamples) w.writeU32Be(sample);
    });
  }
  fullBox(writer, 'stsc', 0, 0, (w) => {
    w.writeU32Be(1);
    w.writeU32Be(1);
    w.writeU32Be(sizes.length);
    w.writeU32Be(1);
  });
  fullBox(writer, 'stsz', 0, 0, (w) => {
    w.writeU32Be(0);
    w.writeU32Be(sizes.length);
    for (const size of sizes) w.writeU32Be(size);
  });
  fullBox(writer, 'stco', 0, 0, (w) => {
    w.writeU32Be(1);
    chunkOffsetPosition.value = w.length;
    w.writeU32Be(0);
  });
}

function writeMedia(
  writer: ByteWriter,
  timescale: number,
  duration: number,
  handler: 'vide' | 'soun',
  entry: (w: ByteWriter) => void,
  tables: (w: ByteWriter) => void,
): void {
  box(writer, 'mdia', (mdia) => {
    fullBox(mdia, 'mdhd', 0, 0, (w) => {
      w.writeU32Be(0);
      w.writeU32Be(0);
      w.writeU32Be(timescale);
      w.writeU32Be(duration);
      w.writeU16Be(0x55c4);
      w.writeU16Be(0);
    });
    fullBox(mdia, 'hdlr', 0, 0, (w) => {
      w.writeU32Be(0);
      w.writeAscii(handler);
      w.writeZeros(12);
      w.writeAscii(handler === 'vide' ? 'VideoHandler' : 'SoundHandler');
      w.writeU8(0);
    });
    box(mdia, 'minf', (minf) => {
      if (handler === 'vide') {
        fullBox(minf, 'vmhd', 0, 1, (w) => w.writeZeros(8));
      } else {
        fullBox(minf, 'smhd', 0, 0, (w) => w.writeZeros(4));
      }
      box(minf, 'dinf', (dinf) => {
        fullBox(dinf, 'dref', 0, 0, (w) => {
          w.writeU32Be(1);
          fullBox(w, 'url ', 0, 1, () => undefined);
        });
      });
      box(minf, 'stbl', (stbl) => {
        fullBox(stbl, 'stsd', 0, 0, (w) => {
          w.writeU32Be(1);
          entry(w);
        });
        tables(stbl);
      });
    });
  });
}

/** Writes a progressive MP4 (moov before mdat) with an H.264 video track and an optional AAC track. */
export function muxMp4(video: Mp4VideoTrack, audio: Mp4AudioTrack | null = null): Uint8Array {
  check(video.samples.length > 0, 'INVALID_ARGUMENT', 'MP4 needs at least one video frame');
  const videoDuration = video.samples.reduce((sum, sample) => sum + sample.duration, 0);
  const movieDuration = Math.round((videoDuration / video.timescale) * MOVIE_TIMESCALE);
  const videoOffset = { value: 0 };
  const audioOffset = { value: 0 };
  const moov = new ByteWriter(1 << 16);
  box(moov, 'moov', (m) => {
    fullBox(m, 'mvhd', 0, 0, (w) => {
      w.writeU32Be(0);
      w.writeU32Be(0);
      w.writeU32Be(MOVIE_TIMESCALE);
      w.writeU32Be(movieDuration);
      w.writeU32Be(0x10000);
      w.writeU16Be(0x0100);
      w.writeZeros(10);
      writeMatrix(w);
      w.writeZeros(24);
      w.writeU32Be(audio ? 3 : 2);
    });
    box(m, 'trak', (trak) => {
      writeTrackHeader(trak, 1, movieDuration, video);
      writeMedia(
        trak,
        video.timescale,
        videoDuration,
        'vide',
        (w) =>
          box(w, 'avc1', (entry) => {
            entry.writeZeros(6);
            entry.writeU16Be(1);
            entry.writeZeros(16);
            entry.writeU16Be(video.width);
            entry.writeU16Be(video.height);
            entry.writeU32Be(0x00480000);
            entry.writeU32Be(0x00480000);
            entry.writeU32Be(0);
            entry.writeU16Be(1);
            entry.writeZeros(32);
            entry.writeU16Be(0x18);
            entry.writeU16Be(0xffff);
            box(entry, 'avcC', (c) => c.writeBytes(createAvcConfig(video.sps, video.pps)));
            box(entry, 'colr', (c) => {
              const code = video.colorMatrix === 'bt709' ? 1 : 6;
              c.writeAscii('nclx');
              c.writeU16Be(code);
              c.writeU16Be(code);
              c.writeU16Be(code);
              c.writeU8(0);
            });
            box(entry, 'pasp', (c) => {
              c.writeU32Be(1);
              c.writeU32Be(1);
            });
          }),
        (w) =>
          writeTables(
            w,
            video.samples.map((sample) => sample.data.length),
            video.samples.map((sample) => sample.duration),
            video.samples.flatMap((sample, index) => (sample.isKey ? [index + 1] : [])),
            videoOffset,
          ),
      );
    });
    if (!audio) return;
    const audioDuration = audio.frames.length * 1024;
    box(m, 'trak', (trak) => {
      const playable = Math.round((audio.length / audio.sampleRate) * MOVIE_TIMESCALE);
      writeTrackHeader(trak, 2, playable, null);
      box(trak, 'edts', (edts) => {
        fullBox(edts, 'elst', 0, 0, (w) => {
          w.writeU32Be(1);
          w.writeU32Be(playable);
          w.writeU32Be(audio.priming);
          w.writeU32Be(0x10000);
        });
      });
      writeMedia(
        trak,
        audio.sampleRate,
        audioDuration,
        'soun',
        (w) =>
          box(w, 'mp4a', (entry) => {
            entry.writeZeros(6);
            entry.writeU16Be(1);
            entry.writeZeros(8);
            entry.writeU16Be(1);
            entry.writeU16Be(16);
            entry.writeZeros(4);
            entry.writeU32Be(audio.sampleRate << 16);
            fullBox(entry, 'esds', 0, 0, (esds) => {
              const decoderSpecific = descriptor(0x05, audio.config);
              const config = new Uint8Array(13);
              const view = new DataView(config.buffer);
              config[0] = 0x40;
              view.setUint32(1, (0x15 << 24) | (6144 / 8), false);
              view.setUint32(5, audio.bitrate, false);
              view.setUint32(9, audio.bitrate, false);
              const decoderConfig = descriptor(0x04, concatBytes([config, decoderSpecific]));
              const es = descriptor(
                0x03,
                concatBytes([
                  new Uint8Array([0, 2, 0]),
                  decoderConfig,
                  descriptor(0x06, new Uint8Array([2])),
                ]),
              );
              esds.writeBytes(es);
            });
          }),
        (w) =>
          writeTables(
            w,
            audio.frames.map((frame) => frame.length),
            audio.frames.map(() => 1024),
            null,
            audioOffset,
          ),
      );
    });
  });

  const ftyp = new ByteWriter(64);
  box(ftyp, 'ftyp', (w) => {
    w.writeAscii('isom');
    w.writeU32Be(0x200);
    for (const brand of ['isom', 'iso2', 'avc1', 'mp41']) w.writeAscii(brand);
  });
  const videoSize = video.samples.reduce((sum, sample) => sum + sample.data.length, 0);
  const audioSize = audio ? audio.frames.reduce((sum, frame) => sum + frame.length, 0) : 0;
  const mdatStart = ftyp.length + moov.length;
  moov.patchU32Be(videoOffset.value, mdatStart + 8);
  if (audio) moov.patchU32Be(audioOffset.value, mdatStart + 8 + videoSize);
  const out = new ByteWriter(mdatStart + 8 + videoSize + audioSize);
  out.writeBytes(ftyp.subarray(0));
  out.writeBytes(moov.subarray(0));
  out.writeU32Be(8 + videoSize + audioSize);
  out.writeAscii('mdat');
  for (const sample of video.samples) out.writeBytes(sample.data);
  if (audio) for (const frame of audio.frames) out.writeBytes(frame);
  return out.toBytes();
}
