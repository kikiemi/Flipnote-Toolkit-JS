import { decodeKwzAdpcm, decodePpmAdpcm } from '../audio/adpcm.ts';
import type { Pcm } from '../audio/pcm.ts';
import { check, ignoreWarning, type WarningHandler } from '../core/errors.ts';
import type { RsaPrivateKey } from '../core/rsa.ts';
import { createKwz, encodeKwzTracks } from '../kwz/kwz-create.ts';
import {
  copyKwzFrameInfo,
  createKwzFrame,
  decodeKwzLayer,
  encodeKwzKeyFrame,
  KwzFrameDecoder,
  KwzFrameEncoder,
} from '../kwz/kwz-frame-codec.ts';
import { renderKwzFrame, type KwzRenderOptions } from '../kwz/kwz-render.ts';
import { createKwzThumbnail } from '../kwz/kwz-thumbnail.ts';
import {
  KWZ_DEFAULT_FRAME_EXTRA_FLAGS,
  KWZ_HEIGHT,
  KWZ_LAYER_SIZE,
  KWZ_SAMPLE_RATE,
  KWZ_WIDTH,
  type KwzFile,
  type KwzFrame,
  type KwzFrameInfo,
  type KwzFrameRecord,
  type KwzMeta,
  type KwzTracks,
} from '../kwz/kwz-types.ts';
import { decodeTrack, type TrackName } from '../note/audio.ts';
import { preflightNote, type PreflightReport } from '../note/check.ts';
import { writeNote, type NoteFile, type NoteFormat } from '../note/note.ts';
import { applySaveRules, canEditNote, type NoteAuthor, type SaveOptions } from '../note/save.ts';
import { createPpm, encodePpmTracks } from '../ppm/ppm-create.ts';
import {
  copyPpmFrameInfo,
  createPpmFrame,
  decodePpmFrame,
  encodePpmKeyFrame,
  getPpmFrameData,
  packPpmAnimation,
  PpmFrameDecoder,
  PpmFrameEncoder,
} from '../ppm/ppm-frame-codec.ts';
import { renderPpmFrame } from '../ppm/ppm-render.ts';
import { createPpmThumbnail } from '../ppm/ppm-thumbnail.ts';
import {
  PPM_HEIGHT,
  PPM_LAYER_SIZE,
  PPM_SAMPLE_RATE,
  PPM_WIDTH,
  type PpmFile,
  type PpmFrame,
  type PpmFrameInfo,
  type PpmMeta,
  type PpmTracks,
} from '../ppm/ppm-types.ts';
import { changePaper, type PaperInkMode } from './paper.ts';

export type DocumentFrame = PpmFrame | KwzFrame;
type FrameInfo = PpmFrameInfo | KwzFrameInfo;

/** An immutable frame: a frame of the source note, or key-encoded layers once edited. */
interface FrameSlot {
  readonly source: number;
  readonly encoded: readonly Uint8Array[] | null;
  readonly info: Readonly<FrameInfo>;
}

interface DocumentState {
  readonly slots: readonly FrameSlot[];
  readonly meta: Readonly<PpmMeta | KwzMeta>;
  readonly tracks: Readonly<PpmTracks | KwzTracks> | null;
}

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

function cloneFrame<T extends DocumentFrame>(frame: T): T {
  return { ...frame, ...cloneInfo(frame), layers: frame.layers.map((layer) => layer.slice()) } as T;
}

function cloneInfo(info: FrameInfo): FrameInfo {
  return 'pens' in info ? copyPpmFrameInfo(info) : copyKwzFrameInfo(info);
}

function infoOf(frame: DocumentFrame): FrameInfo {
  const { layers: _layers, ...info } = frame;
  return cloneInfo(info as FrameInfo);
}

/**
 * Editable note that keeps layers, per-frame colors, depths, sound flags and frame authors.
 * Frames stay compressed until used; every change can be undone; saving re-encodes only
 * from the first changed frame and follows the app's save rules.
 */
