import type { AudioCodec, AudioSource, OutputFormat, VideoCodec, VideoSource } from 'mediabunny';
import type { EqualizerSetting } from '../audio/equalizer.ts';
import { fail } from '../core/errors.ts';
import { encodeAac } from '../media/aac.ts';
import { H264Encoder } from '../media/h264.ts';
import { createAvcConfig, getAvcCodecString } from '../media/mp4.ts';
import { indicesToYuv, paletteToYuv } from '../media/yuv.ts';
import { hasAudio, mixAudio } from '../note/audio.ts';
import {
  createExportRenderer,
  type AnimationExportOptions,
  type ExportRenderer,
} from '../note/export.ts';
import type { NoteFile } from '../note/note.ts';
import { loadMediabunny, type MediabunnyModule } from './mediabunny.ts';

export type VideoContainer = 'mp4' | 'mov' | 'mkv' | 'webm';
export type VideoQuality = 'very-low' | 'low' | 'medium' | 'high' | 'very-high';

export interface VideoExportOptions extends AnimationExportOptions {
  /** Default 'mp4'. */
  container?: VideoContainer;
  /** Default 'avc', or 'vp9' for WebM. */
  videoCodec?: VideoCodec;
  /** Default 'aac', or 'opus' for WebM. */
  audioCodec?: AudioCodec;
  /** Encoder quality preset (default 'high'). */
  quality?: VideoQuality;
  /** Constant output frame rate (default: the note's own rate). */
  frameRate?: number;
  /** Include the mixed soundtrack when the note has audio (default true). */
  isAudioIncluded?: boolean;
  equalizer?: EqualizerSetting;
  /** Use the library's own H.264/AAC encoders even when WebCodecs is available. */
  isUsingBuiltinEncoders?: boolean;
  onProgress?: (done: number, total: number) => void;
}

const AUDIO_SAMPLE_RATE = 48000;

function createFormat(mb: MediabunnyModule, container: VideoContainer): OutputFormat {
  if (container === 'mov') return new mb.MovOutputFormat();
  if (container === 'mkv') return new mb.MkvOutputFormat();
  if (container === 'webm') return new mb.WebMOutputFormat();
  return new mb.Mp4OutputFormat({ fastStart: 'in-memory' });
}

function getQuality(mb: MediabunnyModule, quality: VideoQuality) {
  const presets = {
    'very-low': mb.QUALITY_VERY_LOW,
    low: mb.QUALITY_LOW,
    medium: mb.QUALITY_MEDIUM,
    high: mb.QUALITY_HIGH,
    'very-high': mb.QUALITY_VERY_HIGH,
  };
  return presets[quality];
}

/** Expands palette indices to RGBA, padding odd sizes by repeating the last row and column. */
function indicesToRgba(
  pixels: Uint8Array,
  renderer: ExportRenderer,
  width: number,
  height: number,
  out: Uint8Array,
): void {
  const colors = new Uint32Array(renderer.palette.slice().buffer);
  const view = new Uint32Array(out.buffer, out.byteOffset, width * height);
  for (let y = 0; y < height; y++) {
    const row = Math.min(y, renderer.height - 1) * renderer.width;
    for (let x = 0; x < width; x++) {
      view[y * width + x] = colors[pixels[row + Math.min(x, renderer.width - 1)]];
    }
  }
}

/**
 * Exports a note to MP4, MOV, MKV or WebM through mediabunny. WebCodecs encoders are used
 * when available (browsers); otherwise H.264 and AAC fall back to the library's own encoders.
 */
