import { check } from '../core/errors.js';
import { indexedToRgba } from '../image/image.js';
import { isDsiLibraryNote } from '../kwz/kwz-dsi-library.js';
import { KwzFrameDecoder } from '../kwz/kwz-frame-codec.js';
import { KWZ_ICON_SIZE } from '../kwz/kwz-icon.js';
import { renderKwzFrame } from '../kwz/kwz-render.js';
import { KWZ_CANVAS_RECT, KWZ_DSI_LIBRARY_RECT } from '../kwz/kwz-types.js';
import { PpmFrameDecoder } from '../ppm/ppm-frame-codec.js';
import { renderPpmFrame } from '../ppm/ppm-render.js';
import { getNoteInfo, getPalette } from './note.js';
function resolveCrop(note, crop) {
    if (note.format === 'ppm')
        return typeof crop === 'object' ? crop : null;
    const mode = crop ?? (note.variant === 'icon' ? 'auto' : 'full');
    if (typeof mode === 'object')
        return mode;
    if (mode === 'canvas')
        return KWZ_CANVAS_RECT;
    if (mode === 'dsi')
        return KWZ_DSI_LIBRARY_RECT;
    if (mode === 'auto') {
        if (note.variant === 'icon')
            return { x: 0, y: 0, width: KWZ_ICON_SIZE, height: KWZ_ICON_SIZE };
        if (isDsiLibraryNote(note))
            return KWZ_DSI_LIBRARY_RECT;
    }
    return null;
}
function cropInto(source, sourceWidth, rect, target) {
    for (let y = 0; y < rect.height; y++) {
        const start = (rect.y + y) * sourceWidth + rect.x;
        target.set(source.subarray(start, start + rect.width), y * rect.width);
    }
}
export function createFrameRenderer(note, options = {}) {
    const info = getNoteInfo(note);
    const isShowingHidden = options.isShowingHiddenLayers ?? false;
    const rect = resolveCrop(note, options.crop);
    if (rect) {
        check(rect.x >= 0 &&
            rect.y >= 0 &&
            rect.x + rect.width <= info.width &&
            rect.y + rect.height <= info.height, 'INVALID_ARGUMENT', 'Crop rectangle is outside the frame');
    }
    const width = rect ? rect.width : info.width;
    const height = rect ? rect.height : info.height;
    const base = {
        width,
        height,
        frameCount: info.frameCount,
        frameRate: info.frameRate,
        palette: getPalette(note, options.palette),
    };
    const full = rect ? new Uint8Array(info.width * info.height) : null;
    const finish = (pixels, target) => {
        if (rect)
            cropInto(pixels, info.width, rect, target);
        return target;
    };
    if (note.format === 'ppm') {
        const decoder = new PpmFrameDecoder(note);
        const visible = isShowingHidden ? [true, true] : note.meta.isLayerVisible;
        return {
            ...base,
            render: (index, target = new Uint8Array(width * height)) => finish(renderPpmFrame(decoder.decode(index), full ?? target, { visible }), target),
        };
    }
    const decoder = new KwzFrameDecoder(note, { isTolerant: true });
    const visible = isShowingHidden ? [true, true, true] : note.meta.isLayerVisible;
    const kwzOptions = { eye: options.eye, depthStrength: options.depthStrength, visible };
    return {
        ...base,
        render: (index, target = new Uint8Array(width * height)) => finish(renderKwzFrame(decoder.decode(index), full ?? target, kwzOptions), target),
    };
}
/** Renders one frame as palette indices plus the note palette. */
export function renderFrame(note, index, options = {}) {
    const renderer = createFrameRenderer(note, options);
    check(Number.isInteger(index) && index >= 0 && index < renderer.frameCount, 'INVALID_ARGUMENT', `Frame ${index} does not exist`);
    return {
        width: renderer.width,
        height: renderer.height,
        pixels: renderer.render(index),
        palette: renderer.palette,
    };
}
export function renderFrameRgba(note, index, options = {}) {
    return indexedToRgba(renderFrame(note, index, options));
}
