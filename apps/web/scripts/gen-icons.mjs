// Generates PWA icons (PNG) from public/icons/icon.svg. Run from apps/web: node scripts/gen-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const dir = join(root, 'apps', 'web', 'public', 'icons');
const svg = readFileSync(join(dir, 'icon.svg'));
for (const size of [192, 512]) {
  writeFileSync(join(dir, `icon-${size}.png`), await sharp(svg).resize(size, size).png().toBuffer());
  // maskable: safe zone = inner 80%, so pad the artwork
  const inner = Math.round(size * 0.8);
  const art = await sharp(svg).resize(inner, inner).png().toBuffer();
  writeFileSync(join(dir, `maskable-${size}.png`), await sharp({ create: { width: size, height: size, channels: 4, background: '#0f766e' } }).composite([{ input: art, gravity: 'centre' }]).png().toBuffer());
}
writeFileSync(join(dir, 'apple-touch-icon.png'), await sharp(svg).resize(180, 180).png().toBuffer());
console.log('icons written to', dir);
