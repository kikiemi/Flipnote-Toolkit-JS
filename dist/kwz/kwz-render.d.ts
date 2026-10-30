import { type KwzFrame } from './kwz-types.ts';
export type StereoEye = 'center' | 'left' | 'right';
export interface KwzRenderOptions {
    /** Which eye to render for 3D; layers shift sideways by their depth (default 'center'). */
    eye?: StereoEye;
    /** Position of the 3D slider from 0 to 1, scaling the shift (default 1). */
    depthStrength?: number;
    visible?: readonly boolean[];
}
/** Back-to-front layer order: larger depth first, then C, B, A. */
export declare function getKwzLayerOrder(depths: readonly number[]): number[];
/** Horizontal shift of a layer for one eye: left eye moves left, right eye moves right. */
export declare function getKwzLayerShift(depth: number, eye: StereoEye, depthStrength?: number): number;
/** Composites a KWZ frame into KWZ palette indices (6 = no paper, transparent). */
export declare function renderKwzFrame(frame: KwzFrame, target?: Uint8Array, options?: KwzRenderOptions): Uint8Array;
