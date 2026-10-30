import { check } from '../core/errors.ts';
import { encodeBase64 } from '../core/text.ts';
import { indexedToRgba, resizeRgba, type RgbaImage } from '../image/image.ts';
import { decodeKwzThumbnail } from '../kwz/kwz-thumbnail.ts';
import { encodeGif } from '../media/gif.ts';
import { encodePng } from '../media/png.ts';
import { createExportRenderer } from '../note/export.ts';
import { getFrameCount, type NoteFile } from '../note/note.ts';
import { renderFrame, type RenderOptions } from '../note/render.ts';
import { decodePpmThumbnail } from '../ppm/ppm-thumbnail.ts';

export interface ThumbnailOptions extends Omit<RenderOptions, 'eye'> {
  /**
   * 'stored' returns the thumbnail saved in the file; 'frame' renders the note's thumbnail
   * frame; 'animated' makes a short looping GIF preview (default 'frame').
   */
  kind?: 'stored' | 'frame' | 'animated';
  /** Output width in pixels; the height follows the aspect ratio (default: native size). */
  width?: number;
  /** Frame to render instead of the note's thumbnail frame. */
  frame?: number;
  /** Animated previews: frames to include at most, evenly spread (default 24). */
  maxFrames?: number;
}

function scaleTo(image: RgbaImage, width: number | undefined): RgbaImage {
  if (!width || width === image.width) return image;
  const height = Math.max(1, Math.round((image.height * width) / image.width));
  return resizeRgba(image, width, height, width > image.width ? 'nearest' : 'area');
}

/** The thumbnail stored in the file as RGBA (64x48 for PPM, 80x64 for KWZ). */
export function decodeStoredThumbnail(note: NoteFile): RgbaImage {
  if (note.format === 'ppm') return indexedToRgba(decodePpmThumbnail(note.thumbnail));
  check(note.thumbnail, 'INVALID_ARGUMENT', 'This KWZ file has no stored thumbnail');
  return decodeKwzThumbnail(note.thumbnail);
}

function createAnimatedThumbnail(note: NoteFile, options: ThumbnailOptions): Uint8Array {
  const renderer = createExportRenderer(note, options);
  const count = Math.min(renderer.frameCount, options.maxFrames ?? 24);
  const step = renderer.frameCount / count;
  const width = options.width ?? renderer.width;
  const height = Math.max(1, Math.round((renderer.height * width) / renderer.width));
  const isScaled = width !== renderer.width;
  const frames = Array.from({ length: count }, (_, i) => {
    const index = Math.floor(i * step);
    const pixels = renderer.render(index);
    const duration = step / renderer.frameRate;
    if (!isScaled) return { pixels: pixels.slice(), duration };
    const scaled = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      const row = Math.floor((y * renderer.height) / height) * renderer.width;
      for (let x = 0; x < width; x++) {
        scaled[y * width + x] = pixels[row + Math.floor((x * renderer.width) / width)];
      }
    }
    return { pixels: scaled, duration };
  });
  return encodeGif(width, height, renderer.palette, frames, { loopCount: 0 });
}

/** A PNG thumbnail (or animated GIF preview) of a note, for galleries and file browsers. */
export function createThumbnail(note: NoteFile, options: ThumbnailOptions = {}): Uint8Array {
  const kind = options.kind ?? 'frame';
  if (kind === 'animated') return createAnimatedThumbnail(note, options);
  if (kind === 'stored') return encodePng(scaleTo(decodeStoredThumbnail(note), options.width));
  const index = options.frame ?? Math.min(note.meta.thumbnailIndex, getFrameCount(note) - 1);
  const image = indexedToRgba(renderFrame(note, index, options));
  return encodePng(scaleTo(image, options.width));
}

/** `data:` URL for embedding a thumbnail in HTML or JSON. */
export function toDataUrl(
  bytes: Uint8Array,
  type = bytes[0] === 0x47 ? 'image/gif' : 'image/png',
): string {
  return `data:${type};base64,${encodeBase64(bytes)}`;
}
