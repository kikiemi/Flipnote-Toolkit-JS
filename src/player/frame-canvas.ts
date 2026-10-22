import { check } from '../core/errors.ts';

export type CanvasBackend = 'webgl' | '2d';

/**
 * How frames are enlarged: `css` draws at the frame's own size and lets CSS scale it
 * (`image-rendering: pixelated`); `sharp` draws at the canvas's displayed size with WebGL,
 * keeping pixels square and evenly sized at any scale. `sharp` needs a canvas sized by CSS and
 * falls back to `css` without WebGL.
 */
export type CanvasScaling = 'css' | 'sharp';

export interface FrameCanvasOptions {
  /** Default 'auto': WebGL when available, otherwise Canvas 2D. */
  backend?: CanvasBackend | 'auto';
  /** Default 'css'. */
  scaling?: CanvasScaling;
}

/** Shows palette-indexed frames on a canvas. */
export interface FrameCanvas {
  readonly backend: CanvasBackend;
  /** Sets the frame size and the RGBA palette (up to 256 colors). */
  configure(width: number, height: number, palette: Uint8Array): void;
  /** Draws one frame of palette indices. */
  draw(pixels: Uint8Array): void;
  destroy(): void;
}

const MAX_COLORS = 256;

const VERTEX_SHADER = `
attribute vec2 position;
varying vec2 uv;
void main() {
  uv = vec2(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5);
  gl_Position = vec4(position, 0.0, 1.0);
}`;

/**
 * Looks up each frame index in the palette texture. Neighbouring texels are blended only across
 * one output pixel at their shared edge ("sharp bilinear"), so enlarged pixels stay crisp and even.
 */
const FRAGMENT_SHADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D frame;
uniform sampler2D palette;
uniform vec2 size;
uniform vec2 scale;
varying vec2 uv;

vec4 colorAt(vec2 texel) {
  float index = texture2D(frame, (texel + 0.5) / size).r * 255.0;
  return texture2D(palette, vec2((index + 0.5) / ${MAX_COLORS}.0, 0.5));
}