export async function exportVideo(
  note: NoteFile,
  options: VideoExportOptions = {},
): Promise<Uint8Array> {
  const mb = await loadMediabunny();
  const container = options.container ?? 'mp4';
  const videoCodec = options.videoCodec ?? (container === 'webm' ? 'vp9' : 'avc');
  const audioCodec = options.audioCodec ?? (container === 'webm' ? 'opus' : 'aac');
  const renderer = createExportRenderer(note, { ...options, isTransparent: false });
  const width = (renderer.width + 1) & ~1;
  const height = (renderer.height + 1) & ~1;
  const frameRate = options.frameRate ?? renderer.frameRate;
  const repeat = options.repeat ?? 1;
  const total = renderer.frameCount * repeat;
  const duration = total / renderer.frameRate;
  const outputCount = options.frameRate ? Math.max(1, Math.round(duration * frameRate)) : total;
  const quality = getQuality(mb, options.quality ?? 'high');
  const isBuiltinVideo =
    options.isUsingBuiltinEncoders || !(await mb.canEncodeVideo(videoCodec, { width, height }));
  if (isBuiltinVideo && videoCodec !== 'avc') {
    fail('UNSUPPORTED', `No ${videoCodec} encoder is available here; use H.264 (avc)`);
  }
  const isAudio = (options.isAudioIncluded ?? true) && hasAudio(note);
  const isBuiltinAudio =
    isAudio && (options.isUsingBuiltinEncoders || !(await mb.canEncodeAudio(audioCodec)));
  if (isBuiltinAudio && audioCodec !== 'aac') {
    fail('UNSUPPORTED', `No ${audioCodec} encoder is available here; use AAC`);
  }

  const output = new mb.Output({
    format: createFormat(mb, container),
    target: new mb.BufferTarget(),
  });
  const videoSource: VideoSource = isBuiltinVideo
    ? new mb.EncodedVideoPacketSource('avc')
    : new mb.VideoSampleSource({ codec: videoCodec, bitrate: quality });
  output.addVideoTrack(videoSource, { frameRate });
  let audioSource: AudioSource | null = null;
  if (isAudio) {
    audioSource = isBuiltinAudio
      ? new mb.EncodedAudioPacketSource('aac')
      : new mb.AudioSampleSource({ codec: audioCodec, bitrate: quality });
    output.addAudioTrack(audioSource);
  }
  await output.start();

  const encoder = isBuiltinVideo
    ? new H264Encoder(width, height, frameRate, {
        keyFrameInterval: Math.max(1, Math.round(frameRate * 10)),
      })
    : null;
  const yuv = encoder?.createFrame();
  const tables = paletteToYuv(renderer.palette, 'bt601');
  const rgba = new Uint8Array(width * height * 4);
  let lastSource = -1;
  for (let k = 0; k < outputCount; k++) {
    const source = options.frameRate
      ? Math.min(total - 1, Math.floor((k * renderer.frameRate) / frameRate))
      : k;
    const timestamp = k / frameRate;
    if (encoder && yuv) {
      if (source !== lastSource) {
        indicesToYuv(
          renderer.render(source % renderer.frameCount),
          renderer.width,
          renderer.height,
          encoder,
          tables,
          yuv,
        );
      }
      const sample = encoder.encode(yuv);
      const packet = new mb.EncodedPacket(
        sample.data,
        sample.isKey ? 'key' : 'delta',
        timestamp,
        1 / frameRate,
      );
      const meta =
        k === 0
          ? {
              decoderConfig: {
                codec: getAvcCodecString(encoder.sps),
                codedWidth: width,
                codedHeight: height,
                description: createAvcConfig(encoder.sps, encoder.pps),
              },
            }
          : undefined;
      await (videoSource as InstanceType<MediabunnyModule['EncodedVideoPacketSource']>).add(
        packet,
        meta,
      );
    } else {
      if (source !== lastSource) {
        indicesToRgba(renderer.render(source % renderer.frameCount), renderer, width, height, rgba);
      }
      const sample = new mb.VideoSample(rgba, {
        format: 'RGBA',
        codedWidth: width,
        codedHeight: height,
        timestamp,
        duration: 1 / frameRate,
      });
      await (videoSource as InstanceType<MediabunnyModule['VideoSampleSource']>).add(sample);
      sample.close();
    }
    lastSource = source;
    options.onProgress?.(k + 1, outputCount);
  }

  if (audioSource) {
    const pcm = mixAudio(note, {
      sampleRate: AUDIO_SAMPLE_RATE,
      repeat,
      equalizer: options.equalizer,
    });
    if (isBuiltinAudio) {
      const aac = encodeAac(pcm, { bitrate: 96000 });
      const packetSource = audioSource as InstanceType<
        MediabunnyModule['EncodedAudioPacketSource']
      >;
      for (let i = 0; i < aac.frames.length; i++) {
        const packet = new mb.EncodedPacket(
          aac.frames[i],
          'key',
          (i * 1024) / AUDIO_SAMPLE_RATE,
          1024 / AUDIO_SAMPLE_RATE,
        );
        const meta =
          i === 0
            ? {
                decoderConfig: {
                  codec: 'mp4a.40.2',
                  numberOfChannels: 1,
                  sampleRate: AUDIO_SAMPLE_RATE,
                  description: aac.config,
                },
              }
            : undefined;
        await packetSource.add(packet, meta);
      }
    } else {
      const data = Float32Array.from(pcm.samples, (value) => value / 32768);
      const sample = new mb.AudioSample({
        data,
        format: 'f32',
        numberOfChannels: 1,
        sampleRate: AUDIO_SAMPLE_RATE,
        timestamp: 0,
      });
      await (audioSource as InstanceType<MediabunnyModule['AudioSampleSource']>).add(sample);
      sample.close();
    }
  }
  await output.finalize();
  return new Uint8Array((output.target as InstanceType<MediabunnyModule['BufferTarget']>).buffer!);
}
