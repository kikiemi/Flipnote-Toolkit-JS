import { type KwzFile } from './kwz-types.ts';
/** True when nothing is drawn on layer C or outside the centered 256x192 area. */
export declare function isDsiLibraryLayout(file: KwzFile): boolean;
/**
 * Detects notes that Nintendo converted from PPM for the DSi Library service.
 * Their audio runs at 16384 Hz and may need a different initial ADPCM step index.
 */
export declare function isDsiLibraryNote(file: KwzFile): boolean;
