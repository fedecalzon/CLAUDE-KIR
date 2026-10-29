// Entorno local para trabajar el front sin Apps Script ni la planilla real en línea.
// Sirve pwa/ y simula la web app (/exec) ejecutando apps-script/Code.gs + Beta.gs sobre un libro exportado a JSON.
//
// Uso:  node herramientas/dev-server.js <wb.json> [fod.json] [--planos <carpeta con .webp y planos.json>] [--port 8080] [--sw]
// Abre: la URL que imprime (ya trae ?api=…&token=dev, así la app queda configurada sola).
//
// - Las escrituras (altas, AP/RZ, FUM, pines, fotos) se aplican al libro EN MEMORIA: al cortar el servidor se pierden.
// - Sin --sw, el service worker no se instala (si no, el navegador muestra el index.html viejo desde la caché).
// - Inspección de la planilla simulada: GET <api>/__sheet?name=<hoja>&from=<fila>&to=<fila>
const http = require('http');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); if (i < 0) return def; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const PORT = Number(opt('--port', 8080));
const planos = opt('--planos', '');
const withSw = flag('--sw');
if (!args[0]) {
  console.error('Uso: node herramientas/dev-server.js <wb.json> [fod.json] [--planos <carpeta>] [--port 8080] [--sw]');
  process.exit(1);
}

// fake-gas carga <raíz>/<PIE_VER>/apps-script/*.gs y lee las láminas de PIE_PLANOS
process.env.PIE_VER = '.';
if (planos) process.env.PIE_PLANOS = path.resolve(planos);
const { loadWorkbook, createGas } = require('./test-v2/fake-gas');

const TOKEN = 'dev';
const ss = loadWorkbook(path.resolve(args[0]));
const FODID = 'FODID0000000000000000000';
const books = args[1] ? { [FODID]: loadWorkbook(path.resolve(args[1])) } : {};
const files = { [FODID]: { mime: 'application/vnd.google-apps.spreadsheet', name: 'FOD-02' } };
const gas = createGas(ss, { PIE_TOKEN: TOKEN, FOD02_ID: args[1] ? FODID : '' }, { books, files });
gas.planosFolder_(ss);   // la carpeta Planos existe recién con la primera foto: se crea ya para que lea las láminas

const appDir = path.resolve(__dirname, '../pwa');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp' };

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const f = path.join(appDir, u.pathname === '/' ? 'index.html' : u.pathname);
  if ((!withSw && u.pathname === '/sw.js') || !f.startsWith(appDir) || !fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT);

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const json = (txt) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(txt); };
  if (req.method === 'OPTIONS') { res.writeHead(405); return res.end(); }   // Apps Script no responde preflight
  if (u.pathname === '/__sheet') {
    const sh = ss.getSheetByName(u.searchParams.get('name'));
    if (!sh) return json(JSON.stringify({ error: 'no existe la hoja' }));
    const from = Number(u.searchParams.get('from')), to = Number(u.searchParams.get('to'));
    const rows = [];
    for (let r = from; r <= to; r++) { const row = []; for (let c = 1; c <= 15; c++) { const cell = sh.cell(r, c); row.push(cell ? (cell.d || cell.f || cell.v) : ''); } rows.push(row); }
    return json(JSON.stringify({ rows, lastRow: sh.getLastRow() }));
  }
  if (req.method === 'GET') return json(gas.doGet({ parameter: Object.fromEntries(u.searchParams) }).getContent());
  let body = '';
  req.on('data', d => body += d);
  req.on('end', () => json(gas.doPost({ postData: { contents: body } }).getContent()));
}).listen(PORT + 1);

const api = `http://localhost:${PORT + 1}/exec`;
console.log(`App:  http://localhost:${PORT}/?api=${encodeURIComponent(api)}&token=${TOKEN}`);
console.log(`API:  ${api}   (clave: ${TOKEN})`);
console.log(planos ? `Planos: ${path.resolve(planos)}` : 'Sin --planos: los visores muestran «Falta la imagen del plano».');
