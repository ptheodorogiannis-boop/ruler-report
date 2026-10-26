// Pure text parsing shared by the custom-data connectors (server) and the editor's typed-data input (client):
// a CSV/TSV splitter that honours quotes, and a number parser that copes with EU and US formats.

export function parseCsv(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const delim = delimiter ?? detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

export function detectDelimiter(s: string): string {
  const first = s.split(/\r?\n/, 1)[0] ?? '';
  const counts = [',', ';', '\t', '|'].map((d) => [d, first.split(d).length] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 1 ? counts[0][0] : ',';
}

export function parseNumber(raw: unknown, decimal: 'auto' | 'dot' | 'comma' = 'auto'): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  let s = raw.trim().replace(/[€$£%\s ]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (!s || !/^[-+]?[\d.,]+$/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  // one separator, exactly 3 digits after it and a short integer part ("1.234", "12,500") → thousands separator
  const oneSep = (s.match(/[.,]/g) ?? []).length === 1 && /^[-+]?[1-9]\d{0,2}[.,]\d{3}$/.test(s);
  const dec: 'dot' | 'comma' =
    decimal !== 'auto' ? decimal : oneSep ? (lastDot > lastComma ? 'comma' : 'dot') : lastDot > lastComma ? 'dot' : lastComma > lastDot ? 'comma' : 'dot';
  if (dec === 'comma') s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
