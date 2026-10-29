// Generates iOS/Android launcher icons and splash screens from resources/icon.svg.
// Run after `npx cap add` or whenever the brand mark changes:  node scripts/generate-native-assets.mjs
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = await readFile(join(root, 'resources/icon.svg'), 'utf8');
const BRAND = '#e5223f';
// White mark only (no background), for adaptive icons and splash screens.
const mark = svg.replace(/<rect width="1024" height="1024" fill="url\(#[gh]\)"\/>/g, '');

const render = (src, size) => sharp(Buffer.from(src), { density: 400 }).resize(size, size).png().toBuffer();
const roundMask = (size) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`);

async function splash(w, h, file) {
  const logo = Math.round(Math.min(w, h) * 0.28);
  await sharp({ create: { width: w, height: h, channels: 4, background: BRAND } })
    .composite([{ input: await render(mark, logo), gravity: 'center' }])
    .png()
    .toFile(file);
}

// iOS ---------------------------------------------------------------------
const ios = join(root, 'ios/App/App/Assets.xcassets');
if (existsSync(ios)) {
  await sharp(Buffer.from(svg), { density: 400 }).resize(1024, 1024).flatten({ background: BRAND }).png().toFile(join(ios, 'AppIcon.appiconset/AppIcon-512@2x.png'));
  for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) await splash(2732, 2732, join(ios, 'Splash.imageset', f));
  console.log('iOS assets ✓');
}

// Android -------------------------------------------------------------------
const res = join(root, 'android/app/src/main/res');
if (existsSync(res)) {
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(densities)) {
    const icon = Math.round(48 * k);
    const fg = Math.round(108 * k);
    const full = await sharp(Buffer.from(svg), { density: 400 }).resize(icon, icon).png().toBuffer();
    const rounded = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${icon}" height="${icon}"><rect width="${icon}" height="${icon}" rx="${icon * 0.22}"/></svg>`);
    await sharp(full).composite([{ input: rounded, blend: 'dest-in' }]).png().toFile(join(res, `mipmap-${d}/ic_launcher.png`));
    await sharp(full).composite([{ input: roundMask(icon), blend: 'dest-in' }]).png().toFile(join(res, `mipmap-${d}/ic_launcher_round.png`));
    // Adaptive foreground: the mark fits the 66dp safe zone of the 108dp canvas.
    const inner = Math.round(fg * 0.62);
    await sharp({ create: { width: fg, height: fg, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await render(mark, inner), gravity: 'center' }])
      .png()
      .toFile(join(res, `mipmap-${d}/ic_launcher_foreground.png`));
  }
  const splashSizes = {
    'drawable/splash.png': [480, 320],
    'drawable-land-mdpi/splash.png': [480, 320], 'drawable-land-hdpi/splash.png': [800, 480], 'drawable-land-xhdpi/splash.png': [1280, 720],
    'drawable-land-xxhdpi/splash.png': [1600, 960], 'drawable-land-xxxhdpi/splash.png': [1920, 1280],
    'drawable-port-mdpi/splash.png': [320, 480], 'drawable-port-hdpi/splash.png': [480, 800], 'drawable-port-xhdpi/splash.png': [720, 1280],
    'drawable-port-xxhdpi/splash.png': [960, 1600], 'drawable-port-xxxhdpi/splash.png': [1280, 1920],
  };
  for (const [file, [w, h]] of Object.entries(splashSizes)) await splash(w, h, join(res, file));
  await writeFile(join(res, 'values/ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#E5223F</color>\n</resources>\n`);
  console.log('Android assets ✓');
}
