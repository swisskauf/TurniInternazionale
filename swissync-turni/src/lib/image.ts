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

/**
 * Prepares a photo for OCR: upscales small images, converts to grayscale and stretches
 * contrast (helps thin printed tables and pencil marks).
 */
export function preprocessForOcr(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const minDim = 1600;
  let c = canvas;
  if (Math.max(c.width, c.height) < minDim) {
    const scale = minDim / Math.max(c.width, c.height);
    const up = document.createElement('canvas');
    up.width = Math.round(c.width * scale);
    up.height = Math.round(c.height * scale);
    const uctx = up.getContext('2d')!;
    uctx.imageSmoothingQuality = 'high';
    uctx.drawImage(c, 0, 0, up.width, up.height);
    c = up;
  } else {
    const copy = document.createElement('canvas');
    copy.width = c.width;
    copy.height = c.height;
    copy.getContext('2d')!.drawImage(c, 0, 0);
    c = copy;
  }
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  // Histogram stretch on luminance (2nd–98th percentile).
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) hist[(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0]++;
  const total = d.length / 4;
  let lo = 0;
  let hi = 255;
  for (let acc = 0, v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc > total * 0.02) {
      lo = v;
      break;
    }
  }
  for (let acc = 0, v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc > total * 0.02) {
      hi = v;
      break;
    }
  }
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    const v = Math.max(0, Math.min(255, ((l - lo) / range) * 255));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}
