// Simulador mínimo de los servicios de Apps Script que usa Code.gs,
// suficiente para probar la lógica de lectura/escritura contra el libro real.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const A1 = (s) => {
  const m = /^([A-Z]+)(\d+)?$/.exec(s);
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { c, r: m[2] ? Number(m[2]) : null };
};

function shiftFormula(f, dr) {
  // desplaza referencias relativas de fila (B8 -> B9), respeta $ y referencias a otras hojas con $
  return f.replace(/(\$?)([A-Z]{1,2})(\$?)(\d+)/g, (all, dc, col, dRow, row) =>
    dRow ? all : `${dc}${col}${Number(row) + dr}`);
}

const colName = (c) => { let s = ''; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };

class FakeRange {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
  _each(fn) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) fn(this.r + i, this.c + j, i, j); }
  getRow() { return this.r; }
  getValues() {
    const out = Array.from({ length: this.nr }, () => Array(this.nc).fill(''));
    this._each((r, c, i, j) => {
      const cell = this.sheet.cell(r, c);
      out[i][j] = cell ? (cell.d ? new Date(cell.d + 'T00:00:00') : cell.v ?? '') : '';
    });
    return out;
  }
  getFormulas() {
    const out = Array.from({ length: this.nr }, () => Array(this.nc).fill(''));
    this._each((r, c, i, j) => { const cell = this.sheet.cell(r, c); out[i][j] = cell && cell.f ? cell.f : ''; });
    return out;
  }
  setValues(vals) {
    if (vals.length !== this.nr || vals[0].length !== this.nc) throw new Error('setValues: dimensiones no coinciden');
    this._each((r, c, i, j) => this.sheet.put(r, c, vals[i][j]));
    return this;
  }
  setValue(v) { this.sheet.put(this.r, this.c, v); return this; }
  getDataValidations() {
    const out = Array.from({ length: this.nr }, () => Array(this.nc).fill(null));
    this._each((r, c, i, j) => { out[i][j] = this.sheet.dv.get(`${r},${c}`) || null; });
    return out;
  }
  clearDataValidations() { this._each((r, c) => this.sheet.dv.delete(`${r},${c}`)); return this; }
  setDataValidations(rules) {
    this._each((r, c, i, j) => { if (rules[i][j]) this.sheet.dv.set(`${r},${c}`, rules[i][j]); else this.sheet.dv.delete(`${r},${c}`); });
    return this;
  }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setFontColor() { return this; }
  getValue() { return this.getValues()[0][0]; }
  getNote() { return this.sheet.notes.get(`${this.r},${this.c}`) || ''; }
  setNote(n) { this.sheet.notes.set(`${this.r},${this.c}`, n); return this; }
  clear() { this._each((r, c) => { this.sheet.cells.delete(`${r},${c}`); this.sheet.formats.delete(`${r},${c}`); }); return this; }
  setFormula(f) { this.sheet.put(this.r, this.c, f); return this; }
  clearContent() { this._each((r, c) => this.sheet.put(r, c, '')); return this; }
  setNumberFormat(f) { this._each((r, c) => this.sheet.fmt(r, c).nf = f); return this; }
  breakApart() {
    this.sheet.merges = this.sheet.merges.filter(m => !(m.r1 <= this.r + this.nr - 1 && m.r2 >= this.r && m.c1 <= this.c + this.nc - 1 && m.c2 >= this.c));
    return this;
  }
  copyTo(dst, type) {
    const dr = dst.r - this.r;
    if (type === 'PASTE_FORMAT' || type === 'PASTE_DATA_VALIDATION') {
      this._each((r, c) => {
        const k = `${r},${c}`, nk = `${r + dr},${c}`;
        if (type === 'PASTE_FORMAT') { const f = this.sheet.formats.get(k); if (f) this.sheet.formats.set(nk, { ...f, copiedFrom: k }); }
        else { const v = this.sheet.dv.get(k); if (v) this.sheet.dv.set(nk, v); else this.sheet.dv.delete(nk); }
      });
      return;
    }
    const snap = [];
    this._each((r, c) => snap.push([r, c, this.sheet.cell(r, c), this.sheet.formats.get(`${r},${c}`), this.sheet.dv.get(`${r},${c}`)]));
    for (const [r, c, cell, f, dv] of snap) {
      const nr = r + dr;
      if (dv) this.sheet.dv.set(`${nr},${c}`, dv); else this.sheet.dv.delete(`${nr},${c}`);
      if (!cell) this.sheet.cells.delete(`${nr},${c}`);
      else this.sheet.cells.set(`${nr},${c}`, { ...cell, f: cell.f ? shiftFormula(cell.f, dr) : undefined });
      if (f) this.sheet.formats.set(`${nr},${c}`, { ...f, copiedFrom: `${r},${c}` });
    }
    for (const m of [...this.sheet.merges]) {
      if (m.r1 >= this.r && m.r2 <= this.r + this.nr - 1) this.sheet.merges.push({ r1: m.r1 + dr, r2: m.r2 + dr, c1: m.c1, c2: m.c2 });
    }
    this.sheet.copies.push({ from: this.r, to: dst.r, rows: this.nr });
  }
  createTextFinder(text) {
    const self = this;
    return {
      matchEntireCell() { return this; },
      findNext() {
        for (let r = self.r; r <= self.sheet.lastRow(); r++) {
          const cell = self.sheet.cell(r, self.c);
          if (cell && String(cell.v) === text) return new FakeRange(self.sheet, r, self.c, 1, 1);
        }
        return null;
      }
    };
  }
}

