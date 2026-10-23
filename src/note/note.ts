import { fail, type WarningHandler } from '../core/errors.ts';
import type { RsaPrivateKey } from '../core/rsa.ts';
import { getKwzSampleRate } from '../kwz/kwz-audio.ts';
import { isKwz, readKwz } from '../kwz/kwz-reader.ts';
import {
  KWZ_APP_PALETTE,
  KWZ_FRAME_RATES,
  KWZ_HEIGHT,
  KWZ_PALETTE,
  KWZ_WIDTH,
  type KwzFile,
  type KwzPaletteName,
} from '../kwz/kwz-types.ts';
import { writeKwz } from '../kwz/kwz-writer.ts';
import { formatPpmStorageFilename } from '../ppm/ppm-filename.ts';
import { isPpm, readPpm } from '../ppm/ppm-reader.ts';
import {
  PPM_FRAME_RATES,
  PPM_HEIGHT,
  PPM_PALETTE,
  PPM_SAMPLE_RATE,
  PPM_WIDTH,
  type PpmFile,
} from '../ppm/ppm-types.ts';
import { writePpm } from '../ppm/ppm-writer.ts';

export type NoteFile = PpmFile | KwzFile;
export type NoteFormat = NoteFile['format'];
export type NoteVariant = 'ppm' | KwzFile['variant'];

export interface NoteWriteOptions {
  /** Signing key (default: see setSigningKeys, then the built-in key); null for none. */
  key?: RsaPrivateKey | null;
  onWarning?: WarningHandler;
}

/** Format-independent facts about a note. */
export interface NoteInfo {
  format: NoteFormat;
  variant: NoteVariant;
  width: number;
  height: number;
  layerCount: number;
  frameCount: number;
  frameRate: number;
  bgmFrameRate: number;
  /** Duration of one playthrough in seconds. */
  duration: number;
  sampleRate: number;
  palette: Uint8Array;
}

export function detectFormat(bytes: Uint8Array): NoteFormat | null {
  if (isPpm(bytes)) return 'ppm';
  if (isKwz(bytes)) return 'kwz';
  return null;
}

/** Reads a PPM note or a KWZ note, KWC comment or folder icon, detected by its magic bytes. */
export function readNote(bytes: Uint8Array): NoteFile {
  const format = detectFormat(bytes);
  if (format === 'ppm') return readPpm(bytes);
  if (format === 'kwz') return readKwz(bytes);
  return fail('INVALID_FORMAT', 'Unknown file format (expected PPM or KWZ)');
}

export function writeNote(note: NoteFile, options: NoteWriteOptions = {}): Uint8Array {
  return note.format === 'ppm' ? writePpm(note, options) : writeKwz(note, options);
}

export function getFrameCount(note: NoteFile): number {
  return note.format === 'ppm' ? note.animation.offsets.length : note.frames.length;
}

export function getVariant(note: NoteFile): NoteVariant {
  return note.format === 'ppm' ? 'ppm' : note.variant;
}

/** Name the console stores the note under on the SD card. */
export function getStorageFilename(note: NoteFile): string {
  if (note.format === 'ppm') return formatPpmStorageFilename(note.meta.currentFilename);
  return note.variant === 'icon' ? '!.ico' : `${note.meta.currentFilename}.${note.variant}`;
}

export function getFrameRates(format: NoteFormat): readonly number[] {
  return format === 'ppm' ? PPM_FRAME_RATES : KWZ_FRAME_RATES;
}

/** Palette for rendered frames; KWZ notes can use the screen colors or the app's own. */
export function getPalette(
  note: NoteFile | NoteFormat,
  palette: KwzPaletteName = 'screen',
): Uint8Array {
  if ((typeof note === 'string' ? note : note.format) === 'ppm') return PPM_PALETTE;
  return palette === 'app' ? KWZ_APP_PALETTE : KWZ_PALETTE;
}

export function getNoteInfo(note: NoteFile): NoteInfo {
  const isPpmNote = note.format === 'ppm';
  const rates = getFrameRates(note.format);
  const frameRate = rates[note.meta.frameSpeed] ?? rates[rates.length - 1];
  const frameCount = getFrameCount(note);
  return {
    format: note.format,
    variant: getVariant(note),
    width: isPpmNote ? PPM_WIDTH : KWZ_WIDTH,
    height: isPpmNote ? PPM_HEIGHT : KWZ_HEIGHT,
    layerCount: isPpmNote ? 2 : 3,
    frameCount,
    frameRate,
    bgmFrameRate: rates[note.meta.bgmSpeed] ?? frameRate,
    duration: frameCount / frameRate,
    sampleRate: isPpmNote ? PPM_SAMPLE_RATE : getKwzSampleRate(note),
    palette: isPpmNote ? PPM_PALETTE : KWZ_PALETTE,
  };
}
