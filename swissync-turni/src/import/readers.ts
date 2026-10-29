import { drawScaled, loadImage, preprocessForOcr, rasterOf, toJpegDataUrl } from '@/lib/image';
import { groupLines, linesToText, tokensFromCells, tokensFromText, type PlanDocument, type Token } from '@/engine/recognition/tokens';
import { fmtHM } from '@/engine/time';
import type { Locale, SourceKind } from '@/engine/types';

export type ReadStage = 'loading' | 'ocr-init' | 'ocr' | 'pdf' | 'sheet' | 'done';
export type ProgressFn = (stage: ReadStage, progress: number) => void;

const OCR_LANGS: Record<Locale, string> = { it: 'ita', en: 'eng', de: 'deu', fr: 'fra' };

export function sourceKindOf(file: File): SourceKind | null {
  const name = file.name.toLowerCase();
  if (file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|bmp|gif)$/.test(name)) return 'image';
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (/\.(xlsx|xlsm|csv|tsv)$/.test(name) || file.type.includes('spreadsheet') || file.type === 'text/csv') return 'sheet';
  if (file.type.startsWith('text/') || name.endsWith('.txt')) return 'text';
  return null;
}

// ---------------------------------------------------------------------------
// OCR (Tesseract, runs on the device)
// ---------------------------------------------------------------------------

type TesseractWorker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>;
let workerPromise: Promise<TesseractWorker> | null = null;
let workerLangs = '';
let progressListener: ProgressFn | null = null;

async function getWorker(locale: Locale, onProgress?: ProgressFn): Promise<TesseractWorker> {
  const langs = [...new Set([OCR_LANGS[locale], 'eng'])];
  const key = langs.join('+');
  progressListener = onProgress ?? null;
  if (workerPromise && workerLangs === key) return workerPromise;
  if (workerPromise) (await workerPromise).terminate().catch(() => undefined);
  workerLangs = key;
  workerPromise = (async () => {
    const T = await import('tesseract.js');
    // OCR assets are bundled with the app (public/tesseract): works offline, no CDN.
    const base = new URL('tesseract/', document.baseURI).href;
    const worker = await T.createWorker(langs, T.OEM.LSTM_ONLY, {
      workerPath: `${base}worker.min.js`,
      corePath: base,
      langPath: `${base}lang`,
      gzip: true,
      workerBlobURL: false,
      logger: (m) => {
        if (m.status === 'recognizing text') progressListener?.('ocr', m.progress);
        else progressListener?.('ocr-init', m.progress);
      },
    });
    await worker.setParameters({
      tessedit_pageseg_mode: T.PSM.SPARSE_TEXT,
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    });
    return worker;
  })();
  workerPromise.catch(() => {
    workerPromise = null;
  });
  return workerPromise;
}

/** Runs OCR on a canvas and returns positioned word tokens. */
export async function ocrCanvas(canvas: HTMLCanvasElement, locale: Locale, page = 1, onProgress?: ProgressFn): Promise<Token[]> {
  const worker = await getWorker(locale, onProgress);
  const prepared = preprocessForOcr(canvas);
  const scale = canvas.width / prepared.width;
  const { data } = await worker.recognize(prepared, {}, { blocks: true, text: true });
  const tokens: Token[] = [];
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        for (const w of line.words) {
          const text = w.text.trim();
          if (!text || w.confidence < 15) continue;
          tokens.push({
            text,
            x: w.bbox.x0 * scale,
            y: w.bbox.y0 * scale,
            w: (w.bbox.x1 - w.bbox.x0) * scale,
            h: (w.bbox.y1 - w.bbox.y0) * scale,
            page,
            conf: w.confidence,
          });
        }
      }
    }
  }
  return tokens;
}

export async function readImage(file: File, locale: Locale, onProgress?: ProgressFn, rotate = 0): Promise<PlanDocument> {
  onProgress?.('loading', 0);
  const img = await loadImage(file);
  const canvas = drawScaled(img, 2600, rotate);
  const tokens = await ocrCanvas(canvas, locale, 1, onProgress);
  onProgress?.('done', 1);
  return {
    kind: 'image',
    fileName: file.name || 'foto.jpg',
    tokens,
    text: linesToText(groupLines(tokens)),
    images: [toJpegDataUrl(canvas)],
    pages: 1,
    raster: rasterOf(canvas),
  };
}