export class NoteDocument<TFrame extends DocumentFrame = DocumentFrame> {
  readonly format: NoteFormat;
  readonly width: number;
  readonly height: number;
  readonly layerCount: number;
  author: NoteAuthor | null;
  private readonly note: NoteFile;
  private readonly initial: DocumentState;
  private state: DocumentState;
  private past: DocumentState[] = [];
  private future: DocumentState[] = [];
  private readonly historyLimit: number;
  private readonly cacheSize: number;
  private readonly cache = new Map<FrameSlot, TFrame>();
  private readonly ppmDecoder: PpmFrameDecoder | null;
  private readonly kwzDecoder: KwzFrameDecoder | null;
  private readonly listeners = new Set<() => void>();
  private readonly warn: WarningHandler;
  private transactionDepth = 0;
  private transactionStart: DocumentState | null = null;

  constructor(note: NoteFile, options: DocumentOptions = {}) {
    if (options.author) {
      check(
        canEditNote(note, options.author.id),
        'INVALID_ARGUMENT',
        'This note is locked by its author',
      );
    }
    this.note = note;
    this.format = note.format;
    this.author = options.author ?? null;
    this.historyLimit = options.historyLimit ?? 100;
    this.cacheSize = options.cacheSize ?? 16;
    this.warn = options.onWarning ?? ignoreWarning;
    const isPpm = note.format === 'ppm';
    this.width = isPpm ? PPM_WIDTH : KWZ_WIDTH;
    this.height = isPpm ? PPM_HEIGHT : KWZ_HEIGHT;
    this.layerCount = isPpm ? 2 : 3;
    this.ppmDecoder = isPpm ? new PpmFrameDecoder(note) : null;
    this.kwzDecoder = isPpm ? null : new KwzFrameDecoder(note, { isTolerant: true });
    const slots: FrameSlot[] = [];
    if (note.format === 'ppm') {
      const { data, offsets, soundFlags } = note.animation;
      offsets.forEach((offset, source) => {
        const header = data[offset];
        const info: PpmFrameInfo = {
          paper: header & 1,
          pens: [(header >> 1) & 3, (header >> 3) & 3],
          soundFlags: soundFlags[source],
        };
        slots.push({ source, encoded: null, info });
      });
    } else {
      note.frames.forEach((frame, source) =>
        slots.push({ source, encoded: null, info: copyKwzFrameInfo(frame) }),
      );
    }
    this.initial = { slots, meta: { ...note.meta }, tracks: note.tracks };
    this.state = this.initial;
  }

  /** Opens a note for editing. */
  static open(note: PpmFile, options?: DocumentOptions): NoteDocument<PpmFrame>;
  static open(note: KwzFile, options?: DocumentOptions): NoteDocument<KwzFrame>;
  static open(note: NoteFile, options?: DocumentOptions): NoteDocument;
  static open(note: NoteFile, options: DocumentOptions = {}): NoteDocument {
    return new NoteDocument(note, options);
  }

  /** Starts a blank note with one empty frame. */
  static create(format: 'ppm', options?: DocumentOptions): NoteDocument<PpmFrame>;
  static create(format: 'kwz', options?: DocumentOptions): NoteDocument<KwzFrame>;
  static create(format: NoteFormat, options?: DocumentOptions): NoteDocument;
  static create(format: NoteFormat, options: DocumentOptions = {}): NoteDocument {
    const author = options.author;
    if (format === 'ppm') {
      const meta = author
        ? { currentAuthorId: author.id.toUpperCase(), currentAuthorName: author.name }
        : {};
      return new NoteDocument(createPpm({ frames: [createPpmFrame()], meta }), options);
    }
    const meta = author
      ? { currentAuthorId: author.id.toLowerCase(), currentAuthorName: author.name }
      : {};
    return new NoteDocument(createKwz({ frames: [createKwzFrame({ paper: 0 })], meta }), options);
  }

  get frameCount(): number {
    return this.state.slots.length;
  }

