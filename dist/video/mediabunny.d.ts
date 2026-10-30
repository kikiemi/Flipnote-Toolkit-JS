import type * as Mediabunny from 'mediabunny';
export type MediabunnyModule = typeof Mediabunny;
/** Loads the optional `mediabunny` peer dependency on first use. */
export declare function loadMediabunny(): Promise<MediabunnyModule>;
/** Media accepted by the video functions: bytes, a Blob/File, a URL or (in Node) a file path. */
export type MediaInput = Uint8Array | ArrayBuffer | Blob | string;
export declare function createSource(mb: MediabunnyModule, input: MediaInput): Mediabunny.Source;
