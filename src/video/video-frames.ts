import type { VideoSample } from 'mediabunny';
import { fail } from '../core/errors.ts';
import type { RgbaImage } from '../image/image.ts';
import { yuvToRgba, type YuvPlanes } from '../media/yuv.ts';

function rotate(image: RgbaImage, rotation: number): RgbaImage {
  if (rotation === 0) return image;
  const { width, height, data } = image;
  const isQuarter = rotation === 90 || rotation === 270;
  const outWidth = isQuarter ? height : width;
  const outHeight = isQuarter ? width : height;
  const out = new Uint8Array(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let tx = x;
      let ty = y;
      if (rotation === 90) [tx, ty] = [height - 1 - y, x];
      else if (rotation === 180) [tx, ty] = [width - 1 - x, height - 1 - y];
      else if (rotation === 270) [tx, ty] = [y, width - 1 - x];
      out.set(
        data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4),
        (ty * outWidth + tx) * 4,
      );
    }
  }
  return { width: outWidth, height: outHeight, data: out };
}

function bgraToRgba(data: Uint8Array): void {
  for (let i = 0; i < data.length; i += 4) {
    const b = data[i];
    data[i] = data[i + 2];
    data[i + 2] = b;
    data[i + 3] = 255;
  }
}

async function copyNative(sample: VideoSample): Promise<RgbaImage> {
  const format = sample.format;
  const { width, height } = sample.visibleRect;
  const data = new Uint8Array(sample.allocationSize());
  const layout = await sample.copyTo(data);
  if (format === 'RGBA' || format === 'RGBX' || format === 'BGRA' || format === 'BGRX') {
    const out = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      out.set(
        data.subarray(
          layout[0].offset + y * layout[0].stride,
          layout[0].offset + y * layout[0].stride + width * 4,
        ),
        y * width * 4,
      );
    }
    if (format.startsWith('BGR')) bgraToRgba(out);
    else if (format === 'RGBX') for (let i = 3; i < out.length; i += 4) out[i] = 255;
    return { width, height, data: out };
  }
  const planar =
    format === 'I420' || format === 'I420A'
      ? 'I420'
      : format === 'I422' || format === 'I422A'
        ? 'I422'
        : format === 'I444' || format === 'I444A'
          ? 'I444'
          : format;
  if (planar !== 'I420' && planar !== 'I422' && planar !== 'I444' && planar !== 'NV12') {
    return fail('UNSUPPORTED', `Unsupported video pixel format ${format}`);
  }
  const color = sample.colorSpace;
  const planes: YuvPlanes = {
    format: planar,
    width,
    height,
    data,
    layout: layout.map((plane) => ({ offset: plane.offset, stride: plane.stride })),
    matrix: color.matrix === 'bt709' ? 'bt709' : 'bt601',
    isFullRange: color.fullRange ?? false,
  };
  return yuvToRgba(planes);
}

/** Copies a decoded video frame to RGBA in display orientation. */
export async function sampleToRgba(sample: VideoSample): Promise<RgbaImage> {
  let image: RgbaImage | null = null;
  try {
    const { width, height } = sample.visibleRect;
    const data = new Uint8Array(sample.allocationSize({ format: 'RGBA' }));
    await sample.copyTo(data, { format: 'RGBA' });
    image = { width, height, data };
  } catch {
    image = await copyNative(sample);
  }
  return rotate(image, sample.rotation);
}
