// Servidor de prueba: sirve la PWA (app/) y simula la web app de Apps Script
// en otro puerto, ejecutando Code.gs sobre el libro exportado a JSON.
// Uso: node test/server.js <wb.json> [puertoApp]
const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadWorkbook, createGas } = require('./fake-gas');

const ss = loadWorkbook(process.argv[2]);
const gas = createGas(ss, { PIE_TOKEN: process.env.PIE_TOKEN || '' });
const PORT = Number(process.argv[3] || 8080);
const appDir = path.join(__dirname, '../app');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let f = path.join(appDir, u.pathname === '/' ? 'index.html' : u.pathname);
  if (!f.startsWith(appDir) || !fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT);

const api = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (out) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(out.getContent()); };
  if (req.method === 'OPTIONS') { res.writeHead(405); return res.end(); } // Apps Script no responde preflight
  if (u.pathname === '/__sheet') { // inspección para los tests
    const sh = ss.getSheetByName(u.searchParams.get('name'));
    const from = Number(u.searchParams.get('from')), to = Number(u.searchParams.get('to'));
    const rows = [];
    for (let r = from; r <= to; r++) { const row = []; for (let c = 1; c <= 15; c++) { const cell = sh.cell(r, c); row.push(cell ? (cell.d || cell.f || cell.v) : ''); } rows.push(row); }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({ rows, hidden: sh.hidden, lastRow: sh.getLastRow() }));
  }
  if (req.method === 'GET') return send(gas.doGet({ parameter: Object.fromEntries(u.searchParams) }));
  let body = '';
  req.on('data', d => body += d);
  req.on('end', () => send(gas.doPost({ postData: { contents: body } })));
});
api.listen(PORT + 1);
console.log(`app http://localhost:${PORT}  api http://localhost:${PORT + 1}/exec`);
