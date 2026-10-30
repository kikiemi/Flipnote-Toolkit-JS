import { writeAligned } from '../core/bytes.ts';
import { check } from '../core/errors.ts';

/** 8-bit RGBA pixels, row-major (same layout as ImageData). */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Palette indices plus an RGBA palette (4 bytes per entry). */
export interface IndexedImage {
  width: number;
  height: number;
  pixels: Uint8Array;
  palette: Uint8Array;
}

/** Size and timing of an animated image. */
export interface AnimationInfo {
  width: number;
  height: number;
  /** Display time of each frame in seconds. */
  durations: number[];
  /** 0 loops forever; null when the file does not say. */
  loopCount: number | null;
}

export interface DecodedAnimation extends AnimationInfo {
  frames: RgbaImage[];
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ResizeMethod = 'nearest' | 'area';
export type FitMode = 'contain' | 'cover' | 'stretch' | 'center';

export function createRgbaImage(width: number, height: number): RgbaImage {
  check(
    width > 0 && height > 0 && Number.isInteger(width) && Number.isInteger(height),
    'INVALID_ARGUMENT',
    'Invalid image size',
  );
  return { width, height, data: new Uint8Array(width * height * 4) };
}

export function createPalette(colors: readonly number[], transparentIndex = -1): Uint8Array {
  const palette = new Uint8Array(colors.length * 4);
  for (let i = 0; i < colors.length; i++) {
    palette[i * 4] = colors[i] >> 16;
    palette[i * 4 + 1] = (colors[i] >> 8) & 0xff;
    palette[i * 4 + 2] = colors[i] & 0xff;
    palette[i * 4 + 3] = i === transparentIndex ? 0 : 255;
  }
  return palette;
}

export function indexedToRgba(image: IndexedImage, target?: Uint8Array): RgbaImage {
  const count = image.width * image.height;
  const data = target ?? new Uint8Array(count * 4);
  const colors = new Uint32Array(image.palette.slice().buffer);
  const pixels = image.pixels;
  writeAligned(data, (aligned) => {
    const out = new Uint32Array(aligned.buffer, aligned.byteOffset, count);
    for (let i = 0; i < count; i++) out[i] = colors[pixels[i]];
  });
  return { width: image.width, height: image.height, data };
}

/** Nearest-neighbour integer upscale of palette indices into `target`. */
export function scaleIndicesInto(
  pixels: Uint8Array,
  width: number,
  height: number,
  factor: number,
  target: Uint8Array = new Uint8Array(width * height * factor * factor),
): Uint8Array {
  const outWidth = width * factor;
  for (let y = 0; y < height; y++) {
    const row = y * factor * outWidth;
    const source = y * width;
    for (let x = 0; x < width; x++) {
      target.fill(pixels[source + x], row + x * factor, row + x * factor + factor);
    }
    for (let k = 1; k < factor; k++) target.copyWithin(row + k * outWidth, row, row + outWidth);
  }
  return target;
}

/** Nearest-neighbour integer upscale. */
export function scaleIndexed(image: IndexedImage, factor: number): IndexedImage {
  check(
    Number.isInteger(factor) && factor >= 1,
    'INVALID_ARGUMENT',
    'Scale must be a positive integer',
  );
  if (factor === 1) return image;
  return {
    width: image.width * factor,
    height: image.height * factor,
    pixels: scaleIndicesInto(image.pixels, image.width, image.height, factor),
    palette: image.palette,
  };
}

/** Resizes RGBA pixels; `area` averages covered source pixels (premultiplied by alpha). */
export function resizeRgba(
  image: RgbaImage,
  width: number,
  height: number,
  method: ResizeMethod = 'area',
): RgbaImage {
  const out = createRgbaImage(width, height);
  if (width === image.width && height === image.height) {
    out.data.set(image.data);
    return out;
  }
  const sx = image.width / width;
  const sy = image.height / height;
  const src = image.data;
  const dst = out.data;
  if (method === 'nearest' || (sx <= 1 && sy <= 1)) {
    for (let y = 0; y < height; y++) {
      const row = Math.min(image.height - 1, Math.floor((y + 0.5) * sy)) * image.width;
      for (let x = 0; x < width; x++) {
        const s = (row + Math.min(image.width - 1, Math.floor((x + 0.5) * sx))) * 4;
        const d = (y * width + x) * 4;
        dst[d] = src[s];
        dst[d + 1] = src[s + 1];
        dst[d + 2] = src[s + 2];
        dst[d + 3] = src[s + 3];
      }
    }
    return out;
  }
  for (let y = 0; y < height; y++) {
    const y0 = y * sy;
    const y1 = y0 + sy;
    for (let x = 0; x < width; x++) {
      const x0 = x * sx;
      const x1 = x0 + sx;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let total = 0;
      for (let yy = Math.floor(y0); yy < Math.min(image.height, Math.ceil(y1)); yy++) {
        const wy = Math.min(y1, yy + 1) - Math.max(y0, yy);
        for (let xx = Math.floor(x0); xx < Math.min(image.width, Math.ceil(x1)); xx++) {
          const w = wy * (Math.min(x1, xx + 1) - Math.max(x0, xx));
          const s = (yy * image.width + xx) * 4;
          const alpha = src[s + 3] * w;
          r += src[s] * alpha;
          g += src[s + 1] * alpha;
          b += src[s + 2] * alpha;
          a += alpha;
          total += w;
        }
      }
      const d = (y * width + x) * 4;
      if (a > 0) {
        dst[d] = Math.round(r / a);
        dst[d + 1] = Math.round(g / a);
        dst[d + 2] = Math.round(b / a);
      }
      dst[d + 3] = Math.round(a / total);
    }
  }
  return out;
}

/** Places `image` on a `width`x`height` canvas filled with `background` (RGBA as 0xRRGGBBAA). */
export function fitRgba(
  image: RgbaImage,
  width: number,
  height: number,
  mode: FitMode = 'contain',
  method: ResizeMethod = 'area',
  background = 0xffffffff,
): RgbaImage {
  let w = width;
  let h = height;
  if (mode === 'contain' || mode === 'cover') {
    const scale = (mode === 'contain' ? Math.min : Math.max)(
      width / image.width,
      height / image.height,
    );
    w = Math.max(1, Math.round(image.width * scale));
    h = Math.max(1, Math.round(image.height * scale));
  } else if (mode === 'center') {
    w = image.width;
    h = image.height;
  }
  const scaled = w === image.width && h === image.height ? image : resizeRgba(image, w, h, method);
  const out = createRgbaImage(width, height);
  const fill = new Uint8Array([
    background >>> 24,
    (background >>> 16) & 0xff,
    (background >>> 8) & 0xff,
    background & 0xff,
  ]);
  for (let i = 0; i < out.data.length; i += 4) out.data.set(fill, i);
  const left = Math.floor((width - w) / 2);
  const top = Math.floor((height - h) / 2);
  for (let y = Math.max(0, top); y < Math.min(height, top + h); y++) {
    const sy = y - top;
    const x0 = Math.max(0, left);
    const x1 = Math.min(width, left + w);
    out.data.set(
      scaled.data.subarray((sy * w + (x0 - left)) * 4, (sy * w + (x1 - left)) * 4),
      (y * width + x0) * 4,
    );
  }
  return out;
}

/** Copies a rectangle out of an indexed image. */
export function cropIndexed(image: IndexedImage, rect: Rect): IndexedImage {
  const pixels = new Uint8Array(rect.width * rect.height);
  for (let y = 0; y < rect.height; y++) {
    const start = (rect.y + y) * image.width + rect.x;
    pixels.set(image.pixels.subarray(start, start + rect.width), y * rect.width);
  }
  return { width: rect.width, height: rect.height, pixels, palette: image.palette };
}

/** Copies a rectangle out of an RGBA image. */
export function cropRgba(image: RgbaImage, rect: Rect): RgbaImage {
  const data = new Uint8Array(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y++) {
    const start = ((rect.y + y) * image.width + rect.x) * 4;
    data.set(image.data.subarray(start, start + rect.width * 4), y * rect.width * 4);
  }
  return { width: rect.width, height: rect.height, data };
}
