import { type KwzFile, type KwzFrameRecord, type KwzMeta, type KwzSection, type KwzSectionName } from './kwz-types.ts';
export declare function isKwz(bytes: Uint8Array): boolean;
/** Lists the sections and the byte length of the unsigned body. */
export declare function readKwzSections(bytes: Uint8Array): {
    sections: KwzSection[];
    bodyLength: number;
};
export declare function createEmptyKwzMeta(): KwzMeta;
/** Reads KFH metadata from its body (after the 8-byte section header). */
export declare function readKwzMeta(bytes: Uint8Array, body: number): KwzMeta;
/** Reads one 28-byte KMI entry; layer data is attached by the caller. */
export declare function readKwzFrameMeta(bytes: Uint8Array, p: number): Omit<KwzFrameRecord, 'layerData'>;
/**
 * Parses a KWZ note, KWC comment or folder icon without copying: frames, thumbnail and
 * audio stay encoded and reference `bytes`, which must not be modified while in use.
 */
export declare function readKwz(bytes: Uint8Array): KwzFile;
/** Checks the CRC32 stored at the start of KFH, KTN, KMC and KSN bodies. */
export declare function verifyKwzChecksums(bytes: Uint8Array): Partial<Record<KwzSectionName, boolean>>;
