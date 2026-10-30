import { fail } from '../core/errors.js';
let loaded = null;
/** Loads the optional `mediabunny` peer dependency on first use. */
export function loadMediabunny() {
    loaded ??= import('mediabunny').catch(() => fail('UNSUPPORTED', 'Video support needs the "mediabunny" package (npm install mediabunny)'));
    return loaded;
}
export function createSource(mb, input) {
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
