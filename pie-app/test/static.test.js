// Pruebas estáticas de la PWA (sin navegador): copia para Apps Script, versión del service worker,
// sin confirm() nativos, sin emojis como íconos y sin recursos externos.
// Uso: node test/static.test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'app/index.html'), 'utf8');
const gas = fs.readFileSync(path.join(root, 'apps-script/Index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'app/sw.js'), 'utf8');
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('ok - ' + name); };

ok('apps-script/Index.html es copia exacta de app/index.html', () => {
  assert.ok(gas === html, 'copiar app/index.html a apps-script/Index.html');
});

ok('el service worker usa la versión de la app', () => {
  const v = /var APP_VERSION = '([^']+)'/.exec(html);
  assert.ok(v, 'falta APP_VERSION');
  assert.ok(sw.includes("'pie-carga-v" + v[1] + "'"), 'CACHE de sw.js no coincide con APP_VERSION ' + v[1]);
});

ok('sin confirm() nativos (se usa la hoja ask())', () => {
  assert.ok(!/\bconfirm\(/.test(html), 'hay un confirm(');
});

ok('sin emojis ni caracteres sueltos como íconos (se usa el sprite SVG)', () => {
  const m = html.match(/[\u{1F300}-\u{1FAFF}⚙⚠⏳⋯▾▸▴✕＋]/u);
  assert.ok(!m, 'glifo encontrado: ' + (m && m[0]));
});

ok('sin recursos externos (funciona sin señal y dentro de Apps Script)', () => {
  const allowed = [/^https:\/\/drive\.google\.com\/thumbnail/, /^https:\/\/script\.google\.com\//, /^http:\/\/www\.w3\.org\/2000\/svg/];
  const urls = html.match(/https?:\/\/[^"' )]+/g) || [];
  const bad = urls.filter(u => !allowed.some(r => r.test(u)));
  assert.deepStrictEqual(bad, []);
  assert.ok(!/<(script|link)[^>]+(src|href)=["']https?:/i.test(html), 'script o link externo');
});

ok('campos y textos con tamaño legible (16 px en campos)', () => {
  assert.ok(/input, select, textarea\s*\{[^}]*font-size:\s*16px/.test(html), 'falta font-size 16px en los campos');
});

console.log(n + ' pruebas estáticas OK');
