import type { NoteDatabase, NoteQuery } from '../library/database.ts';
export interface GalleryOptions {
    title?: string;
    /** Which notes to include and in what order (default: all, newest first). */
    query?: NoteQuery;
    /** Animated GIF thumbnails instead of still PNGs (default false). */
    isAnimated?: boolean;
    /** Player bundle to copy (default: the one built with this package). */
    playerScript?: string;
}
/**
 * Writes a static web gallery of the notes in `database` (paths relative to `root`):
 * thumbnails, copies of the notes and a page that plays them with the bundled player.
 */
export declare function writeGallery(database: NoteDatabase, root: string, outDirectory: string, options?: GalleryOptions): Promise<number>;
