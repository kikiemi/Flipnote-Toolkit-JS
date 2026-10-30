import { type PpmFrame } from './ppm-types.ts';
export interface PpmRenderOptions {
    visible?: readonly boolean[];
}
/** Composites a PPM frame (layer 1 over layer 2 over paper) into PPM palette indices. */
export declare function renderPpmFrame(frame: PpmFrame, target?: Uint8Array, options?: PpmRenderOptions): Uint8Array;
