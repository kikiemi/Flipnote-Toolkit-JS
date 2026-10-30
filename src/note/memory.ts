import { getKwzFrameDataSize } from '../kwz/kwz-create.ts';
import { KWZ_MEMORY_BASE, KWZ_MEMORY_LIMIT, type KwzFile } from '../kwz/kwz-types.ts';
import { PPM_MAX_ANIMATION_SIZE, type PpmFile } from '../ppm/ppm-types.ts';
import type { NoteFile } from './note.ts';

export interface MemoryUsage {
  /** Bytes the app counts against its limit. */
  used: number;
  limit: number;
  /** Fill level of the app's memory meter (1 = full; can slightly exceed 1). */
  level: number;
}

export function getPpmMemoryUsage(file: PpmFile): MemoryUsage {
  const used = file.animation.data.length;
  return { used, limit: PPM_MAX_ANIMATION_SIZE, level: used / PPM_MAX_ANIMATION_SIZE };
}

export function getKwzMemoryUsage(file: KwzFile): MemoryUsage {
  const used = getKwzFrameDataSize(file.frames) + KWZ_MEMORY_BASE;
  return { used, limit: KWZ_MEMORY_LIMIT, level: used / KWZ_MEMORY_LIMIT };
}

/** The memory meter shown while editing: animation data for PPM, frame data for KWZ. */
export function getMemoryUsage(note: NoteFile): MemoryUsage {
  return note.format === 'ppm' ? getPpmMemoryUsage(note) : getKwzMemoryUsage(note);
}
