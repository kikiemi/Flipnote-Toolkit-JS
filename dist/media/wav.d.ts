import type { Pcm } from '../audio/pcm.ts';
/** Encodes mono 16-bit PCM as a RIFF WAVE file. */
export declare function encodeWav(pcm: Pcm): Uint8Array;
/** Decodes PCM (8/16/24/32-bit) or 32-bit float WAVE, mixing channels down to mono. */
export declare function decodeWav(bytes: Uint8Array): Pcm;
