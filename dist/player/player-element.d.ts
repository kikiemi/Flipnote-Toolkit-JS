/**
 * Registers the `<flipnote-player>` element. Attributes: `src`, `controls`, `autoplay`, `loop`,
 * `muted`, `stereo`, `crop` (full, canvas, dsi or auto), `palette` (screen or app),
 * `start`/`end` frames and `equalizer` (a preset or ten gains in dB). Frames are drawn with
 * WebGL when available. Dropping a file onto it plays that file.
 */
export declare function defineFlipnotePlayer(tagName?: string): void;