void main() {
  vec2 position = uv * size - 0.5;
  vec2 base = floor(position);
  vec2 blend = clamp((position - base - 0.5) * scale + 0.5, 0.0, 1.0);
  vec2 low = clamp(base, vec2(0.0), size - 1.0);
  vec2 high = clamp(base + 1.0, vec2(0.0), size - 1.0);
  vec4 top = mix(colorAt(low), colorAt(vec2(high.x, low.y)), blend.x);
  vec4 bottom = mix(colorAt(vec2(low.x, high.y)), colorAt(high), blend.x);
  gl_FragColor = mix(top, bottom, blend.y);
}`;

class Canvas2dFrameCanvas implements FrameCanvas {
  readonly backend = '2d';
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private colors = new Uint32Array(0);
  private image: ImageData | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    check(context, 'UNSUPPORTED', 'Canvas 2D is not available');
    this.canvas = canvas;
    this.context = context;
  }

  configure(width: number, height: number, palette: Uint8Array): void {
    this.colors = new Uint32Array(palette.slice().buffer);
    this.canvas.width = width;
    this.canvas.height = height;
    this.image = this.context.createImageData(width, height);
  }

  draw(pixels: Uint8Array): void {
    if (!this.image) return;
    const out = new Uint32Array(this.image.data.buffer);
    for (let i = 0; i < pixels.length; i++) out[i] = this.colors[pixels[i]];
    this.context.putImageData(this.image, 0, 0);
  }

  destroy(): void {
    this.image = null;
  }
}

class WebGlFrameCanvas implements FrameCanvas {
  readonly backend = 'webgl';
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext;
  private frameTexture: WebGLTexture | null = null;
  private paletteTexture: WebGLTexture | null = null;
  private sizeUniform: WebGLUniformLocation | null = null;
  private scaleUniform: WebGLUniformLocation | null = null;
  private width = 0;
  private height = 0;
  private palette = new Uint8Array(MAX_COLORS * 4);
  private pixels: Uint8Array | null = null;
  private observer: ResizeObserver | null = null;
  private isLost = false;

  constructor(canvas: HTMLCanvasElement, gl: WebGLRenderingContext, scaling: CanvasScaling) {
    this.canvas = canvas;
    this.gl = gl;
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    this.setUp();
    if (scaling === 'sharp' && typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver((entries) => this.resize(entries[0]));
      this.observer.observe(canvas);
    }
  }

  private setUp(): void {
    const { gl } = this;
    const program = gl.createProgram()!;
    for (const [type, source] of [
      [gl.VERTEX_SHADER, VERTEX_SHADER],
      [gl.FRAGMENT_SHADER, FRAGMENT_SHADER],
    ] as const) {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
    }
    gl.bindAttribLocation(program, 0, 'position');
    gl.linkProgram(program);
    check(
      gl.getProgramParameter(program, gl.LINK_STATUS) || gl.isContextLost(),
      'UNSUPPORTED',
      `WebGL shaders failed: ${gl.getProgramInfoLog(program)}`,
    );
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.frameTexture = this.createTexture(0);
    this.paletteTexture = this.createTexture(1);
    gl.uniform1i(gl.getUniformLocation(program, 'frame'), 0);
    gl.uniform1i(gl.getUniformLocation(program, 'palette'), 1);
    this.sizeUniform = gl.getUniformLocation(program, 'size');
    this.scaleUniform = gl.getUniformLocation(program, 'scale');
  }

  private createTexture(unit: number): WebGLTexture {
    const { gl } = this;
    const texture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.isLost = true;
  };

  private readonly onContextRestored = (): void => {
    this.isLost = false;
    this.setUp();
    this.upload();
    if (this.pixels) this.draw(this.pixels);
  };

  /** Matches the drawing buffer to the displayed size in device pixels. */
  private resize(entry: ResizeObserverEntry | undefined): void {
    if (!entry || !this.width) return;
    const device = entry.devicePixelContentBoxSize?.[0];
    const box = entry.contentBoxSize?.[0];
    const ratio = globalThis.devicePixelRatio || 1;
    const width = device ? device.inlineSize : Math.round((box?.inlineSize ?? 0) * ratio);
    const height = device ? device.blockSize : Math.round((box?.blockSize ?? 0) * ratio);
    if (width < 1 || height < 1) return;
    if (width === this.canvas.width && height === this.canvas.height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    if (this.pixels) this.draw(this.pixels);
  }

  configure(width: number, height: number, palette: Uint8Array): void {
    check(palette.length <= MAX_COLORS * 4, 'INVALID_ARGUMENT', 'Palettes hold up to 256 colors');
    this.width = width;
    this.height = height;
    this.palette.fill(0);
    this.palette.set(palette);
    this.pixels = null;
    this.canvas.style.aspectRatio = `${width} / ${height}`;
    const displayWidth = this.observer ? this.canvas.clientWidth : 0;
    const ratio =
      displayWidth > 0 ? (displayWidth * (globalThis.devicePixelRatio || 1)) / width : 1;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.upload();
  }

  private upload(): void {
    const { gl } = this;
    if (this.isLost || !this.width) return;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      MAX_COLORS,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.palette,
    );
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.frameTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.LUMINANCE,
      this.width,
      this.height,
      0,
      gl.LUMINANCE,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.uniform2f(this.sizeUniform, this.width, this.height);
  }

  draw(pixels: Uint8Array): void {
    this.pixels = pixels;
    const { gl } = this;
    if (this.isLost || !this.width) return;
    gl.activeTexture(gl.TEXTURE0);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      this.width,
      this.height,
      gl.LUMINANCE,
      gl.UNSIGNED_BYTE,
      pixels,
    );
    const { width, height } = this.canvas;
    gl.viewport(0, 0, width, height);
    gl.uniform2f(
      this.scaleUniform,
      Math.max(1, width / this.width),
      Math.max(1, height / this.height),
    );
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  destroy(): void {
    this.observer?.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.pixels = null;
  }
}

/** Uses WebGL when it is available (and allowed by `backend`), otherwise Canvas 2D. */
export function createFrameCanvas(
  canvas: HTMLCanvasElement,
  options: FrameCanvasOptions = {},
): FrameCanvas {
  const backend = options.backend ?? 'auto';
  if (backend !== '2d') {
    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
    });
    if (gl) return new WebGlFrameCanvas(canvas, gl, options.scaling ?? 'css');
    check(backend === 'auto', 'UNSUPPORTED', 'WebGL is not available');
  }
  return new Canvas2dFrameCanvas(canvas);
}
