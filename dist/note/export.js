import { check } from '../core/errors.js';
import { indexedToRgba, scaleIndicesInto } from '../image/image.js';
import { decodeKwzThumbnail } from '../kwz/kwz-thumbnail.js';
import { encodeAac } from '../media/aac.js';
import { encodeGif } from '../media/gif.js';
import { H264Encoder } from '../media/h264.js';
import { encodeJpeg } from '../media/jpeg.js';
import { muxMp4 } from '../media/mp4.js';
import { encodeMpo } from '../media/mpo.js';
import { encodeApng, encodePng } from '../media/png.js';
import { encodeWav } from '../media/wav.js';
import { indicesToYuv, paletteToYuv } from '../media/yuv.js';
import { decodePpmThumbnail } from '../ppm/ppm-thumbnail.js';
import { hasAudio, mixAudio } from './audio.js';
import { createFrameRenderer } from './render.js';
/** Dubois least-squares matrices for red-cyan glasses (rows: output R, G, B). */
const ANAGLYPH_LEFT = [0.456, 0.5, 0.176, -0.04, -0.038, -0.016, -0.015, -0.021, -0.005];
const ANAGLYPH_RIGHT = [-0.043, -0.088, -0.002, 0.378, 0.734, -0.018, -0.072, -0.113, 1.226];
/** Palette of every left/right color pair mixed for red-cyan glasses; index = left * n + right. */
export function createAnaglyphPalette(palette) {
    const count = palette.length / 4;
    const out = new Uint8Array(count * count * 4);
    for (let l = 0; l < count; l++) {
        for (let r = 0; r < count; r++) {
            const o = (l * count + r) * 4;
            for (let c = 0; c < 3; c++) {
                let value = 0;
                for (let k = 0; k < 3; k++) {
                    value +=
                        ANAGLYPH_LEFT[c * 3 + k] * palette[l * 4 + k] +
                            ANAGLYPH_RIGHT[c * 3 + k] * palette[r * 4 + k];
                }
                out[o + c] = Math.max(0, Math.min(255, Math.round(value)));
            }
            out[o + 3] = Math.min(palette[l * 4 + 3], palette[r * 4 + 3]);
        }
    }
    return out;
}
function opaquePalette(palette, isTransparent) {
    if (isTransparent)
        return palette;
    const out = palette.slice();
    for (let i = 3; i < out.length; i += 4)
        out[i] = 255;
    return out;
}
export function createExportRenderer(note, options = {}) {
    const scale = options.scale ?? 1;
    check(Number.isInteger(scale) && scale >= 1 && scale <= 16, 'INVALID_ARGUMENT', 'Scale must be an integer from 1 to 16');
    const layout = options.stereo;
    const center = createFrameRenderer(note, {
        ...options,
        eye: layout === 'right' ? 'right' : layout ? 'left' : 'center',
    });
    const right = layout && layout !== 'left' && layout !== 'right'
        ? createFrameRenderer(note, { ...options, eye: 'right' })
        : null;
    const { width, height } = center;
    const isTransparent = options.isTransparent ?? false;
    let palette = opaquePalette(center.palette, isTransparent);
    let outWidth = width;
    let outHeight = height;
    if (layout === 'side-by-side')
        outWidth *= 2;
    if (layout === 'top-bottom')
        outHeight *= 2;
    if (layout === 'anaglyph')
        palette = createAnaglyphPalette(palette);
    const count = center.palette.length / 4;
    const a = new Uint8Array(width * height);
    const b = new Uint8Array(width * height);
    const composed = new Uint8Array(outWidth * outHeight);
    const compose = (index) => {
        if (!right)
            return center.render(index, a);
        center.render(index, a);
        right.render(index, b);
        if (layout === 'anaglyph') {
            for (let i = 0; i < a.length; i++)
                composed[i] = a[i] * count + b[i];
        }
        else if (layout === 'top-bottom') {
            composed.set(a);
            composed.set(b, a.length);
        }
        else if (layout === 'side-by-side') {
            for (let y = 0; y < height; y++) {
                composed.set(a.subarray(y * width, (y + 1) * width), y * outWidth);
                composed.set(b.subarray(y * width, (y + 1) * width), y * outWidth + width);
            }
        }
        else {
            const half = width >> 1;
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < half; x++) {
                    composed[y * width + x] = a[y * width + x * 2];
                    composed[y * width + half + x] = b[y * width + x * 2];
                }
            }
        }
        return composed;
    };
    const scaled = scale > 1 ? new Uint8Array(outWidth * outHeight * scale * scale) : null;
    return {
        width: outWidth * scale,
        height: outHeight * scale,
        frameCount: center.frameCount,
        frameRate: center.frameRate,
        palette,
        render: (index) => {
            const pixels = compose(index);
            return scaled ? scaleIndicesInto(pixels, outWidth, outHeight, scale, scaled) : pixels;
        },
    };
}
function* animationFrames(renderer, repeat) {
    check(Number.isInteger(repeat) && repeat >= 1, 'INVALID_ARGUMENT', 'Repeat must be a positive integer');
    const duration = 1 / renderer.frameRate;
    for (let pass = 0; pass < repeat; pass++) {
        for (let index = 0; index < renderer.frameCount; index++) {
            yield { pixels: renderer.render(index), duration };
        }
    }
}
/** Animated GIF with the note's exact colors and timing. */
export function exportGif(note, options = {}) {
    const renderer = createExportRenderer(note, options);
    const frames = animationFrames(renderer, options.repeat ?? 1);
    const loopCount = options.loopCount === undefined ? 0 : options.loopCount;
    return encodeGif(renderer.width, renderer.height, renderer.palette, frames, { loopCount });
}
/** Animated PNG (lossless, full alpha). */
export function exportApng(note, options = {}) {
    const renderer = createExportRenderer(note, options);
    const frames = animationFrames(renderer, options.repeat ?? 1);
    const loopCount = options.loopCount === null ? 1 : (options.loopCount ?? 0);
    return encodeApng(renderer.width, renderer.height, renderer.palette, frames, { loopCount });
}
function renderIndexed(renderer, index) {
    check(Number.isInteger(index) && index >= 0 && index < renderer.frameCount, 'INVALID_ARGUMENT', `Frame ${index} does not exist`);
    return {
        width: renderer.width,
        height: renderer.height,
        pixels: renderer.render(index),
        palette: renderer.palette,
    };
}
/** One rendered frame as PNG. */
export function exportFramePng(note, index, options = {}) {
    return encodePng(renderIndexed(createExportRenderer(note, options), index));
}
/** Every rendered frame as PNG, in order. */
export function* exportFramePngs(note, options = {}) {
    const renderer = createExportRenderer(note, options);
    for (let index = 0; index < renderer.frameCount; index++) {
        yield encodePng(renderIndexed(renderer, index));
    }
}
/** The stored thumbnail as PNG (64x48 for PPM, 80x64 for KWZ). */
export function exportThumbnailPng(note) {
    if (note.format === 'ppm')
        return encodePng(decodePpmThumbnail(note.thumbnail));
    check(note.thumbnail, 'INVALID_ARGUMENT', 'This KWZ file has no thumbnail');
    return encodePng(decodeKwzThumbnail(note.thumbnail));
}
/** A frame as a stereo MPO photo (left and right JPEGs), viewable in 3D on a 3DS and 3D displays. */
export function exportMpo(note, index, options = {}) {
    const quality = options.quality ?? 95;
    const eye = (stereo) => {
        const image = renderIndexed(createExportRenderer(note, { ...options, stereo, isTransparent: false }), index);
        return encodeJpeg(indexedToRgba(image), { quality, subsampling: '444' });
    };
    return encodeMpo(eye('left'), eye('right'));
}
/** Mixed soundtrack as 16-bit WAV. */
export function exportWav(note, options = {}) {
    return encodeWav(mixAudio(note, options));
}
function repeatPcm(pcm, times) {
    if (times === 1)
        return pcm;
    const samples = new Int16Array(pcm.samples.length * times);
    for (let i = 0; i < times; i++)
        samples.set(pcm.samples, i * pcm.samples.length);
    return { samples, sampleRate: pcm.sampleRate };
}
/** H.264 + AAC MP4 that plays in browsers, phones and video editors (no dependencies). */
export function exportMp4(note, options = {}) {
    const renderer = createExportRenderer(note, { ...options, isTransparent: false });
    const repeat = options.repeat ?? 1;
    const width = (renderer.width + 1) & ~1;
    const height = (renderer.height + 1) & ~1;
    const outputRate = options.frameRate ?? renderer.frameRate;
    check(outputRate > 0 && outputRate <= 120, 'INVALID_ARGUMENT', 'Frame rate must be between 0 and 120');
    const timescale = Number.isInteger(600 / outputRate) ? 600 : 90000;
    const matrix = height >= 720 ? 'bt709' : 'bt601';
    const encoder = new H264Encoder(width, height, outputRate, {
        qp: options.qp,
        keyFrameInterval: options.keyFrameInterval ?? Math.max(1, Math.round(outputRate * 10)),
        colorMatrix: matrix,
    });
    const tables = paletteToYuv(renderer.palette, matrix);
    const yuv = encoder.createFrame();
    const total = renderer.frameCount * repeat;
    const duration = total / renderer.frameRate;
    const outputCount = options.frameRate ? Math.max(1, Math.round(duration * outputRate)) : total;
    const samples = [];
    let lastSource = -1;
    let elapsed = 0;
    for (let k = 0; k < outputCount; k++) {
        const source = options.frameRate
            ? Math.min(total - 1, Math.floor((k * renderer.frameRate) / outputRate))
            : k;
        if (source !== lastSource) {
            indicesToYuv(renderer.render(source % renderer.frameCount), renderer.width, renderer.height, encoder, tables, yuv);
            lastSource = source;
        }
        const end = Math.round(((k + 1) * timescale) / outputRate);
        const sample = encoder.encode(yuv);
        samples.push({ data: sample.data, duration: end - elapsed, isKey: sample.isKey });
        elapsed = end;
    }
    const video = {
        width,
        height,
        timescale,
        sps: encoder.sps,
        pps: encoder.pps,
        colorMatrix: matrix,
        samples,
    };
    if (!(options.isAudioIncluded ?? true) || !hasAudio(note))
        return muxMp4(video);
    const sampleRate = options.audioSampleRate ?? 48000;
    const pcm = repeatPcm(mixAudio(note, { sampleRate, equalizer: options.equalizer }), repeat);
    const bitrate = options.audioBitrate ?? 96000;
    const aac = encodeAac(pcm, { bitrate });
    return muxMp4(video, {
        sampleRate,
        config: aac.config,
        frames: aac.frames,
        priming: aac.priming,
        length: pcm.samples.length,
        bitrate,
    });
}
