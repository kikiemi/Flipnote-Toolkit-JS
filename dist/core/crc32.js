const CRC32_TABLE = createCrc32Table();
function createCrc32Table() {
    const table = new Int32Array(256 * 8);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++)
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
    }
    for (let n = 0; n < 256; n++) {
        let c = table[n];
        for (let k = 1; k < 8; k++) {
            c = table[c & 0xff] ^ (c >>> 8);
            table[k * 256 + n] = c;
        }
    }
    return table;
}
/** CRC-32 (ISO 3309), as used by zlib, PNG and KWZ. */
export function crc32(bytes, start = 0, end = bytes.length, seed = 0) {
    const t = CRC32_TABLE;
    let crc = ~seed;
    let i = start;
    for (; i + 8 <= end; i += 8) {
        const a = crc ^ (bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24));
        crc =
            t[1792 + (a & 0xff)] ^
                t[1536 + ((a >>> 8) & 0xff)] ^
                t[1280 + ((a >>> 16) & 0xff)] ^
                t[1024 + (a >>> 24)] ^
                t[768 + bytes[i + 4]] ^
                t[512 + bytes[i + 5]] ^
                t[256 + bytes[i + 6]] ^
                t[bytes[i + 7]];
    }
    for (; i < end; i++)
        crc = t[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return ~crc >>> 0;
}
