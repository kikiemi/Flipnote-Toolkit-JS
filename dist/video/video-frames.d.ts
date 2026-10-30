import type { VideoSample } from 'mediabunny';
import type { RgbaImage } from '../image/image.ts';
/** Copies a decoded video frame to RGBA in display orientation. */
export declare function sampleToRgba(sample: VideoSample): Promise<RgbaImage>;
