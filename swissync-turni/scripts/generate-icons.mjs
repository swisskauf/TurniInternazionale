// Generates PWA, favicon, Apple and store icons from resources/icon.svg.
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const svg = await readFile(new URL('../resources/icon.svg', import.meta.url));
const out = new URL('../public/icons/', import.meta.url);
await mkdir(out, { recursive: true });

const rounded = (size, radius) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/></svg>`);

async function png(name, size, { round = 0, padding = 0, bg } = {}) {
  const inner = size - padding * 2;
  let img = sharp(svg, { density: 384 }).resize(inner, inner);
  if (padding) img = sharp({ create: { width: size, height: size, channels: 4, background: bg ?? '#e5223f' } }).composite([{ input: await img.png().toBuffer(), top: padding, left: padding }]);
  let buf = await img.png().toBuffer();
  if (round) buf = await sharp(buf).composite([{ input: rounded(size, round), blend: 'dest-in' }]).png().toBuffer();
  await writeFile(new URL(name, out), buf);
}

await png('icon-192.png', 192, { round: 42 });
await png('icon-512.png', 512, { round: 112 });
await png('icon-maskable-512.png', 512, { padding: 52, bg: '#e5223f' });
await png('apple-touch-icon.png', 180);
await png('favicon-32.png', 32, { round: 7 });
// Store / native sources (full bleed, no transparency).
await mkdir(new URL('../resources/', import.meta.url), { recursive: true });
await sharp(svg, { density: 384 }).resize(1024, 1024).flatten({ background: '#e5223f' }).png().toFile(new URL('../resources/icon-1024.png', import.meta.url).pathname);
await sharp(svg, { density: 384 }).resize(512, 512).flatten({ background: '#e5223f' }).png().toFile(new URL('../resources/icon-512-store.png', import.meta.url).pathname);

// Favicon SVG with rounded corners.
const rounded64 = svg.toString().replace('<rect width="1024" height="1024" fill="url(#g)"/>', '<rect width="1024" height="1024" rx="230" fill="url(#g)"/>').replace('<rect width="1024" height="1024" fill="url(#h)"/>', '<rect width="1024" height="1024" rx="230" fill="url(#h)"/>');
await writeFile(new URL('icon.svg', out), rounded64);
console.log('icons generated');
