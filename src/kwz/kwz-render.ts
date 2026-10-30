import { toWords } from '../core/bytes.ts';
import {
  KWZ_COLOR_NONE,
  KWZ_HEIGHT,
  KWZ_LAYER_SIZE,
  KWZ_WIDTH,
  type KwzFrame,
} from './kwz-types.ts';

export type StereoEye = 'center' | 'left' | 'right';

export interface KwzRenderOptions {
  /** Which eye to render for 3D; layers shift sideways by their depth (default 'center'). */
  eye?: StereoEye;
  /** Position of the 3D slider from 0 to 1, scaling the shift (default 1). */
  depthStrength?: number;
  visible?: readonly boolean[];
}

/** Back-to-front layer order: larger depth first, then C, B, A. */
export function getKwzLayerOrder(depths: readonly number[]): number[] {
  return [2, 1, 0].sort((x, y) => depths[y] - depths[x]);
}

/** Horizontal shift of a layer for one eye: left eye moves left, right eye moves right. */
export function getKwzLayerShift(depth: number, eye: StereoEye, depthStrength = 1): number {
  if (eye === 'center') return 0;
  const shift = Math.floor(depth * depthStrength);
  return eye === 'left' ? -shift : shift;
}

function colorIndex(value: number): number {
  return value <= KWZ_COLOR_NONE ? value : 0;
}

/** Composites a KWZ frame into KWZ palette indices (6 = no paper, transparent). */
export function renderKwzFrame(
  frame: KwzFrame,
  target: Uint8Array = new Uint8Array(KWZ_LAYER_SIZE),
  options: KwzRenderOptions = {},
): Uint8Array {
  target.fill(colorIndex(frame.paper));
  const eye = options.eye ?? 'center';
  const visible = options.visible ?? [true, true, true];
  for (const layer of getKwzLayerOrder(frame.layerDepths)) {
    if (!visible[layer]) continue;
    const pixels = frame.layers[layer];
    const lut = new Uint8Array([
      0,
      colorIndex(frame.colors[layer * 2]),
      colorIndex(frame.colors[layer * 2 + 1]),
    ]);
    const shift = getKwzLayerShift(frame.layerDepths[layer], eye, options.depthStrength);
    if (shift === 0) {
      const words = toWords(pixels);
      for (let w = 0; w < words.length; w++) {
        if (words[w] === 0) continue;
        for (let i = w * 4; i < w * 4 + 4; i++) if (pixels[i]) target[i] = lut[pixels[i]];
      }
      continue;
    }
    const x0 = Math.max(0, shift);
    const x1 = Math.min(KWZ_WIDTH, KWZ_WIDTH + shift);
    for (let y = 0; y < KWZ_HEIGHT; y++) {
      const row = y * KWZ_WIDTH;
      for (let x = x0; x < x1; x++) {
        const value = pixels[row + x - shift];
        if (value) target[row + x] = lut[value];
      }
    }
  }
  return target;
}
