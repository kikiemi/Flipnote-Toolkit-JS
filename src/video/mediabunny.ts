import type * as Mediabunny from 'mediabunny';
import { fail } from '../core/errors.ts';

export type MediabunnyModule = typeof Mediabunny;

let loaded: Promise<MediabunnyModule> | null = null;

/** Loads the optional `mediabunny` peer dependency on first use. */
export function loadMediabunny(): Promise<MediabunnyModule> {
  loaded ??= import('mediabunny').catch(() =>
    fail('UNSUPPORTED', 'Video support needs the "mediabunny" package (npm install mediabunny)'),
  );
  return loaded;
}

/** Media accepted by the video functions: bytes, a Blob/File, a URL or (in Node) a file path. */
export type MediaInput = Uint8Array | ArrayBuffer | Blob | string;

export function createSource(mb: MediabunnyModule, input: MediaInput): Mediabunny.Source {
  if (typeof input === 'string') {
    return /^(https?:|blob:|data:)/.test(input)
      ? new mb.UrlSource(input)
      : new mb.FilePathSource(input);
  }
  if (input instanceof Uint8Array || input instanceof ArrayBuffer) {
    return new mb.BufferSource(input);
  }
  return new mb.BlobSource(input);
}
