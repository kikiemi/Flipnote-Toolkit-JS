import { type RgbaImage } from '../image/image.ts';
import { type NoteFile } from '../note/note.ts';
import { type RenderOptions } from '../note/render.ts';
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
/** The thumbnail stored in the file as RGBA (64x48 for PPM, 80x64 for KWZ). */
export declare function decodeStoredThumbnail(note: NoteFile): RgbaImage;
/** A PNG thumbnail (or animated GIF preview) of a note, for galleries and file browsers. */
export declare function createThumbnail(note: NoteFile, options?: ThumbnailOptions): Uint8Array;
/** `data:` URL for embedding a thumbnail in HTML or JSON. */
export declare function toDataUrl(bytes: Uint8Array, type?: string): string;