// ---------------------------------------------------------------------------
// PDF (text layer via pdf.js; scanned PDFs fall back to OCR)
// ---------------------------------------------------------------------------

let pdfWorker: Worker | null = null;

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfWorker) {
    // Bundled as a regular .js worker: works the same on the web and inside the native apps.
    const { default: PdfWorker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?worker');
    pdfWorker = new PdfWorker();
    pdfjs.GlobalWorkerOptions.workerPort = pdfWorker;
  }
  return pdfjs;
}

export async function readPdf(file: File, locale: Locale, onProgress?: ProgressFn): Promise<PlanDocument> {
  onProgress?.('pdf', 0);
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = Math.min(pdf.numPages, 6);
  let tokens: Token[] = [];
  const images: string[] = [];
  const canvases: HTMLCanvasElement[] = [];
  for (let p = 1; p <= pages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const [, , , d, e, f] = item.transform as number[];
      const h = Math.abs(item.height || d) || 10;
      const yTop = viewport.height - f - h;
      const charW = item.str.length ? item.width / item.str.length : 5;
      const re = /\S+/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(item.str))) {
        tokens.push({ text: m[0], x: e + m.index * charW, y: yTop, w: m[0].length * charW, h, page: p });
      }
    }
    // Render pages for xAI (and OCR when there is no text layer).
    if (p <= 3) {
      const scale = Math.min(2.2, 2000 / Math.max(viewport.width, viewport.height));
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      canvases.push(canvas);
      images.push(toJpegDataUrl(canvas));
    }
    onProgress?.('pdf', p / pages);
  }
  const textChars = tokens.reduce((s, t) => s + t.text.length, 0);
  if (textChars < 40 && canvases.length) {
    tokens = [];
    for (let i = 0; i < canvases.length; i++) {
      tokens.push(...(await ocrCanvas(canvases[i], locale, i + 1, onProgress)));
    }
  }
  onProgress?.('done', 1);
  return { kind: 'pdf', fileName: file.name, tokens, text: linesToText(groupLines(tokens)), images, pages };
}

// ---------------------------------------------------------------------------
// Spreadsheets (CSV / Excel)
// ---------------------------------------------------------------------------

function cellToString(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) {
    // Excel time-only values come back as dates on 1899-12-30/31.
    if (v.getUTCFullYear() < 1901) return fmtHM(v.getUTCHours() * 60 + v.getUTCMinutes());
    return `${String(v.getUTCDate()).padStart(2, '0')}.${String(v.getUTCMonth() + 1).padStart(2, '0')}.${v.getUTCFullYear()}`;
  }
  if (typeof v === 'number') {
    if (v > 0 && v < 1) return fmtHM(Math.round(v * 1440));
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  }
  return String(v);
}

export async function readSheet(file: File, onProgress?: ProgressFn, sheet?: string): Promise<PlanDocument & { sheets: string[] }> {
  onProgress?.('sheet', 0);
  const name = file.name.toLowerCase();
  let rows: string[][];
  let sheets: string[] = [];
  if (name.endsWith('.csv') || name.endsWith('.tsv') || file.type === 'text/csv') {
    const Papa = (await import('papaparse')).default;
    const text = await file.text();
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false });
    rows = parsed.data.map((r) => r.map((c) => (c ?? '').toString()));
  } else {
    const mod = await import('read-excel-file');
    sheets = await mod.readSheetNames(file);
    const raw = await mod.default(file, sheet ? { sheet } : undefined);
    rows = raw.map((r) => r.map(cellToString));
  }
  const tokens = tokensFromCells(rows);
  const text = rows.map((r) => r.join('\t').replace(/\t+$/, '')).filter(Boolean).join('\n');
  onProgress?.('done', 1);
  return { kind: 'sheet', fileName: file.name, tokens, text, images: [], pages: 1, sheets };
}

export function readText(text: string, fileName = 'testo'): PlanDocument {
  const tokens = tokensFromText(text);
  return { kind: 'text', fileName, tokens, text, images: [], pages: 1 };
}

export async function readFile(file: File, locale: Locale, onProgress?: ProgressFn): Promise<PlanDocument> {
  const kind = sourceKindOf(file);
  switch (kind) {
    case 'image':
      return readImage(file, locale, onProgress);
    case 'pdf':
      return readPdf(file, locale, onProgress);
    case 'sheet':
      return readSheet(file, onProgress);
    case 'text':
      return readText(await file.text(), file.name);
    default:
      throw new Error('unsupported_file');
  }
}
