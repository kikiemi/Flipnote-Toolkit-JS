import { decodeKwzAdpcm, decodePpmAdpcm } from '../audio/adpcm.js';
import { check, ignoreWarning } from '../core/errors.js';
import { createKwz, encodeKwzTracks } from '../kwz/kwz-create.js';
import { copyKwzFrameInfo, createKwzFrame, decodeKwzLayer, encodeKwzKeyFrame, KwzFrameDecoder, KwzFrameEncoder, } from '../kwz/kwz-frame-codec.js';
import { renderKwzFrame } from '../kwz/kwz-render.js';
import { createKwzThumbnail } from '../kwz/kwz-thumbnail.js';
import { KWZ_DEFAULT_FRAME_EXTRA_FLAGS, KWZ_HEIGHT, KWZ_LAYER_SIZE, KWZ_SAMPLE_RATE, KWZ_WIDTH, } from '../kwz/kwz-types.js';
import { decodeTrack } from '../note/audio.js';
import { preflightNote } from '../note/check.js';
import { writeNote } from '../note/note.js';
import { applySaveRules, canEditNote } from '../note/save.js';
import { createPpm, encodePpmTracks } from '../ppm/ppm-create.js';
import { copyPpmFrameInfo, createPpmFrame, decodePpmFrame, encodePpmKeyFrame, getPpmFrameData, packPpmAnimation, PpmFrameDecoder, PpmFrameEncoder, } from '../ppm/ppm-frame-codec.js';
import { renderPpmFrame } from '../ppm/ppm-render.js';
import { createPpmThumbnail } from '../ppm/ppm-thumbnail.js';
import { PPM_HEIGHT, PPM_LAYER_SIZE, PPM_SAMPLE_RATE, PPM_WIDTH, } from '../ppm/ppm-types.js';
import { changePaper } from './paper.js';
function cloneFrame(frame) {
    return { ...frame, ...cloneInfo(frame), layers: frame.layers.map((layer) => layer.slice()) };
}
function cloneInfo(info) {
    return 'pens' in info ? copyPpmFrameInfo(info) : copyKwzFrameInfo(info);
}
function infoOf(frame) {
    const { layers: _layers, ...info } = frame;
    return cloneInfo(info);
}
/**
 * Editable note that keeps layers, per-frame colors, depths, sound flags and frame authors.
 * Frames stay compressed until used; every change can be undone; saving re-encodes only
 * from the first changed frame and follows the app's save rules.
 */
