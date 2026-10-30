export declare class ByteWriter {
    private buffer;
    private view;
    length: number;
    constructor(capacity?: number);
    private reserve;
    writeU8(value: number): void;
    writeU16(value: number): void;
    writeI16(value: number): void;
    writeU32(value: number): void;
    writeU16Be(value: number): void;
    writeU24Be(value: number): void;
    writeU32Be(value: number): void;
    writeBytes(bytes: Uint8Array): void;
    writeAscii(text: string): void;
    writeZeros(count: number): void;
    patchU32Be(offset: number, value: number): void;
    subarray(start: number, end?: number): Uint8Array;
    toBytes(): Uint8Array;
}
