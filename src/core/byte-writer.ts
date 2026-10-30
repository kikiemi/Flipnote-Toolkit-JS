export class ByteWriter {
  private buffer: Uint8Array;
  private view: DataView;
  length = 0;

  constructor(capacity = 4096) {
    this.buffer = new Uint8Array(Math.max(16, capacity));
    this.view = new DataView(this.buffer.buffer);
  }

  private reserve(count: number): void {
    const needed = this.length + count;
    if (needed <= this.buffer.length) return;
    let capacity = this.buffer.length * 2;
    while (capacity < needed) capacity *= 2;
    const buffer = new Uint8Array(capacity);
    buffer.set(this.buffer.subarray(0, this.length));
    this.buffer = buffer;
    this.view = new DataView(buffer.buffer);
  }

  writeU8(value: number): void {
    this.reserve(1);
    this.buffer[this.length++] = value;
  }

  writeU16(value: number): void {
    this.reserve(2);
    this.view.setUint16(this.length, value, true);
    this.length += 2;
  }

  writeI16(value: number): void {
    this.reserve(2);
    this.view.setInt16(this.length, value, true);
    this.length += 2;
  }

  writeU32(value: number): void {
    this.reserve(4);
    this.view.setUint32(this.length, value >>> 0, true);
    this.length += 4;
  }

  writeU16Be(value: number): void {
    this.reserve(2);
    this.view.setUint16(this.length, value, false);
    this.length += 2;
  }

  writeU24Be(value: number): void {
    this.reserve(3);
    this.buffer[this.length] = value >>> 16;
    this.buffer[this.length + 1] = value >>> 8;
    this.buffer[this.length + 2] = value;
    this.length += 3;
  }

  writeU32Be(value: number): void {
    this.reserve(4);
    this.view.setUint32(this.length, value >>> 0, false);
    this.length += 4;
  }

  writeBytes(bytes: Uint8Array): void {
    this.reserve(bytes.length);
    this.buffer.set(bytes, this.length);
    this.length += bytes.length;
  }

  writeAscii(text: string): void {
    this.reserve(text.length);
    for (let i = 0; i < text.length; i++) this.buffer[this.length++] = text.charCodeAt(i) & 0xff;
  }

  writeZeros(count: number): void {
    this.reserve(count);
    this.buffer.fill(0, this.length, this.length + count);
    this.length += count;
  }

  patchU32Be(offset: number, value: number): void {
    this.view.setUint32(offset, value >>> 0, false);
  }

  subarray(start: number, end = this.length): Uint8Array {
    return this.buffer.subarray(start, end);
  }

  toBytes(): Uint8Array {
    return this.buffer.slice(0, this.length);
  }
}
