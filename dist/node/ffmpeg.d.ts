import { type VideoImportOptions } from '../note/import.ts';
import type { NoteFile, NoteFormat } from '../note/note.ts';
export interface FfmpegImportOptions extends VideoImportOptions {
    /** ffmpeg executable (default "ffmpeg"); ffprobe is looked up next to it. */
    ffmpeg?: string;
}
/** Registers @mediabunny/server's decoders and encoders when it is installed; returns whether it was. */
export declare function registerServerCodecs(): Promise<boolean>;
/**
 * Same as importVideo(), but decodes with the ffmpeg command-line tool, for Node setups
 * without WebCodecs or @mediabunny/server.
 */
export declare function importVideoWithFfmpeg(path: string, format: NoteFormat, options?: FfmpegImportOptions): Promise<NoteFile>;
