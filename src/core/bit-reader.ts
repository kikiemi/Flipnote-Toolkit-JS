/** Reads bits least significant first; reading past the end yields zeros. */
export class LsbBitReader {
  readonly bytes: Uint8Array;
  offset: number;
  private cache = 0;
  private cacheBits = 0;

  constructor(bytes: Uint8Array, offset = 0) {
    this.bytes = bytes;
    this.offset = offset;
  }

  get isOverrun(): boolean {
    return this.offset - (this.cacheBits >> 3) > this.bytes.length;
  }

  readBits(count: number): number {
    while (this.cacheBits < count) {
      const byte = this.offset < this.bytes.length ? this.bytes[this.offset] : 0;
      this.offset++;
      this.cache |= byte << this.cacheBits;
      this.cacheBits += 8;
    }
    const value = this.cache & ((1 << count) - 1);
    this.cache >>>= count;
    this.cacheBits -= count;
    return value;
  }

  peekBits(count: number): number {
    while (this.cacheBits < count) {
      const byte = this.offset < this.bytes.length ? this.bytes[this.offset] : 0;
      this.offset++;
      this.cache |= byte << this.cacheBits;
      this.cacheBits += 8;
    }
    return this.cache & ((1 << count) - 1);
  }

  dropBits(count: number): void {
    this.cache >>>= count;
    this.cacheBits -= count;
  }

  alignToByte(): void {
    const extra = this.cacheBits & 7;
    this.cache >>>= extra;
    this.cacheBits -= extra;
  }

  /** Byte position of the next unread whole byte. */
  get bytePosition(): number {
    return this.offset - (this.cacheBits >> 3);
  }

  seekByte(offset: number): void {
    this.offset = offset;
    this.cache = 0;
    this.cacheBits = 0;
  }
}
