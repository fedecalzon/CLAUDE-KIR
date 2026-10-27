import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const file of ['apps-script/Code.gs', 'apps-script/Beta.gs', 'pwa/sw.js']) {
  new vm.Script(fs.readFileSync(path.join(root, file), 'utf8'), {filename: file});
}
for (const file of ['apps-script/Index.html', 'pwa/index.html']) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  let scripts = 0;
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    new vm.Script(match[1], {filename: file + ':' + (++scripts)});
  }
}
for (const file of ['apps-script/appsscript.json', 'planos/planos.json', 'pwa/manifest.webmanifest']) {
  JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}
if (!fs.readFileSync(path.join(root, 'apps-script/Index.html')).equals(fs.readFileSync(path.join(root, 'pwa/index.html')))) {
  throw new Error('Index.html de Apps Script y PWA no coinciden');
}
console.log('Sintaxis JS, JSON e igualdad del HTML: OK');
