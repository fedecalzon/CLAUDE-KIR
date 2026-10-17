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
  setFormula(f) { this.sheet.put(this.r, this.c, f); return this; }
  clearContent() { this._each((r, c) => this.sheet.put(r, c, '')); return this; }
  setNumberFormat(f) { this._each((r, c) => this.sheet.fmt(r, c).nf = f); return this; }
  breakApart() {
    this.sheet.merges = this.sheet.merges.filter(m => !(m.r1 <= this.r + this.nr - 1 && m.r2 >= this.r && m.c1 <= this.c + this.nc - 1 && m.c2 >= this.c));
    return this;
  }
  copyTo(dst) {
    const dr = dst.r - this.r;
    const snap = [];
    this._each((r, c) => snap.push([r, c, this.sheet.cell(r, c), this.sheet.formats.get(`${r},${c}`)]));
    for (const [r, c, cell, f] of snap) {
      const nr = r + dr;
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
    this.cells = new Map(); this.formats = new Map(); this.heights = {}; this.merges = []; this.copies = [];
    this.maxRows = 1000; this.maxCols = 26;
  }
  cell(r, c) { return this.cells.get(`${r},${c}`); }
  fmt(r, c) { const k = `${r},${c}`; if (!this.formats.has(k)) this.formats.set(k, {}); return this.formats.get(k); }
  put(r, c, v) {
    const k = `${r},${c}`;
    if (Object.prototype.toString.call(v) === '[object Date]') {
      const p = (n) => String(n).padStart(2, '0');
      this.cells.set(k, { d: `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`, v: '' });
    } else if (typeof v === 'string' && v.startsWith('=')) this.cells.set(k, { f: v, v: '#CALC' });
    else if (v === '' || v == null) this.cells.delete(k);
    else this.cells.set(k, { v });
  }
  lastRow() { let m = 0; for (const [k, cell] of this.cells) if (cell.v !== '' || cell.d || cell.f) m = Math.max(m, Number(k.split(',')[0])); return m; }
  getName() { return this.name; }
  isSheetHidden() { return this.hidden; }
  showSheet() { this.hidden = false; }
  hideSheet() { this.hidden = true; }
  getLastRow() { return this.lastRow(); }
  getLastColumn() { let m = 0; for (const k of this.cells.keys()) m = Math.max(m, Number(k.split(',')[1])); return m; }
  getMaxRows() { return this.maxRows; }
  getMaxColumns() { return this.maxCols; }
  insertRowsAfter(after, n) { if (after !== this.maxRows) throw new Error('solo se simula insertar al final'); this.maxRows += n; }
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
  constructor() { this.sheets = []; }
  getSheets() { return this.sheets; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n) { const s = new FakeSheet(n); this.sheets.push(s); return s; }
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
    sh.maxRows = Math.max(1000, s.values.length + 50);
    sh.maxCols = Math.max(26, (s.values[0] || []).length);
    ss.sheets.push(sh);
  }
  return ss;
}

function createGas(ss, props = {}) {
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
      flush() {},
      CopyPasteType: { PASTE_NORMAL: 'PASTE_NORMAL' },
      getUi() { throw new Error('sin UI'); }
    },
    LockService: { getDocumentLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null }) },
    Session: { getScriptTimeZone: () => 'UTC' },
    Utilities: {
      formatDate(d) { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
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
  return ctx;
}

module.exports = { loadWorkbook, createGas, FakeSheet };
