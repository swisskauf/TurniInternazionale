// Copies the OCR engine (Tesseract worker + WASM core) and language models into public/tesseract,
// so text recognition runs fully on the device, offline, without any CDN.
import { cp, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'tesseract');
const nm = join(root, 'node_modules');

const files = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ...['ita', 'eng', 'deu', 'fra'].map((l) => [`@tesseract.js-data/${l}/4.0.0_best_int/${l}.traineddata.gz`, `lang/${l}.traineddata.gz`]),
];

await mkdir(join(out, 'lang'), { recursive: true });
for (const [from, to] of files) {
  const src = join(nm, from);
  const dst = join(out, to);
  try {
    const [a, b] = await Promise.all([stat(src), stat(dst).catch(() => null)]);
    if (b && b.size === a.size) continue;
    await cp(src, dst);
  } catch (e) {
    console.warn(`[ocr-assets] missing ${from}: ${e.message}`);
  }
}
console.log('[ocr-assets] ready in public/tesseract');
