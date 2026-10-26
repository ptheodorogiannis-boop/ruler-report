// Custom-data connectors: Google Sheets, CSV URL, REST/JSON, and the Push API (ingest).
// Column types are detected once at connect time and stored in integration.config.columns, which then
// drives the generated widget catalog (see catalog/build.ts → customCatalog).
import { db } from '@/lib/db';
import { sanitizeKey, type CustomColumn } from '@/lib/catalog/build';
import type { BreakdownRow, Connector, ConnectorContext, DailyData, DateRange } from '@/lib/engine/types';
import { eachDay, isDate } from '@/lib/util/dates';
import { fetchJson, fetchText } from './http';

export type Row = Record<string, string | number | null>;

// CSV and number parsing live in src/lib/util/csv.ts (pure, also used by the editor's typed data); re-exported here for the API and tests
import { parseCsv, parseNumber } from '@/lib/util/csv';
export { parseCsv, parseNumber };

// ───────────── value parsing ─────────────
export function parseDateLoose(raw: unknown, dayFirst = true): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (isDate(s.slice(0, 10)) && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);
  if (m) {
    let [, a, b, y] = m;
    if (y.length === 2) y = '20' + y;
    const [dd, mm] = dayFirst ? [a, b] : [b, a];
    const out = `${y}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    return isDate(out) ? out : null;
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

// ───────────── tabular detection ─────────────
export interface Detected {
  columns: CustomColumn[];
  dateColumn: string | null; // original header
  dayFirst: boolean;
}

export function detectColumns(headers: string[], sample: Row[]): Detected {
  const seen = new Set<string>();
  const cols: CustomColumn[] = headers.map((h, i) => {
    let key = sanitizeKey(h || `col_${i + 1}`);
    while (seen.has(key)) key += '_';
    seen.add(key);
    return { key, name: h || `Column ${i + 1}`, kind: 'text' as const };
  });
  // day-first heuristic: any first segment >12 → day-first; any second segment >12 → month-first
  let dayFirst = true;
  for (const c of cols) {
    const vals = sample.map((r) => r[c.name]).filter((v) => v != null && v !== '').slice(0, 60);
    if (!vals.length) continue;
    const dateHits = vals.filter((v) => parseDateLoose(v, true) !== null && /\d[/.\-]\d/.test(String(v))).length;
    const numHits = vals.filter((v) => parseNumber(v) !== null).length;
    if (dateHits / vals.length > 0.8 && numHits / vals.length < 0.9) {
      c.kind = 'date';
      for (const v of vals) {
        const m = String(v).match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-]/);
        if (m && Number(m[1]) > 12) dayFirst = true;
        else if (m && Number(m[2]) > 12) dayFirst = false;
      }
    } else if (numHits / vals.length > 0.85) c.kind = 'number';
  }
  const dateCol = cols.find((c) => c.kind === 'date');
  // keep only the first date column as the time axis; demote other dates to text
  for (const c of cols) if (c.kind === 'date' && c !== dateCol) c.kind = 'text';
  return { columns: cols, dateColumn: dateCol?.name ?? null, dayFirst };
}

export function rowsFromCsv(text: string): { headers: string[]; rows: Row[] } {
  const grid = parseCsv(text);
  if (grid.length < 1) return { headers: [], rows: [] };
  const headers = grid[0].map((h) => h.trim());
  const rows: Row[] = grid.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
  return { headers, rows };
}
export function rowsFromJson(json: any): { headers: string[]; rows: Row[] } {
  const arr: any[] = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : Array.isArray(json?.rows) ? json.rows : Array.isArray(json?.results) ? json.results : [];
  const flat = arr.filter((x) => x && typeof x === 'object').map((o) => flatten(o));
  const headers = [...new Set(flat.flatMap((o) => Object.keys(o)))];
  return { headers, rows: flat };
}
function flatten(o: any, prefix = '', out: Row = {}): Row {
  for (const [k, v] of Object.entries(o)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = Array.isArray(v) ? v.join(', ') : (v as any);
  }
  return out;
}

// ───────────── row loading per connector kind ─────────────
const rowCache = new Map<string, { at: number; rows: Row[] }>();
const TTL = 5 * 60 * 1000;

export function sheetUrl(sourceId: string): string {
  const [id, gid] = sourceId.split('|||');
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid || 0}`;
}

