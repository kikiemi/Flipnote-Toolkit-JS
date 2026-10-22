import { toWords } from '../core/bytes.ts';
import { PPM_LAYER_SIZE, type PpmFrame } from './ppm-types.ts';

export interface PpmRenderOptions {
  visible?: readonly boolean[];
}

/** Composites a PPM frame (layer 1 over layer 2 over paper) into PPM palette indices. */
export function renderPpmFrame(
  frame: PpmFrame,
  target: Uint8Array = new Uint8Array(PPM_LAYER_SIZE),
  options: PpmRenderOptions = {},
): Uint8Array {
  const visible = options.visible ?? [true, true];
  const paper = frame.paper & 1;
  const pen = (value: number) => (value < 2 ? paper ^ 1 : value);
  const c1 = pen(frame.pens[0]);
  const c2 = pen(frame.pens[1]);
  const lut = new Uint8Array([paper, c1, c2, c1]);
  const a = frame.layers[0];
  const b = frame.layers[1];
  const mask = (visible[0] ? 1 : 0) | (visible[1] ? 2 : 0);
  const wordsA = toWords(a);
  const wordsB = toWords(b);
  for (let w = 0; w < wordsA.length; w++) {
    const i = w * 4;
    if ((wordsA[w] | wordsB[w]) === 0) {
      target[i] = target[i + 1] = target[i + 2] = target[i + 3] = paper;
      continue;
    }
    for (let k = i; k < i + 4; k++) target[k] = lut[((a[k] ? 1 : 0) | (b[k] ? 2 : 0)) & mask];
  }
  return target;
}
