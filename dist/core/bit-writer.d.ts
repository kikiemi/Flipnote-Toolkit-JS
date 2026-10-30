declare class GrowableBytes {
    protected bytes: Uint8Array<ArrayBuffer>;
    length: number;
    protected push(byte: number): void;
    toBytes(): Uint8Array;
}
/** Writes bits most significant first, optionally with JPEG 0xFF stuffing. */
export declare class MsbBitWriter extends GrowableBytes {
    private cache;
    private cacheBits;
    private readonly isStuffing;
    constructor(isStuffing?: boolean);
    get bitLength(): number;
    writeBits(value: number, count: number): void;
    writeBit(value: boolean | number): void;
    writeUe(value: number): void;
    writeSe(value: number): void;
    /** Pads with `fill` bits up to the next byte boundary. */
    alignWith(fill: 0 | 1): void;
    writeAlignedBytes(bytes: Uint8Array): void;
}
/** Writes bits least significant first. */
export declare class LsbBitWriter extends GrowableBytes {
    private cache;
    private cacheBits;
    get bitLength(): number;
    writeBits(value: number, count: number): void;
    alignToByte(): void;
    alignTo(byteMultiple: number): void;
    writeAlignedBytes(bytes: Uint8Array): void;
}
export {};
