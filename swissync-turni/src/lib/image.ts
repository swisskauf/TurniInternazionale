/** Loads a File/Blob into an <img>. */
export function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image_load_failed'));
    };
    img.src = url;
  });
}

export function drawScaled(source: CanvasImageSource & { width: number; height: number }, maxDim: number, rotate = 0): HTMLCanvasElement {
  const w0 = source.width;
  const h0 = source.height;
  const scale = Math.min(1, maxDim / Math.max(w0, h0));
  const w = Math.round(w0 * scale);
  const h = Math.round(h0 * scale);
  const canvas = document.createElement('canvas');
  const swap = rotate % 180 !== 0;
  canvas.width = swap ? h : w;
  canvas.height = swap ? w : h;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.drawImage(source, -w / 2, -h / 2, w, h);
  return canvas;
}

/** Canvas → JPEG data URL, sized for xAI (keeps colors: models read them better than binarized). */
export function toJpegDataUrl(canvas: HTMLCanvasElement, maxDim = 2048, quality = 0.85): string {
  const c = Math.max(canvas.width, canvas.height) > maxDim ? drawScaled(canvas, maxDim) : canvas;
  return c.toDataURL('image/jpeg', quality);
}

/** Sliding-window max/min (monotonic deque), one axis at a time: O(1) per pixel. */
function slide(src: Uint8Array, w: number, h: number, r: number, horizontal: boolean, max: boolean): Uint8Array {
  const out = new Uint8Array(w * h);
  const n = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const dq = new Int32Array(n);
  for (let line = 0; line < lines; line++) {
    const base = horizontal ? line * w : line;
    const step = horizontal ? 1 : w;
    let head = 0;
    let tail = 0;
    let next = 0;
    for (let a = 0; a < n; a++) {
      const hi = Math.min(n - 1, a + r);
      while (next <= hi) {
        const v = src[base + next * step];
        while (tail > head && (max ? src[base + dq[tail - 1] * step] <= v : src[base + dq[tail - 1] * step] >= v)) tail--;
        dq[tail++] = next++;
      }
      while (dq[head] < a - r) head++;
      out[base + a * step] = src[base + dq[head] * step];
    }
  }
  return out;
}

/**
 * Prepares a photo for OCR. Plans often use colored cells (dark text on green, red, blue…):
 * the paper/cell background is estimated with a morphological closing and divided out, so every
 * cell becomes dark text on white whatever its color or the lighting. Then the image is
 * upscaled: Tesseract reads small table text much better at ~2× size.
 */
export function preprocessForOcr(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const w = canvas.width;
  const h = canvas.height;
  const src = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h);
  const d = src.data;
  const gray = new Uint8Array(w * h);
  for (let i = 0, p = 0; p < gray.length; i += 4, p++) gray[p] = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
  // Window wider than a text stroke, narrower than a cell.
  const r = Math.max(3, Math.round(Math.max(w, h) / 520));
  let bg = slide(gray, w, h, r, true, true);
  bg = slide(bg, w, h, r, false, true);
  bg = slide(bg, w, h, r, true, false);
  bg = slide(bg, w, h, r, false, false);
  const lo = 0.4;
  const hi = 0.92;
  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    const ratio = gray[p] / Math.max(8, bg[p]);
    const v = Math.max(0, Math.min(255, ((ratio - lo) / (hi - lo)) * 255));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  const flat = document.createElement('canvas');
  flat.width = w;
  flat.height = h;
  flat.getContext('2d')!.putImageData(src, 0, 0);
  const scale = Math.max(1, Math.min(2.5, 3800 / Math.max(w, h)));
  if (scale === 1) return flat;
  const up = document.createElement('canvas');
  up.width = Math.round(w * scale);
  up.height = Math.round(h * scale);
  const uctx = up.getContext('2d')!;
  uctx.imageSmoothingQuality = 'high';
  uctx.drawImage(flat, 0, 0, up.width, up.height);
  return up;
}

/** Downscaled RGBA copy of a photo, for reading cell colors (token coordinates × scale). */
export function rasterOf(canvas: HTMLCanvasElement, maxDim = 1400): { width: number; height: number; data: Uint8ClampedArray; scale: number } {
  const small = Math.max(canvas.width, canvas.height) > maxDim ? drawScaled(canvas, maxDim) : canvas;
  const img = small.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, small.width, small.height);
  return { width: img.width, height: img.height, data: img.data, scale: small.width / canvas.width };
}

export function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}
