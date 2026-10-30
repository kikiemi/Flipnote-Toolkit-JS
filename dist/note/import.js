import { check, ignoreWarning } from '../core/errors.js';
import { fitRgba } from '../image/image.js';
import { quantizeImage } from '../image/quantize.js';
import { createKwzMeta, encodeKwzTracks } from '../kwz/kwz-create.js';
import { createKwzFrame, KwzFrameEncoder } from '../kwz/kwz-frame-codec.js';
import { renderKwzFrame } from '../kwz/kwz-render.js';
import { createKwzThumbnail } from '../kwz/kwz-thumbnail.js';
import { KWZ_COLOR_NONE, KWZ_DEFAULT_FRAME_EXTRA_FLAGS, KWZ_FRAME_RATES, KWZ_HEIGHT, KWZ_LAYER_SIZE, KWZ_MAX_FRAME_DATA_SIZE, KWZ_MAX_FRAMES, KWZ_PALETTE, KWZ_WIDTH, } from '../kwz/kwz-types.js';
import { createPpmMeta, encodePpmTracks } from '../ppm/ppm-create.js';
import { createPpmFrame, packPpmAnimation, PpmFrameEncoder } from '../ppm/ppm-frame-codec.js';
import { renderPpmFrame } from '../ppm/ppm-render.js';
import { createPpmThumbnail } from '../ppm/ppm-thumbnail.js';
import { PPM_FRAME_RATES, PPM_HEIGHT, PPM_LAYER_SIZE, PPM_MAX_ANIMATION_SIZE, PPM_MAX_FRAMES, PPM_PALETTE, PPM_SIGNATURE_SIZE, PPM_WIDTH, } from '../ppm/ppm-types.js';
/** KWZ color slots used for imported images: A black/red, B blue/green, C yellow/white. */
const KWZ_SLOT_COLORS = [1, 2, 5, 4, 3, 0];
const KWZ_SLOT_OF_COLOR = [5, 0, 1, 4, 3, 2];
const DEFAULT_GIF_DELAY = 0.1;
function countColors(pixels, size) {
    const counts = new Array(size).fill(0);
    for (let i = 0; i < pixels.length; i++)
        counts[pixels[i]]++;
    return counts;
}
/** Quantizes a 256x192 image into a PPM frame (paper plus up to two pen colors). */
export function imageToPpmFrame(image, options = {}) {
    check(image.width === PPM_WIDTH && image.height === PPM_HEIGHT, 'INVALID_ARGUMENT', 'PPM frames are 256x192');
    let pixels = quantizeImage(image, PPM_PALETTE, [0, 1, 2, 3], { dither: options.dither });
    const counts = countColors(pixels, 4);
    const paper = options.paper === 0 || options.paper === 1 ? options.paper : counts[1] >= counts[0] ? 1 : 0;
    const inverse = paper ^ 1;
    const used = [0, 1, 2, 3]
        .filter((color) => color !== paper && counts[color] > 0)
        .sort((a, b) => counts[b] - counts[a]);
    const pens = used.slice(0, 2).sort((a, b) => (a === inverse ? -1 : b === inverse ? 1 : a - b));
    if (used.length > 2) {
        pixels = quantizeImage(image, PPM_PALETTE, [paper, ...pens], { dither: options.dither });
    }
    const frame = createPpmFrame({ paper });
    const penOf = (color) => (color === inverse ? 1 : color);
    frame.pens = [penOf(pens[0] ?? inverse), penOf(pens[1] ?? pens[0] ?? inverse)];
    const [a, b] = frame.layers;
    for (let i = 0; i < PPM_LAYER_SIZE; i++) {
        const color = pixels[i];
        if (color === pens[0])
            a[i] = 1;
        else if (color === pens[1])
            b[i] = 1;
    }
    return frame;
}
/** Quantizes a 320x240 image into a KWZ frame using fixed color slots per layer. */
export function imageToKwzFrame(image, options = {}) {
    check(image.width === KWZ_WIDTH && image.height === KWZ_HEIGHT, 'INVALID_ARGUMENT', 'KWZ frames are 320x240');
    const pixels = quantizeImage(image, KWZ_PALETTE, [0, 1, 2, 3, 4, 5], {
        dither: options.dither,
        transparentIndex: KWZ_COLOR_NONE,
    });
    const counts = countColors(pixels, 7);
    const paper = typeof options.paper === 'number' ? options.paper : counts.indexOf(Math.max(...counts));
    const frame = createKwzFrame({ paper, colors: [...KWZ_SLOT_COLORS] });
    for (let i = 0; i < KWZ_LAYER_SIZE; i++) {
        const color = pixels[i];
        if (color === paper || color === KWZ_COLOR_NONE)
            continue;
        const slot = KWZ_SLOT_OF_COLOR[color];
        frame.layers[slot >> 1][i] = (slot & 1) + 1;
    }
    return frame;
}
/** Nearest supported speed for a frame rate (compared on a log scale). */
export function findNearestSpeed(rates, frameRate, first = 0) {
    let best = first;
    for (let speed = first; speed < rates.length; speed++) {
        if (Math.abs(Math.log(rates[speed] / frameRate)) < Math.abs(Math.log(rates[best] / frameRate))) {
            best = speed;
        }
    }
    return best;
}
/**
 * Encodes frames one at a time, keeping only encoded data in memory. Images of any size are
 * fitted and quantized; frames beyond the app's memory limit are refused.
 */
