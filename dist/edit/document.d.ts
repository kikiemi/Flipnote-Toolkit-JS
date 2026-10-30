import type { Pcm } from '../audio/pcm.ts';
import { type WarningHandler } from '../core/errors.ts';
import type { RsaPrivateKey } from '../core/rsa.ts';
import { type KwzRenderOptions } from '../kwz/kwz-render.ts';
import { type KwzFile, type KwzFrame, type KwzFrameInfo, type KwzMeta } from '../kwz/kwz-types.ts';
import { type TrackName } from '../note/audio.ts';
import { type PreflightReport } from '../note/check.ts';
import { type NoteFile, type NoteFormat } from '../note/note.ts';
import { type NoteAuthor, type SaveOptions } from '../note/save.ts';
import { type PpmFile, type PpmFrame, type PpmFrameInfo, type PpmMeta } from '../ppm/ppm-types.ts';
import { type PaperInkMode } from './paper.ts';
export type DocumentFrame = PpmFrame | KwzFrame;
type FrameInfo = PpmFrameInfo | KwzFrameInfo;
export interface DocumentOptions {
    /** Who is editing; edited KWZ frames are stamped with this ID and saves use it. */
    author?: NoteAuthor;
    /** Undo steps kept (default 100). */
    historyLimit?: number;
    /** Decoded frames kept in memory (default 16). */
    cacheSize?: number;
    onWarning?: WarningHandler;
}
export interface DocumentSaveOptions extends Omit<SaveOptions, 'author'> {
    /** Apply the app's save rules (authorship, file names, timestamps); default true. */
    isApplyingSaveRules?: boolean;
    /** Signing key (default: see setSigningKeys, then the built-in key). */
    key?: RsaPrivateKey;
}
/**
 * Editable note that keeps layers, per-frame colors, depths, sound flags and frame authors.
 * Frames stay compressed until used; every change can be undone; saving re-encodes only
 * from the first changed frame and follows the app's save rules.
 */
export declare class NoteDocument<TFrame extends DocumentFrame = DocumentFrame> {
    readonly format: NoteFormat;
    readonly width: number;
    readonly height: number;
    readonly layerCount: number;
    author: NoteAuthor | null;
    private readonly note;
    private readonly initial;
    private state;
    private past;
    private future;
    private readonly historyLimit;
    private readonly cacheSize;
    private readonly cache;
    private readonly ppmDecoder;
    private readonly kwzDecoder;
    private readonly listeners;
    private readonly warn;
    private transactionDepth;
    private transactionStart;
    constructor(note: NoteFile, options?: DocumentOptions);
    /** Opens a note for editing. */
    static open(note: PpmFile, options?: DocumentOptions): NoteDocument<PpmFrame>;
    static open(note: KwzFile, options?: DocumentOptions): NoteDocument<KwzFrame>;
    static open(note: NoteFile, options?: DocumentOptions): NoteDocument;
    /** Starts a blank note with one empty frame. */
    static create(format: 'ppm', options?: DocumentOptions): NoteDocument<PpmFrame>;
    static create(format: 'kwz', options?: DocumentOptions): NoteDocument<KwzFrame>;
    static create(format: NoteFormat, options?: DocumentOptions): NoteDocument;
    get frameCount(): number;
    get meta(): Readonly<PpmMeta | KwzMeta>;
    get isModified(): boolean;
    get canUndo(): boolean;
    get canRedo(): boolean;
    /** Calls `listener` after every change, undo and redo; returns a function that unsubscribes. */
    onChange(listener: () => void): () => void;
    private checkIndex;
    private commit;
    private emit;
    /** Groups several changes into one undo step. */
    transact(change: () => void): void;
    undo(): boolean;
    redo(): boolean;
    private decodeSlot;
    /** A copy of a frame; changes to it are only kept after setFrame(). */
    getFrame(index: number): TFrame;
    /** Per-frame values (paper, pens or colors, depths, sound flags) without decoding pixels. */
    getFrameInfo(index: number): Omit<TFrame, 'layers'>;
    /** Composited palette indices of a frame, for display. */
    renderFrame(index: number, options?: KwzRenderOptions, target?: Uint8Array): Uint8Array;
    private createSlot;
    private replaceSlots;
    setFrame(index: number, frame: TFrame): void;
    /** Edits a copy of a frame in `change` and stores the result as one undo step. */
    editFrame(index: number, change: (frame: TFrame) => void): void;
    /** Changes per-frame values (paper, pens or colors, depths, sound flags) without touching pixels. */
    setFrameInfo(index: number, info: Partial<FrameInfo>): void;
    /**
     * Changes the paper of frames `start` to `end` (default: every frame) as one undo step,
     * keeping ink visible (see changePaper).
     */
    setPaper(paper: number, options?: {
        start?: number;
        end?: number;
        mode?: PaperInkMode;
    }): void;
    /** Blank frame with the paper and colors of a neighbouring frame. */
    createBlankFrame(like?: number): TFrame;
    /** Inserts `frame` (or a blank one) before `index`. */
    insertFrame(index: number, frame?: TFrame): void;
    /** Copies a frame right after itself; the copy shares data until edited. */
    duplicateFrame(index: number): void;
    removeFrames(index: number, count?: number): void;
    moveFrame(from: number, to: number): void;
    setMeta(patch: Partial<PpmMeta> | Partial<KwzMeta>): void;
    /** Decodes a track as the app would play it, or null when it is empty. */
    getTrack(name: TrackName): Pcm | null;
    /** Stores PCM (any rate) as a track in the app's own format, cut to its time limit; null removes it. */
    setTrack(name: TrackName, pcm: Pcm | null): void;
    private firstChangedFrame;
    private isThumbnailStale;
    private renderThumbnail;
    /** Decodes slots sequentially from `start`, reusing the source decoder's chain. */
    private framesFrom;
    private buildPpm;
    private buildKwz;
    /**
     * Builds the edited note. Without changes the original is returned untouched; otherwise frames
     * before the first change keep their encoded data, and the app's save rules are applied.
     */
    toNote(options?: DocumentSaveOptions): NoteFile;
    /** Everything that would keep the console from accepting the note, checked before saving. */
    preflight(options?: DocumentSaveOptions): PreflightReport;
    /** Builds, signs (with `key`) and serializes the edited note. */
    save(options?: DocumentSaveOptions): Uint8Array;
}
export {};
