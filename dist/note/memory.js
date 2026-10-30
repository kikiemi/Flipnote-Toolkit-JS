import { getKwzFrameDataSize } from '../kwz/kwz-create.js';
import { KWZ_MEMORY_BASE, KWZ_MEMORY_LIMIT } from '../kwz/kwz-types.js';
import { PPM_MAX_ANIMATION_SIZE } from '../ppm/ppm-types.js';
export function getPpmMemoryUsage(file) {
    const used = file.animation.data.length;
    return { used, limit: PPM_MAX_ANIMATION_SIZE, level: used / PPM_MAX_ANIMATION_SIZE };
}
export function getKwzMemoryUsage(file) {
    const used = getKwzFrameDataSize(file.frames) + KWZ_MEMORY_BASE;
    return { used, limit: KWZ_MEMORY_LIMIT, level: used / KWZ_MEMORY_LIMIT };
}
/** The memory meter shown while editing: animation data for PPM, frame data for KWZ. */
export function getMemoryUsage(note) {
    return note.format === 'ppm' ? getPpmMemoryUsage(note) : getKwzMemoryUsage(note);
}
