import { type NoteFormat, type NoteVariant } from '../note/note.ts';
import { type ThumbnailOptions } from './thumbnails.ts';
export interface AuthorRecord {
    id: string;
    name: string;
}
/** Everything a gallery or search needs about one note, as plain JSON. */
export interface NoteRecord {
    /** SHA-1 of the file. */
    id: string;
    /** SHA-1 of the frame data alone, shared by re-signed or retitled copies. */
    contentId: string;
    path?: string;
    /** File modification time in milliseconds, for incremental rescans. */
    fileTime?: number;
    size: number;
    format: NoteFormat;
    variant: NoteVariant;
    filename: string;
    parentFilename: string;
    /** PPM: the root file's MAC and name prefix; KWZ: the root file name. */
    rootFilename: string;
    /** Name on the SD card or system memory (PPM adds a checksum character). */
    storageFilename: string;
    root: AuthorRecord;
    parent: AuthorRecord;
    current: AuthorRecord;
    createdAt: string | null;
    modifiedAt: string;
    frameCount: number;
    frameRate: number;
    duration: number;
    hasAudio: boolean;
    isLocked: boolean;
    isLooping: boolean;
    is3d: boolean;
    isSigned: boolean;
    isCompatible: boolean;
    isDsiLibrary: boolean;
    isSpinoff: boolean;
    /** Fill level of the app's memory meter. */
    memory: number;
    errors: number;
    warnings: number;
    /** PNG or GIF data URL when thumbnails were requested. */
    thumbnail?: string;
    tags: string[];
}
export type SortKey = 'modified' | 'created' | 'frames' | 'duration' | 'size' | 'author' | 'filename';
export interface NoteQuery {
    /** Matches author names and IDs, file names and paths (case-insensitive). */
    text?: string;
    authorId?: string;
    format?: NoteFormat;
    variant?: NoteVariant;
    /** Modified on or after / before these dates. */
    from?: Date | string;
    to?: Date | string;
    isSigned?: boolean;
    hasAudio?: boolean;
    isLocked?: boolean;
    is3d?: boolean;
    isDsiLibrary?: boolean;
    isSpinoff?: boolean;
    tag?: string;
    sort?: SortKey;
    order?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
}
export interface AddNoteOptions {
    path?: string;
    fileTime?: number;
    /** Store a thumbnail data URL in the record (default none). */
    thumbnail?: ThumbnailOptions | false;
    tags?: string[];
}
export interface DatabaseJson {
    version: 1;
    records: NoteRecord[];
}
/** Builds the database record for a note file. */
export declare function createNoteRecord(bytes: Uint8Array, options?: AddNoteOptions): NoteRecord;
/** In-memory index of notes with search, lineage and duplicate detection; serializes to JSON. */
export declare class NoteDatabase {
    private readonly records;
    constructor(records?: Iterable<NoteRecord>);
    static fromJson(json: DatabaseJson | string): NoteDatabase;
    get size(): number;
    /** Reads a note file and indexes it; an identical file replaces its earlier record. */
    add(bytes: Uint8Array, options?: AddNoteOptions): NoteRecord;
    addRecord(record: NoteRecord): void;
    get(id: string): NoteRecord | undefined;
    findByPath(path: string): NoteRecord | undefined;
    remove(id: string): boolean;
    all(): NoteRecord[];
    query(query?: NoteQuery): NoteRecord[];
    /** Groups of records with identical frames (re-signed, renamed or metadata-edited copies). */
    findDuplicates(): NoteRecord[][];
    /** Notes that descend from the same original (same root author and root file). */
    findFamily(id: string): NoteRecord[];
    /** Every author with how many notes they currently own. */
    listAuthors(): {
        id: string;
        name: string;
        count: number;
    }[];
    toJson(): DatabaseJson;
}