  get meta(): Readonly<PpmMeta | KwzMeta> {
    return this.state.meta;
  }

  get isModified(): boolean {
    return this.state !== this.initial;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Calls `listener` after every change, undo and redo; returns a function that unsubscribes. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private checkIndex(index: number, allowEnd = false): void {
    const limit = allowEnd ? this.frameCount : this.frameCount - 1;
    check(
      Number.isInteger(index) && index >= 0 && index <= limit,
      'INVALID_ARGUMENT',
      `Frame ${index} does not exist`,
    );
  }

  private commit(next: Partial<DocumentState>): void {
    const state = { ...this.state, ...next };
    if (this.transactionDepth > 0) {
      this.state = state;
      return;
    }
    this.past.push(this.state);
    if (this.past.length > this.historyLimit) this.past.shift();
    this.future = [];
    this.state = state;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  /** Groups several changes into one undo step. */
  transact(change: () => void): void {
    if (this.transactionDepth++ === 0) this.transactionStart = this.state;
    try {
      change();
    } finally {
      if (--this.transactionDepth === 0) {
        const start = this.transactionStart!;
        this.transactionStart = null;
        if (this.state !== start) {
          this.past.push(start);
          if (this.past.length > this.historyLimit) this.past.shift();
          this.future = [];
          this.emit();
        }
      }
    }
  }

  undo(): boolean {
    const previous = this.past.pop();
    if (!previous) return false;
    this.future.push(this.state);
    this.state = previous;
    this.emit();
    return true;
  }

  redo(): boolean {
    const next = this.future.pop();
    if (!next) return false;
    this.past.push(this.state);
    this.state = next;
    this.emit();
    return true;
  }

  private decodeSlot(slot: FrameSlot): TFrame {
    const cached = this.cache.get(slot);
    if (cached) {
      this.cache.delete(slot);
      this.cache.set(slot, cached);
      return cached;
    }
    let frame: DocumentFrame;
    if (slot.encoded) {
      if (this.format === 'ppm') {
        const layers: [Uint8Array, Uint8Array] = [
          new Uint8Array(PPM_LAYER_SIZE),
          new Uint8Array(PPM_LAYER_SIZE),
        ];
        decodePpmFrame(slot.encoded[0], 0, layers, layers);
        frame = { ...(cloneInfo(slot.info) as PpmFrameInfo), layers };
      } else {
        const layers: [Uint8Array, Uint8Array, Uint8Array] = [
          new Uint8Array(KWZ_LAYER_SIZE),
          new Uint8Array(KWZ_LAYER_SIZE),
          new Uint8Array(KWZ_LAYER_SIZE),
        ];
        slot.encoded.forEach((data, layer) => decodeKwzLayer(data, layers[layer]));
        frame = { ...(cloneInfo(slot.info) as KwzFrameInfo), layers };
      }
    } else {
      const decoded = this.ppmDecoder
        ? this.ppmDecoder.decode(slot.source)
        : this.kwzDecoder!.decode(slot.source);
      frame = {
        ...cloneInfo(slot.info),
        layers: decoded.layers.map((layer) => layer.slice()),
      } as DocumentFrame;
    }
    this.cache.set(slot, frame as TFrame);
    if (this.cache.size > this.cacheSize) this.cache.delete(this.cache.keys().next().value!);
    return frame as TFrame;
  }

  /** A copy of a frame; changes to it are only kept after setFrame(). */
  getFrame(index: number): TFrame {
    this.checkIndex(index);
    return cloneFrame(this.decodeSlot(this.state.slots[index]));
  }

  /** Per-frame values (paper, pens or colors, depths, sound flags) without decoding pixels. */
  getFrameInfo(index: number): Omit<TFrame, 'layers'> {
    this.checkIndex(index);
    return cloneInfo(this.state.slots[index].info) as unknown as Omit<TFrame, 'layers'>;
  }

  /** Composited palette indices of a frame, for display. */
  renderFrame(index: number, options: KwzRenderOptions = {}, target?: Uint8Array): Uint8Array {
    this.checkIndex(index);
    const frame = this.decodeSlot(this.state.slots[index]);
    if ('pens' in frame) {
      return renderPpmFrame(frame, target, {
        visible: (this.state.meta as PpmMeta).isLayerVisible,
      });
    }
    return renderKwzFrame(frame, target, {
      visible: (this.state.meta as KwzMeta).isLayerVisible,
      ...options,
    });
  }

  private createSlot(frame: DocumentFrame): FrameSlot {
    check(
      frame.layers.length === this.layerCount,
      'INVALID_ARGUMENT',
      `Frames of this note have ${this.layerCount} layers`,
    );
    const size = this.width * this.height;
    for (const layer of frame.layers) {
      check(layer.length === size, 'INVALID_ARGUMENT', `Layers must have ${size} pixels`);
    }
    const info = infoOf(frame);
    if ('pens' in frame) {
      const slot: FrameSlot = { source: -1, encoded: [encodePpmKeyFrame(frame)], info };
      this.cache.set(slot, cloneFrame(frame) as TFrame);
      return slot;
    }
    const kwzInfo = info as KwzFrameInfo;
    if (this.author) kwzInfo.authorId = this.author.id.toLowerCase();
    const slot: FrameSlot = {
      source: -1,
      encoded: encodeKwzKeyFrame(frame).layerData,
      info: kwzInfo,
    };
    this.cache.set(slot, { ...cloneFrame(frame), ...kwzInfo } as TFrame);
    return slot;
  }

  private replaceSlots(start: number, remove: number, insert: readonly FrameSlot[]): void {
    const slots = [...this.state.slots];
    slots.splice(start, remove, ...insert);
    check(slots.length > 0, 'INVALID_ARGUMENT', 'A note needs at least one frame');
    this.commit({ slots });
  }

  setFrame(index: number, frame: TFrame): void {
    this.checkIndex(index);
    this.replaceSlots(index, 1, [this.createSlot(frame)]);
  }

  /** Edits a copy of a frame in `change` and stores the result as one undo step. */
  editFrame(index: number, change: (frame: TFrame) => void): void {
    const frame = this.getFrame(index);
    change(frame);
    this.setFrame(index, frame);
  }

  /** Changes per-frame values (paper, pens or colors, depths, sound flags) without touching pixels. */
  setFrameInfo(index: number, info: Partial<FrameInfo>): void {
    this.checkIndex(index);
    const slot = this.state.slots[index];
    const next: FrameSlot = { ...slot, info: { ...cloneInfo(slot.info), ...info } as FrameInfo };
    this.replaceSlots(index, 1, [next]);
  }

  /**
   * Changes the paper of frames `start` to `end` (default: every frame) as one undo step,
   * keeping ink visible (see changePaper).
   */
  setPaper(
    paper: number,
    options: { start?: number; end?: number; mode?: PaperInkMode } = {},
  ): void {
    const start = options.start ?? 0;
    const end = options.end ?? this.frameCount;
    this.checkIndex(start);
    this.transact(() => {
      for (let index = start; index < Math.min(end, this.frameCount); index++) {
        const info = this.state.slots[index].info;
        this.setFrameInfo(index, changePaper(cloneInfo(info), paper, options.mode));
      }
    });
  }

  /** Blank frame with the paper and colors of a neighbouring frame. */
  createBlankFrame(like = 0): TFrame {
    const info = this.state.slots[Math.min(like, this.frameCount - 1)]?.info;
    if (this.format === 'ppm') {
      const ppm = info as PpmFrameInfo | undefined;
      return createPpmFrame(ppm ? { paper: ppm.paper, pens: ppm.pens } : {}) as TFrame;
    }
    const kwz = info as KwzFrameInfo | undefined;
    return createKwzFrame(kwz ? { ...copyKwzFrameInfo(kwz), soundFlags: 0 } : {}) as TFrame;
  }

  /** Inserts `frame` (or a blank one) before `index`. */
  insertFrame(index: number, frame?: TFrame): void {
    this.checkIndex(index, true);
    this.replaceSlots(index, 0, [
      this.createSlot(frame ?? this.createBlankFrame(Math.max(0, index - 1))),
    ]);
  }

  /** Copies a frame right after itself; the copy shares data until edited. */
  duplicateFrame(index: number): void {
    this.checkIndex(index);
    this.replaceSlots(index + 1, 0, [this.state.slots[index]]);
  }

  removeFrames(index: number, count = 1): void {
    this.checkIndex(index);
    this.replaceSlots(index, Math.min(count, this.frameCount - index), []);
  }

  moveFrame(from: number, to: number): void {
    this.checkIndex(from);
    this.checkIndex(to);
    const slots = [...this.state.slots];
    const [slot] = slots.splice(from, 1);
    slots.splice(to, 0, slot);
    this.commit({ slots });
  }

  setMeta(patch: Partial<PpmMeta> | Partial<KwzMeta>): void {
    this.commit({ meta: { ...this.state.meta, ...patch } as PpmMeta | KwzMeta });
  }

  /** Decodes a track as the app would play it, or null when it is empty. */
  getTrack(name: TrackName): Pcm | null {
    const tracks = this.state.tracks as Record<string, Uint8Array> | null;
    const data = tracks?.[name];
    if (!data || data.length === 0) return null;
    const original = (this.note.tracks as Record<string, Uint8Array> | null)?.[name];
    if (data === original) return decodeTrack(this.note, name);
    if (this.format === 'ppm') {
      return { samples: decodePpmAdpcm(data), sampleRate: PPM_SAMPLE_RATE };
    }
    return { samples: decodeKwzAdpcm(data), sampleRate: KWZ_SAMPLE_RATE };
  }

  /** Stores PCM (any rate) as a track in the app's own format, cut to its time limit; null removes it. */
  setTrack(name: TrackName, pcm: Pcm | null): void {
    if (this.format === 'ppm') {
      check(name !== 'se4', 'INVALID_ARGUMENT', 'PPM has no fourth sound effect');
      const tracks = encodePpmTracks({ [name]: pcm }, this.state.tracks as PpmTracks, this.warn);
      this.commit({ tracks });
      return;
    }
    const tracks = encodeKwzTracks(
      { [name]: pcm },
      this.state.tracks as KwzTracks | null,
      this.warn,
    );
    this.commit({ tracks });
  }

  private firstChangedFrame(): number {
    const { slots } = this.state;
    const initial = this.initial.slots;
    let index = 0;
    while (index < slots.length && index < initial.length && slots[index] === initial[index]) {
      index++;
    }
    return index;
  }

  private isThumbnailStale(): boolean {
    const meta = this.state.meta;
    const original = this.initial.meta;
    return (
      meta.thumbnailIndex !== original.thumbnailIndex ||
      meta.isLayerVisible.some((value, i) => value !== original.isLayerVisible[i])
    );
  }

  private renderThumbnail(): Uint8Array {
    const meta = this.state.meta;
    const index = meta.thumbnailIndex < this.frameCount ? meta.thumbnailIndex : 0;
    const frame = this.decodeSlot(this.state.slots[index]);
    if ('pens' in frame) {
      return createPpmThumbnail(
        renderPpmFrame(frame, undefined, { visible: (meta as PpmMeta).isLayerVisible }),
      );
    }
    return createKwzThumbnail(
      renderKwzFrame(frame, undefined, { visible: (meta as KwzMeta).isLayerVisible }),
    );
  }

  /** Decodes slots sequentially from `start`, reusing the source decoder's chain. */
  private *framesFrom(start: number): Generator<TFrame> {
    for (let index = start; index < this.frameCount; index++) {
      const slot = this.state.slots[index];
      if (slot.encoded) {
        yield this.decodeSlot(slot);
        continue;
      }
      const decoded = this.ppmDecoder
        ? this.ppmDecoder.decode(slot.source)
        : this.kwzDecoder!.decode(slot.source);
      yield { ...cloneInfo(slot.info), layers: decoded.layers } as TFrame;
    }
  }

  private buildPpm(note: PpmFile): PpmFile {
    const meta = { ...(this.state.meta as PpmMeta) };
    const start = this.firstChangedFrame();
    const encoded: Uint8Array[] = [];
    for (let i = 0; i < start; i++) encoded.push(getPpmFrameData(note.animation, i));
    const encoder = new PpmFrameEncoder();
    if (start > 0) encoder.encode(this.framesFrom(start - 1).next().value as PpmFrame);
    for (const frame of this.framesFrom(start)) encoded.push(encoder.encode(frame as PpmFrame));
    const soundFlags = this.state.slots.map((slot) => slot.info.soundFlags);
    if (meta.thumbnailIndex >= this.frameCount) meta.thumbnailIndex = 0;
    return {
      ...note,
      meta,
      animation: packPpmAnimation(encoded, soundFlags),
      tracks: this.state.tracks as PpmTracks,
      thumbnail: this.renderThumbnail(),
    };
  }

  private buildKwz(note: KwzFile): KwzFile {
    const meta = { ...(this.state.meta as KwzMeta) };
    const start = this.firstChangedFrame();
    const frames: KwzFrameRecord[] = note.frames.slice(0, start);
    const encoder = new KwzFrameEncoder();
    if (start > 0) encoder.encode(this.framesFrom(start - 1).next().value as KwzFrame);
    let index = start;
    for (const frame of this.framesFrom(start)) {
      const slot = this.state.slots[index++];
      const original = slot.encoded ? null : note.frames[slot.source];
      const { layerData, keyLayers } = encoder.encode(frame as KwzFrame);
      frames.push({
        ...copyKwzFrameInfo(slot.info as KwzFrameInfo),
        layerData,
        keyLayers,
        extraFlags: original?.extraFlags ?? KWZ_DEFAULT_FRAME_EXTRA_FLAGS,
        reserved: original?.reserved ?? 0,
      });
    }
    if (meta.thumbnailIndex >= this.frameCount) meta.thumbnailIndex = 0;
    return {
      ...note,
      meta,
      frames,
      tracks: this.state.tracks as KwzTracks | null,
      thumbnail: note.thumbnail ? this.renderThumbnail() : null,
    };
  }

  /**
   * Builds the edited note. Without changes the original is returned untouched; otherwise frames
   * before the first change keep their encoded data, and the app's save rules are applied.
   */
  toNote(options: DocumentSaveOptions = {}): NoteFile {
    if (!this.isModified) return this.note;
    const { slots } = this.state;
    const areFramesChanged =
      slots.length !== this.initial.slots.length ||
      slots.some((slot, i) => slot !== this.initial.slots[i]);
    let note: NoteFile;
    if (areFramesChanged) {
      note = this.note.format === 'ppm' ? this.buildPpm(this.note) : this.buildKwz(this.note);
    } else {
      note = { ...this.note, meta: { ...this.state.meta }, tracks: this.state.tracks } as NoteFile;
      if (this.isThumbnailStale() && note.thumbnail) note.thumbnail = this.renderThumbnail();
    }
    if (options.isApplyingSaveRules === false) return note;
    return applySaveRules(note, { ...options, author: this.author ?? undefined });
  }

  /** Everything that would keep the console from accepting the note, checked before saving. */
  preflight(options: DocumentSaveOptions = {}): PreflightReport {
    return preflightNote(this.toNote(options), {
      key: options.key,
      author: this.author ?? undefined,
    });
  }

  /** Builds, signs (with `key`) and serializes the edited note. */
  save(options: DocumentSaveOptions = {}): Uint8Array {
    return writeNote(this.toNote(options), { key: options.key, onWarning: this.warn });
  }
}