export class NoteBuilder {
    format;
    width;
    height;
    frameSpeed;
    frameRate;
    /** True once a frame was refused because the note is full. */
    isFull = false;
    options;
    warn;
    ppmEncoder;
    kwzEncoder;
    ppmFrames = [];
    ppmSoundFlags = [];
    kwzFrames = [];
    thumbnail = null;
    dataSize = 0;
    dither;
    tracks = {};
    ppmMeta;
    kwzMeta;
    constructor(format, options = {}) {
        this.format = format;
        this.options = options;
        this.warn = options.onWarning ?? ignoreWarning;
        this.dither = options.dither ?? 'none';
        const rates = format === 'ppm' ? PPM_FRAME_RATES : KWZ_FRAME_RATES;
        this.frameSpeed = findNearestSpeed(rates, options.frameRate ?? 12, format === 'ppm' ? 1 : 0);
        this.frameRate = rates[this.frameSpeed];
        this.width = format === 'ppm' ? PPM_WIDTH : KWZ_WIDTH;
        this.height = format === 'ppm' ? PPM_HEIGHT : KWZ_HEIGHT;
        const speeds = { frameSpeed: this.frameSpeed, bgmSpeed: this.frameSpeed };
        this.ppmMeta = format === 'ppm' ? createPpmMeta({ ...speeds, ...options.ppmMeta }) : null;
        this.kwzMeta = format === 'kwz' ? createKwzMeta({ ...speeds, ...options.kwzMeta }) : null;
        this.ppmEncoder = format === 'ppm' ? new PpmFrameEncoder(options.keyFrameInterval ?? 0) : null;
        this.kwzEncoder = format === 'kwz' ? new KwzFrameEncoder(options.keyFrameInterval ?? 0) : null;
    }
    get frameCount() {
        return this.format === 'ppm' ? this.ppmFrames.length : this.kwzFrames.length;
    }
    get maxFrames() {
        return this.format === 'ppm' ? PPM_MAX_FRAMES : KWZ_MAX_FRAMES;
    }
    get maxDataSize() {
        return this.format === 'ppm' ? PPM_MAX_ANIMATION_SIZE : KWZ_MAX_FRAME_DATA_SIZE;
    }
    /** Drops dithering once the data grows faster than the expected frame count allows. */
    updateDither() {
        const expected = this.options.expectedFrameCount;
        if (!expected || this.dither === 'none' || this.frameCount < 4)
            return;
        const budget = (this.maxDataSize * this.frameCount) / Math.min(expected, this.maxFrames);
        if (this.dataSize > budget) {
            this.dither = 'none';
            this.warn('Dithering was turned off to keep the note within the memory limit');
        }
    }
    refuse(reason) {
        if (!this.isFull)
            this.warn(`Stopped at ${this.frameCount} frames: ${reason}`);
        this.isFull = true;
        return false;
    }
    /** Fits, quantizes and encodes an image; returns false when the note is full. */
    addImage(image, soundFlags = 0) {
        const { fit = 'contain', resize, background } = this.options;
        const fitted = fitRgba(image, this.width, this.height, fit, resize, background);
        const frameOptions = { dither: this.dither, paper: this.options.paper };
        if (this.format === 'ppm') {
            return this.addFrame({ ...imageToPpmFrame(fitted, frameOptions), soundFlags });
        }
        return this.addFrame({ ...imageToKwzFrame(fitted, frameOptions), soundFlags });
    }
    /** Encodes a decoded frame of the builder's format; returns false when the note is full. */
    addFrame(frame) {
        const isLimited = this.options.isRespectingLimits ?? true;
        if (isLimited && this.frameCount >= this.maxFrames) {
            return this.refuse(`the app allows ${this.maxFrames} frames`);
        }
        if (this.ppmEncoder && this.ppmMeta) {
            const ppmFrame = frame;
            if (isLimited && this.dataSize >= this.maxDataSize) {
                return this.refuse('the memory is full');
            }
            const data = this.ppmEncoder.encode(ppmFrame);
            if (this.frameCount === this.ppmMeta.thumbnailIndex || this.frameCount === 0) {
                this.thumbnail = createPpmThumbnail(renderPpmFrame(ppmFrame, undefined, { visible: this.ppmMeta.isLayerVisible }));
            }
            this.ppmFrames.push(data);
            this.ppmSoundFlags.push(ppmFrame.soundFlags);
            this.dataSize += data.length;
        }
        else if (this.kwzEncoder && this.kwzMeta) {
            const kwzFrame = frame;
            const { layerData, keyLayers } = this.kwzEncoder.encode(kwzFrame);
            const size = layerData[0].length + layerData[1].length + layerData[2].length;
            if (isLimited && this.dataSize + size > this.maxDataSize) {
                return this.refuse('the memory is full');
            }
            if (this.frameCount === this.kwzMeta.thumbnailIndex || this.frameCount === 0) {
                const pixels = renderKwzFrame(kwzFrame, undefined, {
                    visible: this.kwzMeta.isLayerVisible,
                });
                this.thumbnail = createKwzThumbnail(pixels);
            }
            this.kwzFrames.push({
                paper: kwzFrame.paper,
                colors: [...kwzFrame.colors],
                layerDepths: [...kwzFrame.layerDepths],
                soundFlags: kwzFrame.soundFlags,
                cameraFlags: kwzFrame.cameraFlags,
                authorId: this.kwzMeta.currentAuthorId,
                layerData,
                keyLayers,
                extraFlags: KWZ_DEFAULT_FRAME_EXTRA_FLAGS,
                reserved: 0,
            });
            this.dataSize += size;
        }
        this.updateDither();
        return true;
    }
    /** Sets a track from PCM at any rate (null removes it); it is cut to the app's limit. */
    setTrack(name, pcm) {
        this.tracks = { ...this.tracks, [name]: pcm };
    }
    finish() {
        check(this.frameCount > 0 && this.thumbnail, 'INVALID_ARGUMENT', 'A note needs at least one frame');
        if (this.ppmMeta) {
            const meta = this.ppmMeta;
            if (meta.thumbnailIndex >= this.frameCount)
                meta.thumbnailIndex = 0;
            if (this.tracks.se4)
                this.warn('PPM has no fourth sound effect; SE4 was dropped');
            const file = {
                format: 'ppm',
                meta,
                thumbnail: this.thumbnail,
                animation: packPpmAnimation(this.ppmFrames, this.ppmSoundFlags),
                tracks: encodePpmTracks(this.tracks, null, this.warn),
                signature: new Uint8Array(PPM_SIGNATURE_SIZE),
                source: null,
            };
            return file;
        }
        const meta = this.kwzMeta;
        if (meta.thumbnailIndex >= this.frameCount)
            meta.thumbnailIndex = 0;
        const file = {
            format: 'kwz',
            variant: 'kwz',
            meta,
            thumbnail: this.thumbnail,
            frames: this.kwzFrames,
            tracks: encodeKwzTracks(this.tracks, null, this.warn),
            signature: null,
            source: null,
        };
        return file;
    }
}
function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length ? sorted[sorted.length >> 1] : DEFAULT_GIF_DELAY;
}
/**
 * Picks the supported speed nearest to `frameRate` and the number of frames that cover
 * `duration` seconds; with 'slow', the speed drops until the frames fit the app's limit.
 */