class FakeSheet {
  constructor(name, opts = {}) {
    this.name = name; this.hidden = !!opts.hidden;
    this.cells = new Map(); this.formats = new Map(); this.dv = new Map(); this.notes = new Map(); this.heights = {}; this.merges = []; this.copies = [];
    this.maxRows = 1000; this.maxCols = 26;
  }
  cell(r, c) { return this.cells.get(`${r},${c}`); }
  fmt(r, c) { const k = `${r},${c}`; if (!this.formats.has(k)) this.formats.set(k, {}); return this.formats.get(k); }
  put(r, c, v) {
    const k = `${r},${c}`;
    const rule = this.dv.get(k);
    const isDate = Object.prototype.toString.call(v) === '[object Date]';
    if (rule && rule.strict && !isDate && v !== '' && v != null && !(typeof v === 'string' && v.startsWith('=')) &&
        !rule.allowed.includes(String(v))) {
      throw new Error(`Los datos que ingresaste en la celda ${colName(c)}${r} infringen las reglas de validación de datos establecidas para esta celda.`);
    }
    if (Object.prototype.toString.call(v) === '[object Date]') {
      const p = (n) => String(n).padStart(2, '0');
      this.cells.set(k, { d: `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`, v: '' });
    } else if (typeof v === 'string' && v.startsWith("'")) this.cells.set(k, { v: v.slice(1), quoted: true }); // como Sheets: texto forzado
    else if (typeof v === 'string' && /^[=+]/.test(v)) this.cells.set(k, { f: v, v: '#CALC' });
    else if (v === '' || v == null) this.cells.delete(k);
    else this.cells.set(k, { v });
  }
  lastRow() { let m = 0; for (const [k, cell] of this.cells) if (cell.v !== '' || cell.d || cell.f) m = Math.max(m, Number(k.split(',')[0])); return m; }
  getName() { return this.name; }
  setFrozenRows() { return this; }
  hideColumns(c, n) { this.hiddenCols = [c, n]; return this; }
  isSheetHidden() { return this.hidden; }
  showSheet() { this.hidden = false; }
  hideSheet() { this.hidden = true; }
  getLastRow() { return this.lastRow(); }
  getLastColumn() { let m = 0; for (const k of this.cells.keys()) m = Math.max(m, Number(k.split(',')[1])); return m; }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols; }
  insertRowsAfter(after, n) { if (after !== this.maxRows) throw new Error('solo se simula insertar al final'); this.maxRows += n; }
  insertRowAfter(row) {
    for (const m of [this.cells, this.formats, this.dv, this.notes]) {
      const moved = [...m.entries()].filter(([k]) => Number(k.split(',')[0]) > row).sort((a, b) => Number(b[0].split(',')[0]) - Number(a[0].split(',')[0]));
      for (const [k, v] of moved) { const [r, c] = k.split(',').map(Number); m.delete(k); m.set(`${r + 1},${c}`, v); }
    }
    this.maxRows += 1;
    this.inserted = (this.inserted || 0) + 1;
  }
  setRowHeight(r, h) { this.heights[r] = h; }
  getRowHeight(r) { return this.heights[r] || 21; }
  appendRow(arr) { const r = this.lastRow() + 1; arr.forEach((v, i) => this.put(r, i + 1, v)); }
  getRange(r, c, nr = 1, nc = 1) {
    if (typeof r === 'string') {
      const [a, b] = r.split(':').map(A1);
      return new FakeRange(this, a.r || 1, a.c, b && b.r ? b.r - (a.r || 1) + 1 : this.maxRows, b ? b.c - a.c + 1 : 1);
    }
    if (r < 1 || c < 1 || r + nr - 1 > this.maxRows) throw new Error(`Rango fuera de la hoja ${this.name}: ${r},${c},${nr},${nc} (max ${this.maxRows})`);
    return new FakeRange(this, r, c, nr, nc);
  }
}

