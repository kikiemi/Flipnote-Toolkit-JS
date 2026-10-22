const ADPCM_STEP_TABLE = new Int16Array([
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73,
  80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494,
  544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499,
  2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487,
  12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767,
]);
const INDEX_TABLE_4BIT = new Int8Array([-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8]);
const INDEX_TABLE_2BIT = new Int8Array([-1, 2, -1, 2]);

/** PPM tracks start with a 4-byte decoder state: int16 predictor, uint8 step index, uint8 unused. */
export const PPM_ADPCM_HEADER_SIZE = 4;
export const KWZ_ADPCM_STEP_INDEX = 40;

function diff4(step: number, code: number): number {
  let diff = step >> 3;
  if (code & 1) diff += step >> 2;
  if (code & 2) diff += step >> 1;
  if (code & 4) diff += step;
  return code & 8 ? -diff : diff;
}

function diff2(step: number, code: number): number {
  let diff = step >> 3;
  if (code & 1) diff += step;
  return code & 2 ? -diff : diff;
}

/** Decodes a PPM IMA ADPCM track (low nibble first) including its 4-byte header. */
export function decodePpmAdpcm(data: Uint8Array): Int16Array {
  if (data.length <= PPM_ADPCM_HEADER_SIZE) return new Int16Array(0);
  let predictor = ((data[0] | (data[1] << 8)) << 16) >> 16;
  let index = Math.min(88, data[2]);
  const out = new Int16Array((data.length - PPM_ADPCM_HEADER_SIZE) * 2);
  let o = 0;
  for (let i = PPM_ADPCM_HEADER_SIZE; i < data.length; i++) {
    const byte = data[i];
    for (let shift = 0; shift <= 4; shift += 4) {
      const code = (byte >> shift) & 15;
      predictor += diff4(ADPCM_STEP_TABLE[index], code);
      predictor = predictor < -32768 ? -32768 : predictor > 32767 ? 32767 : predictor;
      index += INDEX_TABLE_4BIT[code];
      index = index < 0 ? 0 : index > 88 ? 88 : index;
      out[o++] = predictor;
    }
  }
  return out;
}

/** Encodes PCM as a PPM IMA ADPCM track, picking the best code for every sample. */
export function encodePpmAdpcm(samples: Int16Array): Uint8Array {
  const out = new Uint8Array(PPM_ADPCM_HEADER_SIZE + ((samples.length + 1) >> 1));
  let predictor = 0;
  let index = 0;
  for (let i = 0; i < samples.length; i++) {
    const target = samples[i];
    const step = ADPCM_STEP_TABLE[index];
    let bestCode = 0;
    let bestValue = 0;
    let bestError = Infinity;
    for (let code = 0; code < 16; code++) {
      let value = predictor + diff4(step, code);
      value = value < -32768 ? -32768 : value > 32767 ? 32767 : value;
      const error = Math.abs(value - target);
      if (error < bestError) {
        bestError = error;
        bestCode = code;
        bestValue = value;
      }
    }
    predictor = bestValue;
    index += INDEX_TABLE_4BIT[bestCode];
    index = index < 0 ? 0 : index > 88 ? 88 : index;
    out[PPM_ADPCM_HEADER_SIZE + (i >> 1)] |= bestCode << ((i & 1) << 2);
  }
  return out;
}

/** Decodes KWZ ADPCM, which mixes 2-bit and 4-bit codes and uses a 12-bit predictor. */
export function decodeKwzAdpcm(
  data: Uint8Array,
  initialStepIndex = KWZ_ADPCM_STEP_INDEX,
  initialPredictor = 0,
): Int16Array {
  const out = new Int16Array(data.length * 4);
  let o = 0;
  let predictor = initialPredictor;
  let index = initialStepIndex;
  for (let i = 0; i < data.length; i++) {
    let byte = data[i];
    let bit = 0;
    while (bit < 8) {
      const step = ADPCM_STEP_TABLE[index];
      if (index < 18 || bit > 4) {
        const code = byte & 3;
        predictor += diff2(step, code);
        index += INDEX_TABLE_2BIT[code];
        byte >>= 2;
        bit += 2;
      } else {
        const code = byte & 15;
        predictor += diff4(step, code);
        index += INDEX_TABLE_4BIT[code];
        byte >>= 4;
        bit += 4;
      }
      index = index < 0 ? 0 : index > 79 ? 79 : index;
      predictor = predictor < -2048 ? -2048 : predictor > 2047 ? 2047 : predictor;
      out[o++] = predictor * 16;
    }
  }
  return out.slice(0, o);
}

/** Encodes PCM as KWZ ADPCM, mirroring the decoder's 2-bit/4-bit switching. */
export function encodeKwzAdpcm(
  samples: Int16Array,
  initialStepIndex = KWZ_ADPCM_STEP_INDEX,
): Uint8Array {
  const out = new Uint8Array(samples.length);
  let length = 0;
  let predictor = 0;
  let index = initialStepIndex;
  let byte = 0;
  let bit = 0;
  for (let i = 0; i < samples.length; i++) {
    const target = samples[i] / 16;
    const step = ADPCM_STEP_TABLE[index];
    const isShort = index < 18 || bit > 4;
    const codes = isShort ? 4 : 16;
    let bestCode = 0;
    let bestValue = 0;
    let bestError = Infinity;
    for (let code = 0; code < codes; code++) {
      let value = predictor + (isShort ? diff2(step, code) : diff4(step, code));
      value = value < -2048 ? -2048 : value > 2047 ? 2047 : value;
      const error = Math.abs(value - target);
      if (error < bestError) {
        bestError = error;
        bestCode = code;
        bestValue = value;
      }
    }
    predictor = bestValue;
    index += isShort ? INDEX_TABLE_2BIT[bestCode] : INDEX_TABLE_4BIT[bestCode];
    index = index < 0 ? 0 : index > 79 ? 79 : index;
    byte |= bestCode << bit;
    bit += isShort ? 2 : 4;
    if (bit === 8) {
      out[length++] = byte;
      byte = 0;
      bit = 0;
    }
  }
  if (bit) out[length++] = byte;
  return out.slice(0, length);
}