export function planFrameTiming(format, duration, frameRate, overflow = 'slow') {
    const rates = format === 'ppm' ? PPM_FRAME_RATES : KWZ_FRAME_RATES;
    const first = format === 'ppm' ? 1 : 0;
    const maxFrames = format === 'ppm' ? PPM_MAX_FRAMES : KWZ_MAX_FRAMES;
    let speed = findNearestSpeed(rates, frameRate, first);
    if (overflow === 'slow') {
        while (Math.round(duration * rates[speed]) > maxFrames) {
            const slower = rates.findLastIndex((rate, index) => index >= first && rate < rates[speed]);
            if (slower < 0)
                break;
            speed = slower;
        }
    }
    const frameCount = Math.max(1, Math.min(maxFrames, Math.round(duration * rates[speed])));
    return { frameRate: rates[speed], frameCount };
}
/**
 * Builds a note from an animation (GIF, APNG, image sequence or decoded video frames),
 * resampling its timing to a speed the app supports.
 */
export function importAnimation(source, format, options = {}) {
    const durations = source.durations.map((value) => (value > 0.011 ? value : DEFAULT_GIF_DELAY));
    const total = durations.reduce((sum, value) => sum + value, 0);
    const wanted = options.frameRate === undefined || options.frameRate === 'auto'
        ? 1 / median(durations)
        : options.frameRate;
    const plan = planFrameTiming(format, total, wanted, options.overflow);
    const builder = new NoteBuilder(format, {
        ...options,
        frameRate: plan.frameRate,
        expectedFrameCount: plan.frameCount,
    });
    let output = 0;
    let start = 0;
    let index = 0;
    for (const image of source.frames()) {
        const end = start + (durations[index++] ?? DEFAULT_GIF_DELAY);
        const isLast = index >= durations.length;
        while (output < plan.frameCount && (isLast || (output + 0.5) / plan.frameRate < end)) {
            if (!builder.addImage(image))
                break;
            output++;
            options.onProgress?.(output, plan.frameCount);
        }
        if (output >= plan.frameCount || builder.isFull)
            break;
        start = end;
    }
    if (options.bgm)
        builder.setTrack('bgm', options.bgm);
    return builder.finish();
}
/** Builds a PPM from RGBA images (any size; fitted to 256x192), one frame each. */
export function createPpmFromImages(images, options = {}) {
    const builder = new NoteBuilder('ppm', options);
    for (const image of images)
        if (!builder.addImage(image))
            break;
    if (options.bgm)
        builder.setTrack('bgm', options.bgm);
    return builder.finish();
}
/** Builds a KWZ from RGBA images (any size; fitted to 320x240), one frame each. */
export function createKwzFromImages(images, options = {}) {
    const builder = new NoteBuilder('kwz', options);
    for (const image of images)
        if (!builder.addImage(image))
            break;
    if (options.bgm)
        builder.setTrack('bgm', options.bgm);
    return builder.finish();
}