export class NoteDocument {
    format;
    width;
    height;
    layerCount;
    author;
    note;
    initial;
    state;
    past = [];
    future = [];
    historyLimit;
    cacheSize;
    cache = new Map();
    ppmDecoder;
    kwzDecoder;
    listeners = new Set();
    warn;
    transactionDepth = 0;
    transactionStart = null;
    constructor(note, options = {}) {
        if (options.author) {
            check(canEditNote(note, options.author.id), 'INVALID_ARGUMENT', 'This note is locked by its author');
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
        const slots = [];
        if (note.format === 'ppm') {
            const { data, offsets, soundFlags } = note.animation;
            offsets.forEach((offset, source) => {
                const header = data[offset];
                const info = {
                    paper: header & 1,
                    pens: [(header >> 1) & 3, (header >> 3) & 3],
                    soundFlags: soundFlags[source],
                };
                slots.push({ source, encoded: null, info });
            });
        }
        else {
            note.frames.forEach((frame, source) => slots.push({ source, encoded: null, info: copyKwzFrameInfo(frame) }));
        }
        this.initial = { slots, meta: { ...note.meta }, tracks: note.tracks };
        this.state = this.initial;
    }
    static open(note, options = {}) {
        return new NoteDocument(note, options);
    }
    static create(format, options = {}) {
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
    get frameCount() {
        return this.state.slots.length;
    }
    get meta() {
        return this.state.meta;
    }
    get isModified() {
        return this.state !== this.initial;
    }
    get canUndo() {
        return this.past.length > 0;
    }
    get canRedo() {
        return this.future.length > 0;
    }
    /** Calls `listener` after every change, undo and redo; returns a function that unsubscribes. */
    onChange(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    checkIndex(index, allowEnd = false) {
        const limit = allowEnd ? this.frameCount : this.frameCount - 1;
        check(Number.isInteger(index) && index >= 0 && index <= limit, 'INVALID_ARGUMENT', `Frame ${index} does not exist`);
    }
    commit(next) {
        const state = { ...this.state, ...next };
        if (this.transactionDepth > 0) {
            this.state = state;
            return;
        }
        this.past.push(this.state);
        if (this.past.length > this.historyLimit)
            this.past.shift();
        this.future = [];
        this.state = state;
        this.emit();
    }
    emit() {
        for (const listener of this.listeners)
            listener();
    }
    /** Groups several changes into one undo step. */
    transact(change) {
        if (this.transactionDepth++ === 0)
            this.transactionStart = this.state;
        try {
            change();
        }
        finally {
            if (--this.transactionDepth === 0) {
                const start = this.transactionStart;
                this.transactionStart = null;
                if (this.state !== start) {
                    this.past.push(start);
                    if (this.past.length > this.historyLimit)
                        this.past.shift();
                    this.future = [];
                    this.emit();
                }
            }
        }
    }
    undo() {
        const previous = this.past.pop();
        if (!previous)
            return false;
        this.future.push(this.state);
        this.state = previous;
        this.emit();
        return true;
    }
    redo() {
        const next = this.future.pop();
        if (!next)
            return false;
        this.past.push(this.state);
        this.state = next;
        this.emit();
        return true;
    }
    decodeSlot(slot) {
        const cached = this.cache.get(slot);
        if (cached) {
            this.cache.delete(slot);
            this.cache.set(slot, cached);
            return cached;
        }
        let frame;
        if (slot.encoded) {
            if (this.format === 'ppm') {
                const layers = [
                    new Uint8Array(PPM_LAYER_SIZE),
                    new Uint8Array(PPM_LAYER_SIZE),
                ];
                decodePpmFrame(slot.encoded[0], 0, layers, layers);
                frame = { ...cloneInfo(slot.info), layers };
            }
            else {
                const layers = [
                    new Uint8Array(KWZ_LAYER_SIZE),
                    new Uint8Array(KWZ_LAYER_SIZE),
                    new Uint8Array(KWZ_LAYER_SIZE),
                ];
                slot.encoded.forEach((data, layer) => decodeKwzLayer(data, layers[layer]));
                frame = { ...cloneInfo(slot.info), layers };
            }
        }
        else {
            const decoded = this.ppmDecoder
                ? this.ppmDecoder.decode(slot.source)
                : this.kwzDecoder.decode(slot.source);
            frame = {
                ...cloneInfo(slot.info),
                layers: decoded.layers.map((layer) => layer.slice()),
            };
        }
        this.cache.set(slot, frame);
        if (this.cache.size > this.cacheSize)
            this.cache.delete(this.cache.keys().next().value);
        return frame;
    }
    /** A copy of a frame; changes to it are only kept after setFrame(). */
    getFrame(index) {
        this.checkIndex(index);
        return cloneFrame(this.decodeSlot(this.state.slots[index]));
    }
    /** Per-frame values (paper, pens or colors, depths, sound flags) without decoding pixels. */
    getFrameInfo(index) {
        this.checkIndex(index);
        return cloneInfo(this.state.slots[index].info);
    }
    /** Composited palette indices of a frame, for display. */
    renderFrame(index, options = {}, target) {
        this.checkIndex(index);
        const frame = this.decodeSlot(this.state.slots[index]);
        if ('pens' in frame) {
            return renderPpmFrame(frame, target, {
                visible: this.state.meta.isLayerVisible,
            });
        }
        return renderKwzFrame(frame, target, {
            visible: this.state.meta.isLayerVisible,
            ...options,
        });
    }
    createSlot(frame) {
        check(frame.layers.length === this.layerCount, 'INVALID_ARGUMENT', `Frames of this note have ${this.layerCount} layers`);
        const size = this.width * this.height;
        for (const layer of frame.layers) {
            check(layer.length === size, 'INVALID_ARGUMENT', `Layers must have ${size} pixels`);
        }
        const info = infoOf(frame);
        if ('pens' in frame) {
            const slot = { source: -1, encoded: [encodePpmKeyFrame(frame)], info };
            this.cache.set(slot, cloneFrame(frame));
            return slot;
        }
        const kwzInfo = info;
        if (this.author)
            kwzInfo.authorId = this.author.id.toLowerCase();
        const slot = {
            source: -1,
            encoded: encodeKwzKeyFrame(frame).layerData,
            info: kwzInfo,
        };
        this.cache.set(slot, { ...cloneFrame(frame), ...kwzInfo });
        return slot;
    }
    replaceSlots(start, remove, insert) {
        const slots = [...this.state.slots];
        slots.splice(start, remove, ...insert);
        check(slots.length > 0, 'INVALID_ARGUMENT', 'A note needs at least one frame');
        this.commit({ slots });
    }
    setFrame(index, frame) {
        this.checkIndex(index);
        this.replaceSlots(index, 1, [this.createSlot(frame)]);
    }
    /** Edits a copy of a frame in `change` and stores the result as one undo step. */
    editFrame(index, change) {
        const frame = this.getFrame(index);
        change(frame);
        this.setFrame(index, frame);
    }
    /** Changes per-frame values (paper, pens or colors, depths, sound flags) without touching pixels. */
    setFrameInfo(index, info) {
        this.checkIndex(index);
        const slot = this.state.slots[index];
        const next = { ...slot, info: { ...cloneInfo(slot.info), ...info } };
        this.replaceSlots(index, 1, [next]);
    }
    /**
     * Changes the paper of frames `start` to `end` (default: every frame) as one undo step,
     * keeping ink visible (see changePaper).
     */
    setPaper(paper, options = {}) {
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
    createBlankFrame(like = 0) {
        const info = this.state.slots[Math.min(like, this.frameCount - 1)]?.info;
        if (this.format === 'ppm') {
            const ppm = info;
            return createPpmFrame(ppm ? { paper: ppm.paper, pens: ppm.pens } : {});
        }
        const kwz = info;
        return createKwzFrame(kwz ? { ...copyKwzFrameInfo(kwz), soundFlags: 0 } : {});
    }
    /** Inserts `frame` (or a blank one) before `index`. */
    insertFrame(index, frame) {
        this.checkIndex(index, true);
        this.replaceSlots(index, 0, [
            this.createSlot(frame ?? this.createBlankFrame(Math.max(0, index - 1))),
        ]);
    }
    /** Copies a frame right after itself; the copy shares data until edited. */
    duplicateFrame(index) {
        this.checkIndex(index);
        this.replaceSlots(index + 1, 0, [this.state.slots[index]]);
    }
    removeFrames(index, count = 1) {
        this.checkIndex(index);
        this.replaceSlots(index, Math.min(count, this.frameCount - index), []);
    }
    moveFrame(from, to) {
        this.checkIndex(from);
        this.checkIndex(to);
        const slots = [...this.state.slots];
        const [slot] = slots.splice(from, 1);
        slots.splice(to, 0, slot);
        this.commit({ slots });
    }
    setMeta(patch) {
        this.commit({ meta: { ...this.state.meta, ...patch } });
    }
    /** Decodes a track as the app would play it, or null when it is empty. */
    getTrack(name) {
        const tracks = this.state.tracks;
        const data = tracks?.[name];
        if (!data || data.length === 0)
            return null;
        const original = this.note.tracks?.[name];
        if (data === original)
            return decodeTrack(this.note, name);
        if (this.format === 'ppm') {
            return { samples: decodePpmAdpcm(data), sampleRate: PPM_SAMPLE_RATE };
        }
        return { samples: decodeKwzAdpcm(data), sampleRate: KWZ_SAMPLE_RATE };
    }
    /** Stores PCM (any rate) as a track in the app's own format, cut to its time limit; null removes it. */
    setTrack(name, pcm) {
        if (this.format === 'ppm') {
            check(name !== 'se4', 'INVALID_ARGUMENT', 'PPM has no fourth sound effect');
            const tracks = encodePpmTracks({ [name]: pcm }, this.state.tracks, this.warn);
            this.commit({ tracks });
            return;
        }
        const tracks = encodeKwzTracks({ [name]: pcm }, this.state.tracks, this.warn);
        this.commit({ tracks });
    }
    firstChangedFrame() {
        const { slots } = this.state;
        const initial = this.initial.slots;
        let index = 0;
        while (index < slots.length && index < initial.length && slots[index] === initial[index]) {
            index++;
        }
        return index;
    }
    isThumbnailStale() {
        const meta = this.state.meta;
        const original = this.initial.meta;
        return (meta.thumbnailIndex !== original.thumbnailIndex ||
            meta.isLayerVisible.some((value, i) => value !== original.isLayerVisible[i]));
    }
    renderThumbnail() {
        const meta = this.state.meta;
        const index = meta.thumbnailIndex < this.frameCount ? meta.thumbnailIndex : 0;
        const frame = this.decodeSlot(this.state.slots[index]);
        if ('pens' in frame) {
            return createPpmThumbnail(renderPpmFrame(frame, undefined, { visible: meta.isLayerVisible }));
        }
        return createKwzThumbnail(renderKwzFrame(frame, undefined, { visible: meta.isLayerVisible }));
    }
    /** Decodes slots sequentially from `start`, reusing the source decoder's chain. */
    *framesFrom(start) {
        for (let index = start; index < this.frameCount; index++) {
            const slot = this.state.slots[index];
            if (slot.encoded) {
                yield this.decodeSlot(slot);
                continue;
            }
            const decoded = this.ppmDecoder
                ? this.ppmDecoder.decode(slot.source)
                : this.kwzDecoder.decode(slot.source);
            yield { ...cloneInfo(slot.info), layers: decoded.layers };
        }
    }
    buildPpm(note) {
        const meta = { ...this.state.meta };
        const start = this.firstChangedFrame();
        const encoded = [];
        for (let i = 0; i < start; i++)
            encoded.push(getPpmFrameData(note.animation, i));
        const encoder = new PpmFrameEncoder();
        if (start > 0)
            encoder.encode(this.framesFrom(start - 1).next().value);
        for (const frame of this.framesFrom(start))
            encoded.push(encoder.encode(frame));
        const soundFlags = this.state.slots.map((slot) => slot.info.soundFlags);
        if (meta.thumbnailIndex >= this.frameCount)
            meta.thumbnailIndex = 0;
        return {
            ...note,
            meta,
            animation: packPpmAnimation(encoded, soundFlags),
            tracks: this.state.tracks,
            thumbnail: this.renderThumbnail(),
        };
    }
    buildKwz(note) {
        const meta = { ...this.state.meta };
        const start = this.firstChangedFrame();
        const frames = note.frames.slice(0, start);
        const encoder = new KwzFrameEncoder();
        if (start > 0)
            encoder.encode(this.framesFrom(start - 1).next().value);
        let index = start;
        for (const frame of this.framesFrom(start)) {
            const slot = this.state.slots[index++];
            const original = slot.encoded ? null : note.frames[slot.source];
            const { layerData, keyLayers } = encoder.encode(frame);
            frames.push({
                ...copyKwzFrameInfo(slot.info),
                layerData,
                keyLayers,
                extraFlags: original?.extraFlags ?? KWZ_DEFAULT_FRAME_EXTRA_FLAGS,
                reserved: original?.reserved ?? 0,
            });
        }
        if (meta.thumbnailIndex >= this.frameCount)
            meta.thumbnailIndex = 0;
        return {
            ...note,
            meta,
            frames,
            tracks: this.state.tracks,
            thumbnail: note.thumbnail ? this.renderThumbnail() : null,
        };
    }
    /**
     * Builds the edited note. Without changes the original is returned untouched; otherwise frames
     * before the first change keep their encoded data, and the app's save rules are applied.
     */
    toNote(options = {}) {
        if (!this.isModified)
            return this.note;
        const { slots } = this.state;
        const areFramesChanged = slots.length !== this.initial.slots.length ||
            slots.some((slot, i) => slot !== this.initial.slots[i]);
        let note;
        if (areFramesChanged) {
            note = this.note.format === 'ppm' ? this.buildPpm(this.note) : this.buildKwz(this.note);
        }
        else {
            note = { ...this.note, meta: { ...this.state.meta }, tracks: this.state.tracks };
            if (this.isThumbnailStale() && note.thumbnail)
                note.thumbnail = this.renderThumbnail();
        }
        if (options.isApplyingSaveRules === false)
            return note;
        return applySaveRules(note, { ...options, author: this.author ?? undefined });
    }
    /** Everything that would keep the console from accepting the note, checked before saving. */
    preflight(options = {}) {
        return preflightNote(this.toNote(options), {
            key: options.key,
            author: this.author ?? undefined,
        });
    }
    /** Builds, signs (with `key`) and serializes the edited note. */
    save(options = {}) {
        return writeNote(this.toNote(options), { key: options.key, onWarning: this.warn });
    }
}
