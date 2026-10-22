class GrowableBytes {
  protected bytes = new Uint8Array(4096);
  length = 0;

  protected push(byte: number): void {
    if (this.length === this.bytes.length) {
      const bytes = new Uint8Array(this.bytes.length * 2);
      bytes.set(this.bytes);
      this.bytes = bytes;
    }
    this.bytes[this.length++] = byte;
  }

  toBytes(): Uint8Array {
    return this.bytes.slice(0, this.length);
  }
}

/** Writes bits most significant first, optionally with JPEG 0xFF stuffing. */
export class MsbBitWriter extends GrowableBytes {
  private cache = 0;
  private cacheBits = 0;
  private readonly isStuffing: boolean;

  constructor(isStuffing = false) {
    super();
    this.isStuffing = isStuffing;
  }

  get bitLength(): number {
    return this.length * 8 + this.cacheBits;
  }

  writeBits(value: number, count: number): void {
    if (count > 24) {
      this.writeBits(value >>> 16, count - 16);
      this.writeBits(value & 0xffff, 16);
      return;
    }
    this.cache = (this.cache << count) | (value & ((1 << count) - 1));
    this.cacheBits += count;
    while (this.cacheBits >= 8) {
      this.cacheBits -= 8;
      const byte = (this.cache >>> this.cacheBits) & 0xff;
      this.push(byte);
      if (byte === 0xff && this.isStuffing) this.push(0);
    }
    this.cache &= (1 << this.cacheBits) - 1;
  }

  writeBit(value: boolean | number): void {
    this.writeBits(value ? 1 : 0, 1);
  }

  writeUe(value: number): void {
    const code = value + 1;
    const size = 32 - Math.clz32(code);
    if (size > 1) this.writeBits(0, size - 1);
    this.writeBits(code, size);
  }

  writeSe(value: number): void {
    this.writeUe(value > 0 ? value * 2 - 1 : -value * 2);
  }

  /** Pads with `fill` bits up to the next byte boundary. */
  alignWith(fill: 0 | 1): void {
    if (this.cacheBits) this.writeBits(fill ? 0xff : 0, 8 - this.cacheBits);
  }

  writeAlignedBytes(bytes: Uint8Array): void {
    for (let i = 0; i < bytes.length; i++) this.writeBits(bytes[i], 8);
  }
}

/** Writes bits least significant first. */
export class LsbBitWriter extends GrowableBytes {
  private cache = 0;
  private cacheBits = 0;

  get bitLength(): number {
    return this.length * 8 + this.cacheBits;
  }

  writeBits(value: number, count: number): void {
    if (count > 24) {
      this.writeBits(value & 0xffff, 16);
      this.writeBits(value >>> 16, count - 16);
      return;
    }
    this.cache |= (value & ((1 << count) - 1)) << this.cacheBits;
    this.cacheBits += count;
    while (this.cacheBits >= 8) {
      this.push(this.cache & 0xff);
      this.cache >>>= 8;
      this.cacheBits -= 8;
    }
  }

  alignToByte(): void {
    if (this.cacheBits) this.writeBits(0, 8 - this.cacheBits);
  }

  alignTo(byteMultiple: number): void {
    this.alignToByte();
    while (this.length % byteMultiple) this.push(0);
  }

  writeAlignedBytes(bytes: Uint8Array): void {
    this.alignToByte();
    for (let i = 0; i < bytes.length; i++) this.push(bytes[i]);
  }
}
