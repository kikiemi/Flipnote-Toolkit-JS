import { fail } from '../core/errors.js';
import { decodeGifFrames, readGifInfo } from './gif.js';
import { decodeJpeg } from './jpeg.js';
import { decodeApngFrames, readPngInfo } from './png.js';
export function detectImageFormat(bytes) {
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46)
        return 'gif';
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
        return 'png';
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8)
        return 'jpeg';
    return null;
}
/** Opens a GIF, APNG, PNG or JPEG file as an animation (still images have one frame). */
export function openAnimation(bytes, stillDuration = 1) {
    const format = detectImageFormat(bytes);
    if (format === 'gif')
        return { ...readGifInfo(bytes), frames: () => decodeGifFrames(bytes) };
    if (format === 'png') {
        const info = readPngInfo(bytes);
        const durations = info.durations.length === 1 ? [stillDuration] : info.durations;
        return { ...info, durations, frames: () => decodeApngFrames(bytes) };
    }
    if (format === 'jpeg') {
        const image = decodeJpeg(bytes);
        return {
            width: image.width,
            height: image.height,
            durations: [stillDuration],
            loopCount: null,
            frames: () => [image],
        };
    }
    return fail('UNSUPPORTED', 'Unknown image format (expected GIF, PNG, APNG or JPEG)');
}
/** Joins still images into an animation that shows each for `duration` seconds. */
export function createImageSequence(images, duration) {
    const first = images[0] ?? { width: 1, height: 1 };
    return {
        width: first.width,
        height: first.height,
        durations: images.map(() => duration),
        loopCount: 0,
        frames: () => images,
    };
}
