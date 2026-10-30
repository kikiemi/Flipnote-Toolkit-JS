import { check } from '../core/errors.ts';
import type { Rect } from '../image/image.ts';

/** One layer of a frame: a pixel value per byte (0 = empty). */
export interface Bitmap {
  width: number;
  height: number;
  pixels: Uint8Array;
}

export type BrushShape = 'round' | 'square';

/** 4x4 screen-aligned patterns, like the toned pens of the apps. */
export const TONES = {
  solid: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  dark: [1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1],
  checker: [1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1],
  medium: [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0],
  light: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
  horizontal: [1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
  vertical: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
  diagonal: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
} as const satisfies Record<string, readonly number[]>;

export type ToneName = keyof typeof TONES;

export interface Brush {
  /** Diameter in pixels (default 1). */
  size?: number;
  shape?: BrushShape;
  /** Pattern the stroke is masked with (default 'solid'). */
  tone?: ToneName;
  /** Value written: 0 erases, 1 or 2 pick the layer's first or second color. */
  value: number;
}

export function createBitmap(width: number, height: number, pixels?: Uint8Array): Bitmap {
  check(
    !pixels || pixels.length === width * height,
    'INVALID_ARGUMENT',
    'Bitmap size does not match',
  );
  return { width, height, pixels: pixels ?? new Uint8Array(width * height) };
}

/** Offsets covered by a brush tip, relative to its center. */
function brushOffsets(size: number, shape: BrushShape): Int16Array {
  const offsets: number[] = [];
  const radius = size / 2;
  const start = -Math.floor((size - 1) / 2);
  for (let dy = start; dy < start + size; dy++) {
    for (let dx = start; dx < start + size; dx++) {
      if (shape === 'round' && size > 2) {
        const cx = dx - start + 0.5 - radius;
        const cy = dy - start + 0.5 - radius;
        if (cx * cx + cy * cy > radius * radius) continue;
      }
      offsets.push(dx, dy);
    }
  }
  return Int16Array.from(offsets);
}

class Stamper {
  private readonly bitmap: Bitmap;
  private readonly offsets: Int16Array;
  private readonly tone: readonly number[];
  private readonly value: number;

  constructor(bitmap: Bitmap, brush: Brush) {
    this.bitmap = bitmap;
    this.offsets = brushOffsets(Math.max(1, Math.round(brush.size ?? 1)), brush.shape ?? 'round');
    this.tone = TONES[brush.tone ?? 'solid'];
    this.value = brush.value;
  }

  stamp(x: number, y: number): void {
    const { width, height, pixels } = this.bitmap;
    for (let i = 0; i < this.offsets.length; i += 2) {
      const px = x + this.offsets[i];
      const py = y + this.offsets[i + 1];
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      if (this.tone[((py & 3) << 2) | (px & 3)]) pixels[py * width + px] = this.value;
    }
  }

  /** Stamps along a line with Bresenham's algorithm. */
  line(x0: number, y0: number, x1: number, y1: number): void {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    for (;;) {
      this.stamp(x0, y0);
      if (x0 === x1 && y0 === y1) return;
      const doubled = error * 2;
      if (doubled >= dy) {
        error += dy;
        x0 += sx;
      }
      if (doubled <= dx) {
        error += dx;
        y0 += sy;
      }
    }
  }
}

export function drawDot(bitmap: Bitmap, x: number, y: number, brush: Brush): void {
  new Stamper(bitmap, brush).stamp(Math.round(x), Math.round(y));
}

export function drawLine(
  bitmap: Bitmap,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  brush: Brush,
): void {
  new Stamper(bitmap, brush).line(x0, y0, x1, y1);
}

/** Draws a connected stroke through `points` ([x0, y0, x1, y1, ...]). */
export function drawStroke(bitmap: Bitmap, points: ArrayLike<number>, brush: Brush): void {
  const stamper = new Stamper(bitmap, brush);
  if (points.length === 2) stamper.stamp(Math.round(points[0]), Math.round(points[1]));
  for (let i = 2; i + 1 < points.length; i += 2) {
    stamper.line(points[i - 2], points[i - 1], points[i], points[i + 1]);
  }
}

export function drawRect(bitmap: Bitmap, rect: Rect, brush: Brush, isFilled = false): void {
  const { x, y, width, height } = rect;
  if (width <= 0 || height <= 0) return;
  if (isFilled) {
    const stamper = new Stamper(bitmap, { ...brush, size: 1 });
    for (let row = y; row < y + height; row++) stamper.line(x, row, x + width - 1, row);
    return;
  }
  const stamper = new Stamper(bitmap, brush);
  const right = x + width - 1;
  const bottom = y + height - 1;
  stamper.line(x, y, right, y);
  stamper.line(right, y, right, bottom);
  stamper.line(right, bottom, x, bottom);
  stamper.line(x, bottom, x, y);
}

export function drawEllipse(bitmap: Bitmap, rect: Rect, brush: Brush, isFilled = false): void {
  const rx = rect.width / 2;
  const ry = rect.height / 2;
  const cx = rect.x + rx - 0.5;
  const cy = rect.y + ry - 0.5;
  if (rx <= 0 || ry <= 0) return;
  if (isFilled) {
    const stamper = new Stamper(bitmap, { ...brush, size: 1 });
    for (let row = Math.ceil(cy - ry); row <= Math.floor(cy + ry); row++) {
      const t = (row - cy) / ry;
      const half = rx * Math.sqrt(Math.max(0, 1 - t * t));
      stamper.line(Math.round(cx - half), row, Math.round(cx + half), row);
    }
    return;
  }
  const stamper = new Stamper(bitmap, brush);
  const steps = Math.max(16, Math.ceil(Math.PI * (rx + ry)));
  let px = Math.round(cx + rx);
  let py = Math.round(cy);
  for (let i = 1; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const nx = Math.round(cx + rx * Math.cos(angle));
    const ny = Math.round(cy + ry * Math.sin(angle));
    stamper.line(px, py, nx, ny);
    px = nx;
    py = ny;
  }
}

/** Fills the area of equal pixels around (x, y) with `value`; returns the pixels changed. */
export function fillArea(
  bitmap: Bitmap,
  x: number,
  y: number,
  value: number,
  tone: ToneName = 'solid',
): number {
  const { width, height, pixels } = bitmap;
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;
  const target = pixels[y * width + x];
  const pattern = TONES[tone];
  if (target === value && tone === 'solid') return 0;
  const visited = new Uint8Array(width * height);
  const stack = [y * width + x];
  let count = 0;
  while (stack.length) {
    const start = stack.pop()!;
    if (visited[start]) continue;
    const row = Math.floor(start / width) * width;
    let left = start;
    while (left > row && pixels[left - 1] === target && !visited[left - 1]) left--;
    let right = start;
    while (right < row + width - 1 && pixels[right + 1] === target && !visited[right + 1]) right++;
    for (let p = left; p <= right; p++) {
      visited[p] = 1;
      const px = p - row;
      const py = row / width;
      if (pattern[((py & 3) << 2) | (px & 3)]) {
        pixels[p] = value;
        count++;
      }
      if (row > 0 && !visited[p - width] && pixels[p - width] === target) stack.push(p - width);
      if (row + width < pixels.length && !visited[p + width] && pixels[p + width] === target) {
        stack.push(p + width);
      }
    }
  }
  return count;
}

export function clearBitmap(bitmap: Bitmap, value = 0): void {
  bitmap.pixels.fill(value);
}

/** Moves every pixel by (dx, dy); pixels moved off the edge are lost. */
export function shiftBitmap(bitmap: Bitmap, dx: number, dy: number): void {
  const { width, height, pixels } = bitmap;
  const source = pixels.slice();
  pixels.fill(0);
  for (let y = Math.max(0, dy); y < Math.min(height, height + dy); y++) {
    const from = (y - dy) * width;
    const x0 = Math.max(0, dx);
    const x1 = Math.min(width, width + dx);
    pixels.set(source.subarray(from + x0 - dx, from + x1 - dx), y * width + x0);
  }
}

export function flipBitmap(bitmap: Bitmap, axis: 'horizontal' | 'vertical'): void {
  const { width, height, pixels } = bitmap;
  if (axis === 'vertical') {
    const row = new Uint8Array(width);
    for (let y = 0; y < height >> 1; y++) {
      const a = y * width;
      const b = (height - 1 - y) * width;
      row.set(pixels.subarray(a, a + width));
      pixels.copyWithin(a, b, b + width);
      pixels.set(row, b);
    }
    return;
  }
  for (let y = 0; y < height; y++) pixels.subarray(y * width, (y + 1) * width).reverse();
}

export function copyRegion(bitmap: Bitmap, rect: Rect): Bitmap {
  const out = createBitmap(rect.width, rect.height);
  for (let y = 0; y < rect.height; y++) {
    const sy = rect.y + y;
    if (sy < 0 || sy >= bitmap.height) continue;
    for (let x = 0; x < rect.width; x++) {
      const sx = rect.x + x;
      if (sx >= 0 && sx < bitmap.width) {
        out.pixels[y * rect.width + x] = bitmap.pixels[sy * bitmap.width + sx];
      }
    }
  }
  return out;
}

/** Draws `region` at (x, y); with `isTransparent`, empty pixels leave the target unchanged. */
export function pasteRegion(
  bitmap: Bitmap,
  region: Bitmap,
  x: number,
  y: number,
  isTransparent = true,
): void {
  for (let ry = 0; ry < region.height; ry++) {
    const ty = y + ry;
    if (ty < 0 || ty >= bitmap.height) continue;
    for (let rx = 0; rx < region.width; rx++) {
      const tx = x + rx;
      const value = region.pixels[ry * region.width + rx];
      if (tx < 0 || tx >= bitmap.width || (isTransparent && value === 0)) continue;
      bitmap.pixels[ty * bitmap.width + tx] = value;
    }
  }
}

/** Replaces one pixel value with another (e.g. swapping a layer's two colors). */
export function replaceValue(bitmap: Bitmap, from: number, to: number): void {
  const pixels = bitmap.pixels;
  for (let i = 0; i < pixels.length; i++) if (pixels[i] === from) pixels[i] = to;
}

/** Bounding box of non-empty pixels, or null when the bitmap is empty. */
export function findBounds(bitmap: Bitmap): Rect | null {
  const { width, height, pixels } = bitmap;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!pixels[y * width + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/**
 * Scales the `from` area of `source` into the `to` area of `target`, keeping pixel values:
 * enlarging repeats pixels; shrinking keeps a pixel where enough of its area is drawn, so thin
 * lines survive, and takes the value covering most of it.
 */
export function resampleBitmap(source: Bitmap, from: Rect, target: Bitmap, to: Rect): void {
  const scaleX = from.width / to.width;
  const scaleY = from.height / to.height;
  const weights = new Float64Array(256);
  for (let y = 0; y < to.height; y++) {
    const ty = to.y + y;
    if (ty < 0 || ty >= target.height) continue;
    const y0 = from.y + y * scaleY;
    const y1 = y0 + scaleY;
    for (let x = 0; x < to.width; x++) {
      const tx = to.x + x;
      if (tx < 0 || tx >= target.width) continue;
      const x0 = from.x + x * scaleX;
      const x1 = x0 + scaleX;
      let value = 0;
      if (scaleX <= 1 && scaleY <= 1) {
        const sx = Math.min(source.width - 1, Math.floor(x0 + scaleX / 2));
        const sy = Math.min(source.height - 1, Math.floor(y0 + scaleY / 2));
        value = source.pixels[sy * source.width + sx];
      } else {
        weights.fill(0);
        let drawn = 0;
        for (let sy = Math.floor(y0); sy < Math.min(source.height, Math.ceil(y1)); sy++) {
          const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
          for (let sx = Math.floor(x0); sx < Math.min(source.width, Math.ceil(x1)); sx++) {
            const pixel = source.pixels[sy * source.width + sx];
            if (!pixel) continue;
            const weight = wy * (Math.min(x1, sx + 1) - Math.max(x0, sx));
            weights[pixel] += weight;
            drawn += weight;
          }
        }
        if (drawn >= 0.25 * scaleX * scaleY) {
          for (let v = 1; v < 256; v++) if (weights[v] > weights[value]) value = v;
        }
      }
      target.pixels[ty * target.width + tx] = value;
    }
  }
}
