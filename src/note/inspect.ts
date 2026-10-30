import { measurePcm } from '../audio/pcm.ts';
import { timestampToDate } from '../core/time.ts';
import { isDsiLibraryNote } from '../kwz/kwz-dsi-library.ts';
import { decodeKwzFilename, formatKwzFsid, getKwzFsidRegion } from '../kwz/kwz-filename.ts';
import { analyzeKwzLayer, KwzFrameDecoder } from '../kwz/kwz-frame-codec.ts';
import { verifyKwzChecksums } from '../kwz/kwz-reader.ts';
import type { KwzFile } from '../kwz/kwz-types.ts';
import {
  formatPpmFilename,
  formatPpmStorageFilename,
  getPpmFsidRegion,
} from '../ppm/ppm-filename.ts';
import { getPpmFrameData, isPpmKeyFrame, PpmFrameDecoder } from '../ppm/ppm-frame-codec.ts';
import type { PpmFile } from '../ppm/ppm-types.ts';
import { decodeTrack, getTrackNames, hasTrack, type TrackName } from './audio.ts';
import { checkNote, type Issue } from './check.ts';
import { getMemoryUsage, type MemoryUsage } from './memory.ts';
import { getNoteInfo, readNote, type NoteFile, type NoteFormat, type NoteVariant } from './note.ts';

export interface TrackReport {
  name: TrackName;
  bytes: number;
  samples: number;
  sampleRate: number;
  duration: number;
  peak: number;
  rms: number;
}

export interface FrameReport {
  index: number;
  bytes: number;
  /** PPM: whether the frame is independent; KWZ: bitmask of independent layers. */
  key: boolean | number;
  paper: number;
  /** PPM pens, or KWZ color indices (A1, A2, B1, B2, C1, C2). */
  colors: number[];
  /** Drawn pixels per layer. */
  pixels: number[];
  soundFlags: number;
  /** PPM: line encodings 0-3 per layer; KWZ: tile types 0-7 per layer. */
  encodings: number[][];
  /** KWZ only: 3D depth per layer. */
  depths?: number[];
}

export interface NoteReport {
  format: NoteFormat;
  variant: NoteVariant;
  fileSize: number;
  isSigned: boolean;
  /** KWZ section CRC32 results. */
  checksums: Record<string, boolean>;
  meta: Record<string, unknown>;
  animation: {
    width: number;
    height: number;
    frameCount: number;
    frameRate: number;
    bgmFrameRate: number;
    duration: number;
    keyFrames: number;
    encodedBytes: number;
  };
  memory: MemoryUsage;
  tracks: TrackReport[];
  frames: FrameReport[];
  issues: Issue[];
}

export interface InspectOptions {
  /** Decode every frame for per-frame statistics (default true). */
  isDetailed?: boolean;
}

function countPixels(layer: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < layer.length; i++) if (layer[i]) count++;
  return count;
}

function trackReport(note: NoteFile, name: TrackName): TrackReport {
  const pcm = decodeTrack(note, name);
  const bytes =
    note.format === 'ppm'
      ? name === 'se4'
        ? 0
        : note.tracks[name].length
      : (note.tracks?.[name].length ?? 0);
  return {
    name,
    bytes,
    samples: pcm.samples.length,
    sampleRate: pcm.sampleRate,
    duration: pcm.samples.length / pcm.sampleRate,
    ...measurePcm(pcm.samples),
  };
}

function inspectPpmFrames(file: PpmFile): FrameReport[] {
  const decoder = new PpmFrameDecoder(file);
  const frames: FrameReport[] = [];
  for (let index = 0; index < decoder.frameCount; index++) {
    const data = getPpmFrameData(file.animation, index);
    const frame = decoder.decode(index);
    const types = (data[0] >> 5) & 3 ? 3 : 1;
    const encodings = [0, 1].map((layer) => {
      const counts = [0, 0, 0, 0];
      for (let y = 0; y < 192; y++) {
        counts[(data[types + layer * 48 + (y >> 2)] >> ((y & 3) << 1)) & 3]++;
      }
      return counts;
    });
    frames.push({
      index,
      bytes: data.length,
      key: isPpmKeyFrame(data),
      paper: frame.paper,
      colors: [...frame.pens],
      pixels: frame.layers.map(countPixels),
      soundFlags: frame.soundFlags,
      encodings,
    });
  }
  return frames;
}

