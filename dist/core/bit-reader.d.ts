/** Reads bits least significant first; reading past the end yields zeros. */
export declare class LsbBitReader {
    readonly bytes: Uint8Array;
    offset: number;
    private cache;
    private cacheBits;
    constructor(bytes: Uint8Array, offset?: number);
    get isOverrun(): boolean;
    readBits(count: number): number;
    peekBits(count: number): number;
    dropBits(count: number): void;
    alignToByte(): void;
    /** Byte position of the next unread whole byte. */
    get bytePosition(): number;
    seekByte(offset: number): void;
}
