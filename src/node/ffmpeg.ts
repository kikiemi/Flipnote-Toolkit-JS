import { spawn } from 'node:child_process';
import type { Pcm } from '../audio/pcm.ts';
import { check, fail, FlipnoteError } from '../core/errors.ts';
import { KWZ_MAX_BGM_SECONDS } from '../kwz/kwz-types.ts';
import { NoteBuilder, planFrameTiming } from '../note/import.ts';
import type { NoteFile, NoteFormat } from '../note/note.ts';
import type { VideoImportOptions } from '../video/video-import.ts';

export interface FfmpegImportOptions extends VideoImportOptions {
  /** ffmpeg executable (default "ffmpeg"); ffprobe is looked up next to it. */
  ffmpeg?: string;
}

const SERVER_PACKAGE = '@mediabunny/server';

/** Registers @mediabunny/server's decoders and encoders when it is installed; returns whether it was. */
export async function registerServerCodecs(): Promise<boolean> {
  try {
    const server = await import(SERVER_PACKAGE);
    server.registerMediabunnyServer();
    return true;
  } catch {
    return false;
  }
}

function run(command: string, args: string[], onData?: (chunk: Buffer) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => (onData ? onData(chunk) : chunks.push(chunk)));
    child.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
    child.on('error', (error) => {
      reject(new FlipnoteError('UNSUPPORTED', `Could not run ${command}: ${error.message}`));
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
        return;
      }
      const reason = Buffer.concat(errors).toString().trim().split('\n').pop();
      reject(new FlipnoteError('INVALID_FORMAT', `${command} failed: ${reason}`));
    });
  });
}

function probeCommand(ffmpeg: string): string {
  return ffmpeg.replace(
    /ffmpeg(\.exe)?$/i,
    (_, extension: string | undefined) => `ffprobe${extension ?? ''}`,
  );
}

async function probe(
  ffmpeg: string,
  path: string,
): Promise<{ duration: number; frameRate: number; hasAudio: boolean }> {
  const output = await run(probeCommand(ffmpeg), [
    '-v',
    'error',
    '-show_entries',
    'stream=codec_type,avg_frame_rate:format=duration',
    '-of',
    'json',
    path,
  ]);
  const data = JSON.parse(output.toString()) as {
    streams: { codec_type: string; avg_frame_rate?: string }[];
    format: { duration?: string };
  };
  const video = data.streams.find((stream) => stream.codec_type === 'video');
  check(video, 'INVALID_ARGUMENT', 'The file has no video track');
  const [numerator, denominator] = (video.avg_frame_rate ?? '12/1').split('/').map(Number);
  return {
    duration: Number(data.format.duration ?? 0),
    frameRate: denominator ? numerator / denominator : 12,
    hasAudio: data.streams.some((stream) => stream.codec_type === 'audio'),
  };
}

function fitFilter(fit: string, width: number, height: number, background: number): string {
  const size = `${width}:${height}`;
  if (fit === 'stretch') return `scale=${size}`;
  if (fit === 'cover') return `scale=${size}:force_original_aspect_ratio=increase,crop=${size}`;
  const color = `0x${(background >>> 8).toString(16).padStart(6, '0')}`;
  return `scale=${size}:force_original_aspect_ratio=decrease,pad=${size}:(ow-iw)/2:(oh-ih)/2:color=${color}`;
}

/**
 * Same as importVideo(), but decodes with the ffmpeg command-line tool, for Node setups
 * without WebCodecs or @mediabunny/server.
 */
export async function importVideoWithFfmpeg(
  path: string,
  format: NoteFormat,
  options: FfmpegImportOptions = {},
): Promise<NoteFile> {
  const ffmpeg = options.ffmpeg ?? 'ffmpeg';
  const source = await probe(ffmpeg, path);
  const start = Math.max(0, options.start ?? 0);
  const end = Math.min(source.duration || Infinity, options.end ?? Infinity);
  if (!Number.isFinite(end) || end <= start) {
    fail('INVALID_ARGUMENT', 'Could not determine the video length');
  }
  const wanted = typeof options.frameRate === 'number' ? options.frameRate : source.frameRate;
  const plan = planFrameTiming(format, end - start, wanted, options.overflow);
  const builder = new NoteBuilder(format, {
    ...options,
    frameRate: plan.frameRate,
    expectedFrameCount: plan.frameCount,
  });
  const width = builder.width;
  const height = builder.height;
  const frameSize = width * height * 4;
  const filter = `fps=${plan.frameRate},${fitFilter(options.fit ?? 'contain', width, height, options.background ?? 0xffffffff)}`;
  let pending: Buffer = Buffer.alloc(0);
  let done = 0;
  await run(
    ffmpeg,
    [
      '-v',
      'error',
      '-ss',
      String(start),
      '-t',
      String(end - start),
      '-i',
      path,
      '-an',
      '-vf',
      filter,
      '-frames:v',
      String(plan.frameCount),
      '-pix_fmt',
      'rgba',
      '-f',
      'rawvideo',
      '-',
    ],
    (chunk) => {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      while (pending.length >= frameSize && !builder.isFull) {
        const data = new Uint8Array(pending.buffer, pending.byteOffset, frameSize).slice();
        pending = pending.subarray(frameSize);
        if (builder.addImage({ width, height, data })) {
          options.onProgress?.(++done, plan.frameCount);
        }
      }
    },
  );
  if ((options.isAudioIncluded ?? true) && source.hasAudio) {
    const sampleRate = 32000;
    const seconds = Math.min(end - start, KWZ_MAX_BGM_SECONDS);
    const raw = await run(ffmpeg, [
      '-v',
      'error',
      '-ss',
      String(start),
      '-t',
      String(seconds),
      '-i',
      path,
      '-vn',
      '-ac',
      '1',
      '-ar',
      String(sampleRate),
      '-f',
      's16le',
      '-',
    ]);
    const samples = new Int16Array(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + (raw.length & ~1)),
    );
    const pcm: Pcm = { samples, sampleRate };
    builder.setTrack('bgm', pcm);
  } else if (options.bgm) {
    builder.setTrack('bgm', options.bgm);
  }
  return builder.finish();
}
