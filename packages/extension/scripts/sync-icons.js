/**
 * Sync logo/icon from web (single source of truth).
 * Copies packages/web/public/favicon.svg to:
 *   - extension/media/icon.svg
 *   - icon.svg (repo root)
 * Then regenerates extension icon.png.
 * Web build copies public/ to dist/; extension pack includes media/.
 * Run from repo root: node packages/extension/scripts/sync-icons.js
 */
const path = require('path');
const fs = require('fs');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
process.chdir(repoRoot);
const extDir = path.resolve(__dirname, '..');
const webFavicon = path.join(repoRoot, 'packages', 'web', 'public', 'favicon.svg');
const extIconSvg = path.join(extDir, 'media', 'icon.svg');
const rootIconSvg = path.join(repoRoot, 'icon.svg');

if (!fs.existsSync(webFavicon)) {
  console.error('Web favicon not found:', webFavicon);
  process.exit(1);
}

fs.copyFileSync(webFavicon, extIconSvg);
console.log('Copied:', webFavicon, '-> extension/media/icon.svg');

fs.copyFileSync(webFavicon, rootIconSvg);
console.log('Copied:', webFavicon, '-> icon.svg (root)');

require('./svg-to-png.js');