export async function loadRows(i: ConnectorContext['integration']): Promise<Row[]> {
  const ck = `${i.id}:${i.slug}:${i.sourceId}`;
  const hit = rowCache.get(ck);
  if (hit && Date.now() - hit.at < TTL) return hit.rows;
  let rows: Row[] = [];
  const headers: Record<string, string> = {};
  const token = i.credentials?.accessToken as string | undefined;
  if (token) headers.Authorization = `Bearer ${token}`;
  for (const [k, v] of Object.entries((i.config.headers as Record<string, string>) ?? {})) headers[k] = v;
  if (i.slug === 'google_sheets') rows = rowsFromCsv(await fetchText(sheetUrl(i.sourceId), { headers })).rows;
  else if (i.slug === 'csv_url') rows = rowsFromCsv(await fetchText(i.sourceId, { headers })).rows;
  else if (i.slug === 'rest_api') rows = rowsFromJson(await fetchJson(i.sourceId, { headers })).rows;
  else {
    const stored = await db.ingestRow.findMany({ where: { integrationId: i.id }, orderBy: { date: 'asc' } });
    rows = stored.map((r) => ({ ...(r.data as Row), __date: r.date }));
  }
  rowCache.set(ck, { at: Date.now(), rows });
  return rows;
}
export const invalidateRows = (id: number) => {
  for (const k of rowCache.keys()) if (k.startsWith(`${id}:`)) rowCache.delete(k);
};

function cfg(i: ConnectorContext['integration']) {
  const columns: CustomColumn[] = i.config.columns ?? [];
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const dateCol = columns.find((c) => c.kind === 'date');
  return { columns, byKey, dateCol, dayFirst: i.config.dayFirst !== false, decimal: (i.config.decimal as 'auto' | 'dot' | 'comma') ?? 'auto' };
}
function rowDate(r: Row, dateCol: CustomColumn | undefined, dayFirst: boolean): string | null {
  if (r.__date) return String(r.__date);
  if (!dateCol) return null;
  return parseDateLoose(r[dateCol.name], dayFirst);
}

export const customConnector: Connector = {
  id: 'custom',

  async daily(ctx, prims, range, _filter): Promise<DailyData> {
    const i = ctx.integration;
    const { byKey, dateCol, dayFirst, decimal } = cfg(i);
    const rows = await loadRows(i);
    const out: DailyData = {};
    for (const d of eachDay(range)) out[d] = Object.fromEntries(prims.map((p) => [p, 0]));
    for (const r of rows) {
      const d = rowDate(r, dateCol, dayFirst);
      if (!d || !out[d]) continue;
      for (const p of prims) {
        if (p === '__rows') out[d][p] += 1;
        else {
          const col = byKey.get(p);
          if (col) out[d][p] += parseNumber(r[col.name], decimal) ?? 0;
        }
      }
    }
    return out;
  },

  async breakdown(ctx, dimension, prims, range, opts): Promise<BreakdownRow[]> {
    const i = ctx.integration;
    const { byKey, dateCol, dayFirst, decimal } = cfg(i);
    const dim = byKey.get(dimension);
    if (!dim) return [];
    const rows = await loadRows(i);
    const groups = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const d = rowDate(r, dateCol, dayFirst);
      if (dateCol || r.__date) {
        if (!d || d < range.start || d > range.end) continue;
      }
      const label = String(r[dim.name] ?? '(empty)') || '(empty)';
      const g = groups.get(label) ?? Object.fromEntries(prims.map((p) => [p, 0]));
      for (const p of prims) {
        if (p === '__rows') g[p] += 1;
        else {
          const col = byKey.get(p);
          if (col) g[p] += parseNumber(r[col.name], decimal) ?? 0;
        }
      }
      groups.set(label, g);
    }
    const sortBy = opts?.sortBy && prims.includes(opts.sortBy) ? opts.sortBy : prims[0];
    const out = [...groups].map(([label, values]) => ({ key: label, label, values })).sort((a, b) => (b.values[sortBy] ?? 0) - (a.values[sortBy] ?? 0));
    return opts?.limit ? out.slice(0, opts.limit) : out;
  },

  async validate(ctx) {
    const i = ctx.integration;
    const rows = await loadRows(i);
    if (!rows.length) {
      if (i.slug === 'webhook_ingest' || ['make', 'n8n', 'zapier', 'pluga'].includes(i.slug)) return { config: { columns: [], dayFirst: true } };
      throw new Error('No rows found — check the URL / sharing settings (Google Sheets must be shared "anyone with the link" or connected with a token).');
    }
    const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((h) => h !== '__date');
    const det = detectColumns(headers, rows.slice(0, 200));
    if (rows.some((r) => r.__date) && !det.dateColumn) det.columns = det.columns.filter((c) => c.kind !== 'date');
    return { config: { columns: det.columns, dayFirst: det.dayFirst, dateColumn: det.dateColumn } };
  },
};
