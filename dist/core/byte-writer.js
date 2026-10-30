export class ByteWriter {
    buffer;
    view;
    length = 0;
    constructor(capacity = 4096) {
        this.buffer = new Uint8Array(Math.max(16, capacity));
        this.view = new DataView(this.buffer.buffer);
    }
    reserve(count) {
        const needed = this.length + count;
        if (needed <= this.buffer.length)
            return;
        let capacity = this.buffer.length * 2;
        while (capacity < needed)
            capacity *= 2;
        const buffer = new Uint8Array(capacity);
        buffer.set(this.buffer.subarray(0, this.length));
        this.buffer = buffer;
        this.view = new DataView(buffer.buffer);
    }
    writeU8(value) {
        this.reserve(1);
        this.buffer[this.length++] = value;
    }
    writeU16(value) {
        this.reserve(2);
        this.view.setUint16(this.length, value, true);
        this.length += 2;
    }
    writeI16(value) {
        this.reserve(2);
        this.view.setInt16(this.length, value, true);
        this.length += 2;
    }
    writeU32(value) {
        this.reserve(4);
        this.view.setUint32(this.length, value >>> 0, true);
        this.length += 4;
    }
    writeU16Be(value) {
        this.reserve(2);
        this.view.setUint16(this.length, value, false);
        this.length += 2;
    }
    writeU24Be(value) {
        this.reserve(3);
        this.buffer[this.length] = value >>> 16;
        this.buffer[this.length + 1] = value >>> 8;
        this.buffer[this.length + 2] = value;
        this.length += 3;
    }
    writeU32Be(value) {
        this.reserve(4);
        this.view.setUint32(this.length, value >>> 0, false);
        this.length += 4;
    }
    writeBytes(bytes) {
        this.reserve(bytes.length);
        this.buffer.set(bytes, this.length);
        this.length += bytes.length;
    }
    writeAscii(text) {
        this.reserve(text.length);
        for (let i = 0; i < text.length; i++)
            this.buffer[this.length++] = text.charCodeAt(i) & 0xff;
    }
    writeZeros(count) {
        this.reserve(count);
        this.buffer.fill(0, this.length, this.length + count);
        this.length += count;
    }
    patchU32Be(offset, value) {
        this.view.setUint32(offset, value >>> 0, false);
    }
    subarray(start, end = this.length) {
        return this.buffer.subarray(start, end);
    }
    toBytes() {
        return this.buffer.slice(0, this.length);
    }
}
