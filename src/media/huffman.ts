/** Length-limited Huffman code lengths (JPEG Annex K.3 style adjustment). */
export function buildCodeLengths(frequencies: ArrayLike<number>, maxLength: number): Uint8Array {
  const count = frequencies.length;
  const lengths = new Uint8Array(count);
  const symbols: number[] = [];
  for (let i = 0; i < count; i++) if (frequencies[i] > 0) symbols.push(i);
  if (symbols.length === 0) return lengths;
  if (symbols.length === 1) {
    lengths[symbols[0]] = 1;
    return lengths;
  }
  symbols.sort((a, b) => frequencies[a] - frequencies[b] || a - b);

  const n = symbols.length;
  const weights = new Float64Array(2 * n);
  const parents = new Int32Array(2 * n);
  for (let i = 0; i < n; i++) weights[i] = frequencies[symbols[i]];
  let leaf = 0;
  let node = n;
  let next = n;
  const take = (): number =>
    leaf < n && (node >= next || weights[leaf] <= weights[node]) ? leaf++ : node++;
  while (next < 2 * n - 1) {
    const a = take();
    const b = take();
    weights[next] = weights[a] + weights[b];
    parents[a] = next;
    parents[b] = next;
    next++;
  }
  const depth = new Int32Array(2 * n);
  for (let i = 2 * n - 3; i >= 0; i--) depth[i] = depth[parents[i]] + 1;

  const bits = new Int32Array(Math.max(maxLength, n) + 2);
  for (let i = 0; i < n; i++) bits[depth[i]]++;
  for (let i = bits.length - 1; i > maxLength; i--) {
    while (bits[i] > 0) {
      let j = i - 2;
      while (bits[j] === 0) j--;
      bits[i] -= 2;
      bits[i - 1]++;
      bits[j + 1] += 2;
      bits[j]--;
    }
  }
  let symbol = n - 1;
  for (let length = 1; length <= maxLength; length++) {
    for (let k = 0; k < bits[length]; k++) lengths[symbols[symbol--]] = length;
  }
  return lengths;
}

/** Canonical codes for the given lengths (most significant bit first). */
export function buildCanonicalCodes(lengths: Uint8Array): Uint32Array {
  const maxLength = lengths.reduce((max, value) => Math.max(max, value), 0);
  const counts = new Uint32Array(maxLength + 2);
  for (const length of lengths) if (length) counts[length]++;
  const next = new Uint32Array(maxLength + 2);
  let code = 0;
  for (let length = 1; length <= maxLength; length++) {
    code = (code + counts[length - 1]) << 1;
    next[length] = code;
  }
  const codes = new Uint32Array(lengths.length);
  for (let i = 0; i < lengths.length; i++) if (lengths[i]) codes[i] = next[lengths[i]]++;
  return codes;
}

export function reverseBits(value: number, length: number): number {
  let result = 0;
  for (let i = 0; i < length; i++) {
    result = (result << 1) | (value & 1);
    value >>>= 1;
  }
  return result;
}