function inspectKwzFrames(file: KwzFile): FrameReport[] {
  const decoder = new KwzFrameDecoder(file, { isTolerant: true });
  return file.frames.map((record, index) => {
    const frame = decoder.decode(index);
    return {
      index,
      bytes: record.layerData.reduce((sum, data) => sum + data.length, 0),
      key: record.keyLayers,
      paper: record.paper,
      colors: [...record.colors],
      pixels: frame.layers.map(countPixels),
      soundFlags: record.soundFlags,
      encodings: record.layerData.map((data) => [...analyzeKwzLayer(data).tileTypes]),
      depths: [...record.layerDepths],
    };
  });
}

function describePpm(file: PpmFile): Record<string, unknown> {
  const { meta } = file;
  return {
    ...meta,
    currentFilenameText: formatPpmFilename(meta.currentFilename),
    parentFilenameText: formatPpmFilename(meta.parentFilename),
    storageFilename: formatPpmStorageFilename(meta.currentFilename),
    region: getPpmFsidRegion(meta.currentAuthorId),
    modifiedAt: timestampToDate(meta.timestamp).toISOString(),
  };
}

function describeKwz(file: KwzFile): Record<string, unknown> {
  const { meta } = file;
  return {
    ...meta,
    rootAuthorIdText: formatKwzFsid(meta.rootAuthorId),
    parentAuthorIdText: formatKwzFsid(meta.parentAuthorId),
    currentAuthorIdText: formatKwzFsid(meta.currentAuthorId),
    region: getKwzFsidRegion(meta.currentAuthorId),
    isDsiLibrary: isDsiLibraryNote(file),
    createdAt: timestampToDate(meta.createdTime).toISOString(),
    modifiedAt: timestampToDate(meta.modifiedTime).toISOString(),
    filenameParts: decodeKwzFilename(meta.currentFilename),
  };
}

/** Parses and analyzes a PPM or KWZ file: metadata, statistics, memory use and problems. */
export function inspectNote(bytes: Uint8Array, options: InspectOptions = {}): NoteReport {
  const note = readNote(bytes);
  const info = getNoteInfo(note);
  const isDetailed = options.isDetailed ?? true;
  const check = checkNote(bytes, { isCheckingFrames: isDetailed });
  const isPpmNote = note.format === 'ppm';
  const frames = !isDetailed ? [] : isPpmNote ? inspectPpmFrames(note) : inspectKwzFrames(note);
  const keyFrames = isPpmNote
    ? Array.from({ length: info.frameCount }, (_, i) => getPpmFrameData(note.animation, i)).filter(
        isPpmKeyFrame,
      ).length
    : note.frames.filter((frame) => frame.keyLayers === 7).length;
  const encodedBytes = isPpmNote
    ? note.animation.data.length
    : note.frames.reduce(
        (sum, frame) => sum + frame.layerData.reduce((total, data) => total + data.length, 0),
        0,
      );
  return {
    format: note.format,
    variant: info.variant,
    fileSize: bytes.length,
    isSigned: check.isSigned,
    checksums: isPpmNote ? {} : (verifyKwzChecksums(bytes) as Record<string, boolean>),
    meta: isPpmNote ? describePpm(note) : describeKwz(note),
    animation: {
      width: info.width,
      height: info.height,
      frameCount: info.frameCount,
      frameRate: info.frameRate,
      bgmFrameRate: info.bgmFrameRate,
      duration: info.duration,
      keyFrames,
      encodedBytes,
    },
    memory: getMemoryUsage(note),
    tracks: getTrackNames(note)
      .filter((name) => hasTrack(note, name))
      .map((name) => trackReport(note, name)),
    frames,
    issues: check.issues,
  };
}
