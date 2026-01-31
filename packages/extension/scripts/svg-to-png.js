/**
 * One-off: convert media/icon.svg to media/icon.png at 512x512 for extension packaging.
 * Run from repo root: node packages/extension/scripts/svg-to-png.js
 */
const path = require('path');
const fs = require('fs');

const extDir = path.resolve(__dirname, '..');
const svgPath = path.join(extDir, 'media', 'icon.svg');
const pngPath = path.join(extDir, 'media', 'icon.png');

if (!fs.existsSync(svgPath)) {
  console.error('Missing:', svgPath);
  process.exit(1);
}

const { Resvg } = require('@resvg/resvg-js');
const svg = fs.readFileSync(svgPath, 'utf8');
const resvg = new Resvg(svg, {
  fitTo: { mode: 'zoom', value: 4 }
});
const png = resvg.render().asPng();
fs.writeFileSync(pngPath, png);
console.log('Written:', pngPath, '(' + png.length + ' bytes)');