class FakeSpreadsheet {
  constructor() { this.sheets = []; this.name = 'PIE - CORE'; }
  getName() { return this.name; }
  getSheets() { return this.sheets; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) { const s = new FakeSheet(n); this.sheets.push(s); return s; }
}

function resolveList(wb, s, f) {
  const m = /^(?:'?([^'!]+)'?!)?\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/.exec(f.trim());
  if (!m) return f.replace(/"/g, '').split(',');
  const src = m[1] ? wb.find(x => x.name === m[1]) : s;
  const c1 = A1(m[2]).c, c2 = A1(m[4]).c;
  const out = [];
  for (let r = Number(m[3]); r <= Number(m[5]); r++) for (let c = c1; c <= c2; c++) {
    const v = (src.values[r - 1] || [])[c - 1];
    if (v != null && v !== '') out.push(String(typeof v === 'object' ? (v.v ?? '') : v));
  }
  return out;
}

function loadWorkbook(jsonPath) {
  const wb = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const ss = new FakeSpreadsheet();
  for (const s of wb) {
    const sh = new FakeSheet(s.name, { hidden: s.hidden });
    s.values.forEach((row, i) => row.forEach((v, j) => {
      if (v == null || v === '') return;
      const k = `${i + 1},${j + 1}`;
      if (typeof v === 'object' && '$d' in v) sh.cells.set(k, { d: v.$d, v: '' });
      else if (typeof v === 'object' && '$f' in v) sh.cells.set(k, { f: v.$f, v: v.v && v.v.$d ? '' : (v.v ?? '') });
      else sh.cells.set(k, { v });
    }));
    for (const [r, h] of Object.entries(s.heights)) sh.heights[r] = h;
    for (const m of s.merges) {
      const [a, b] = m.split(':').map(A1);
      sh.merges.push({ r1: a.r, c1: a.c, r2: b.r, c2: b.c });
    }
    for (const d of s.dv || []) {
      const rule = { formula: d.formula, strict: d.strict, allowed: resolveList(wb, s, d.formula) };
      for (const part of d.sqref.split(/\s+/)) {
        const [a, b] = part.split(':').map(A1);
        const e = b || a;
        for (let r = a.r; r <= e.r; r++) for (let c = a.c; c <= e.c; c++) sh.dv.set(`${r},${c}`, rule);
      }
    }
    sh.maxRows = Math.max(1000, s.values.length + 50);
    sh.maxCols = Math.max(26, (s.values[0] || []).length);
    ss.sheets.push(sh);
  }
  return ss;
}

