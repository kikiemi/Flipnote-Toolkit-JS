/** PPM tracks start with a 4-byte decoder state: int16 predictor, uint8 step index, uint8 unused. */
export declare const PPM_ADPCM_HEADER_SIZE = 4;
export declare const KWZ_ADPCM_STEP_INDEX = 40;
/** Decodes a PPM IMA ADPCM track (low nibble first) including its 4-byte header. */
export declare function decodePpmAdpcm(data: Uint8Array): Int16Array;
/** Encodes PCM as a PPM IMA ADPCM track, picking the best code for every sample. */
export declare function encodePpmAdpcm(samples: Int16Array): Uint8Array;
/** Decodes KWZ ADPCM, which mixes 2-bit and 4-bit codes and uses a 12-bit predictor. */
export declare function decodeKwzAdpcm(data: Uint8Array, initialStepIndex?: number, initialPredictor?: number): Int16Array;
/** Encodes PCM as KWZ ADPCM, mirroring the decoder's 2-bit/4-bit switching. */
export declare function encodeKwzAdpcm(samples: Int16Array, initialStepIndex?: number): Uint8Array;