class FakeFolder {
  constructor(name, drive) { this.name = name; this.drive = drive; this.id = 'fld' + (++drive.n); this.files = []; this.folders = []; drive.byId[this.id] = this; }
  getId() { return this.id; }
  getName() { return this.name; }
  setTrashed(t) { this.trashed = t; }
  createFolder(n) { const f = new FakeFolder(n, this.drive); this.folders.push(f); return f; }
  getFoldersByName(n) { const l = this.folders.filter(f => f.name === n); let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; }
  createFile(blob) {
    const id = 'file' + (++this.drive.n);
    const f = { id, name: blob.name, bytes: blob.bytes.length, getId: () => id, getUrl: () => `https://drive.google.com/file/d/${id}/view`, setDescription() { return this; } };
    this.files.push(f);
    return f;
  }
}

function createGas(ss, props = {}, extra = {}) {
  if (!('PIE_TOKEN' in props)) props.PIE_TOKEN = 'clave-prueba';
  const drive = { n: 0, byId: {} };
  const root = new FakeFolder('Mi unidad', drive);
  const src = fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8');
  const appDir = path.join(__dirname, '../app');
  class Html {
    constructor(c) { this.c = c; this.meta = {}; }
    getContent() { return this.c; }
    setTitle() { return this; }
    addMetaTag(k, v) { this.meta[k] = v; return this; }
    setXFrameOptionsMode() { return this; }
  }
  const ctx = {
    module: { exports: {} },
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      openById: (id) => { if (!extra.books || !extra.books[id]) throw new Error('No se encontró la hoja ' + id); return extra.books[id]; },
      flush() {},
      CopyPasteType: { PASTE_NORMAL: 'PASTE_NORMAL', PASTE_FORMAT: 'PASTE_FORMAT', PASTE_DATA_VALIDATION: 'PASTE_DATA_VALIDATION' },
      getUi() { throw new Error('sin UI'); }
    },
    LockService: { getDocumentLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }) },
    DriveApp: {
      getRootFolder: () => root,
      getFileById: (id) => {
        if (extra.noDriveScope) throw new Error('No tienes permiso para llamar a DriveApp.getFileById. Permisos necesarios: https://www.googleapis.com/auth/drive');
        const f = (extra.files || {})[id];
        if (!f) throw new Error('No se encontró el archivo');
        return { getMimeType: () => f.mime, getName: () => f.name, getId: () => id, getLastUpdated: () => new Date(f.updated || 0),
          getBlob: () => ({ bytes: [] }), setTrashed: () => { f.trashed = true; } };
      },
      getFolderById: (id) => { if (!drive.byId[id]) throw new Error('No existe la carpeta'); return drive.byId[id]; }
    },
    __drive: drive,
    MimeType: { GOOGLE_SHEETS: 'application/vnd.google-apps.spreadsheet', MICROSOFT_EXCEL: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', MICROSOFT_EXCEL_LEGACY: 'application/vnd.ms-excel' },
    Drive: extra.advancedDrive ? { Files: { create: (meta) => {
      const id = 'conv' + (++drive.n) + 'xxxxxxxxxxxxxxxxxxxx';
      extra.books[id] = extra.advancedDrive();
      extra.files[id] = { mime: 'application/vnd.google-apps.spreadsheet', name: meta.name };
      extra.conversions = (extra.conversions || 0) + 1;
      return { id };
    } } } : undefined,
    Session: { getScriptTimeZone: () => 'UTC', getEffectiveUser: () => { throw new Error('No tienes permiso para llamar a Session.getEffectiveUser'); } },
    Logger: { log() {} },
    Utilities: {
      formatDate(d) { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; },
      base64Decode: (s) => Array.from(Buffer.from(s, 'base64')),
      newBlob: (bytes, mime, name) => ({ bytes, mime, name })
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s) => ({ s, setMimeType() { return this; }, getContent() { return this.s; } })
    },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: 1 },
      createHtmlOutputFromFile: (n) => new Html(fs.readFileSync(path.join(appDir, n.toLowerCase() + '.html'), 'utf8')),
      createHtmlOutput: (c) => new Html(c)
    },
    ScriptApp: { getService: () => ({ getUrl: () => 'http://localhost/exec' }) }
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  // las pruebas llaman api() sin clave salvo que la pasen explícitamente
  const rawApi = ctx.api;
  ctx.api = (req) => rawApi(Object.assign({ token: props.PIE_TOKEN }, req));
  return ctx;
}

module.exports = { loadWorkbook, createGas, FakeSheet };
