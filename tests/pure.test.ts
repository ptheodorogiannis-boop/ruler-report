import assert from 'node:assert/strict';
import test from 'node:test';
import { evalFormula, formulaRefs, parseFormula } from '../src/lib/engine/formula';
import { addDays, diffDays, eachDay, presetRange, previousPeriod, previousYear, rangeLength } from '../src/lib/util/dates';
import { detectColumns, parseCsv, parseDateLoose, parseNumber, rowsFromCsv, rowsFromJson } from '../src/lib/connectors/custom';
import { fmtNumber, formatValue } from '../src/lib/util/format';
import { detectAnomaly } from '../src/lib/services/anomaly';
import { sanitizeHtml, textToHtml } from '../src/lib/util/sanitize';
import { decryptJson, encryptJson, hmac, safeEqual } from '../src/lib/crypto';
import { reportToCsv } from '../src/lib/services/export';

test('formula: precedence, refs, functions, division by zero', () => {
  const look = (m: Record<string, number>) => (k: string) => (k in m ? m[k] : null);
  assert.equal(evalFormula('1 + 2 * 3', look({})), 7);
  assert.equal(evalFormula('({a:x} + {b:y}) / ({a:z} + {b:w})', look({ 'a:x': 100, 'b:y': 50, 'a:z': 20, 'b:w': 10 })), 5);
  assert.equal(evalFormula('{a:x} / {a:z}', look({ 'a:x': 5, 'a:z': 0 })), 0, 'division by zero is 0, not Infinity');
  assert.equal(evalFormula('-{a:x} + max(1, 2, 3)', look({ 'a:x': 1 })), 2);
  assert.equal(evalFormula('round(avg(1,2,4))', look({})), 2);
  assert.equal(evalFormula('{missing}', look({})), null);
  assert.deepEqual(formulaRefs('{a:x} + {b:y} * {a:x}').sort(), ['a:x', 'b:y']);
  assert.throws(() => parseFormula('1 +'));
  assert.throws(() => parseFormula('1 + (2'));
  assert.throws(() => evalFormula('evil(1)', () => 1));
  // no code execution path
  assert.throws(() => parseFormula('process.exit()'));
});

test('dates: ranges, previous period/year, presets', () => {
  assert.equal(addDays('2026-02-27', 3), '2026-03-02');
  assert.equal(diffDays('2026-01-01', '2026-01-31'), 30);
  assert.deepEqual(eachDay({ start: '2026-09-29', end: '2026-10-02' }), ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  const r = { start: '2026-09-01', end: '2026-09-30' };
  assert.equal(rangeLength(r), 30);
  assert.deepEqual(previousPeriod(r), { start: '2026-08-02', end: '2026-08-31' });
  assert.deepEqual(previousYear(r), { start: '2025-09-01', end: '2025-09-30' });
  assert.deepEqual(presetRange('previous_month', 'UTC', '2026-10-19'), { start: '2026-09-01', end: '2026-09-30' });
  assert.deepEqual(presetRange('last_7d', 'UTC', '2026-10-19'), { start: '2026-10-12', end: '2026-10-18' });
  assert.deepEqual(presetRange('this_quarter', 'UTC', '2026-11-05'), { start: '2026-10-01', end: '2026-11-05' });
  assert.deepEqual(presetRange('previous_month', 'UTC', '2026-01-10'), { start: '2025-12-01', end: '2025-12-31' });
});

test('csv parser handles quotes, embedded newlines, delimiters and BOM', () => {
  const g = parseCsv('﻿name,note\n"Smith, J","He said ""hi""\nline2"\nplain,x\n');
  assert.deepEqual(g, [['name', 'note'], ['Smith, J', 'He said "hi"\nline2'], ['plain', 'x']]);
  assert.deepEqual(parseCsv('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
});

test('number parsing: EU/US formats, currency, negatives', () => {
  assert.equal(parseNumber('1.234,56'), 1234.56);
  assert.equal(parseNumber('1,234.56'), 1234.56);
  assert.equal(parseNumber('€ 1.200'), 1200, 'one separator + exactly 3 digits reads as thousands');
  assert.equal(parseNumber('0.125'), 0.125);
  assert.equal(parseNumber('3.5'), 3.5);
  assert.equal(parseNumber('12,5'), 12.5);
  assert.equal(parseNumber('(45.5)'), -45.5);
  assert.equal(parseNumber('12%'), 12);
  assert.equal(parseNumber('abc'), null);
  assert.equal(parseNumber('', 'auto'), null);
  assert.equal(parseNumber('1.234', 'comma'), 1234);
  assert.equal(parseNumber('1,234', 'dot'), 1234);
});

test('date parsing and column detection', () => {
  assert.equal(parseDateLoose('2026-10-05'), '2026-10-05');
  assert.equal(parseDateLoose('05/10/2026', true), '2026-10-05');
  assert.equal(parseDateLoose('05/10/2026', false), '2026-05-10');
  assert.equal(parseDateLoose('31.12.2026'), '2026-12-31');
  assert.equal(parseDateLoose('nonsense'), null);
  const { headers, rows } = rowsFromCsv('Date,Source,Leads,Cost\n13/10/2026,Meta,4,"1.234,50"\n14/10/2026,Google,2,"980,00"\n15/10/2026,Meta,6,"1.100,00"\n');
  const d = detectColumns(headers, rows);
  assert.equal(d.dateColumn, 'Date');
  assert.equal(d.dayFirst, true);
  assert.deepEqual(d.columns.map((c) => c.kind), ['date', 'text', 'number', 'number']);
  const j = rowsFromJson({ data: [{ a: 1, nested: { b: 2 } }, { a: 3, nested: { b: 4 } }] });
  assert.deepEqual(j.headers.sort(), ['a', 'nested.b']);
});

test('number formatting respects locale preference', () => {
  assert.equal(fmtNumber(1234567.891, 2, { decimalSeparatorFormat: 'comma_dot' }), '1,234,567.89');
  assert.equal(fmtNumber(1234567.891, 2, { decimalSeparatorFormat: 'dot_comma' }), '1.234.567,89');
  assert.equal(formatValue(0.1234, 'percent', { decimalSeparatorFormat: 'dot_comma' }), '0,12%');
  assert.equal(formatValue(null, 'number'), '—');
  assert.equal(formatValue(75, 'duration'), '1m 15s');
  assert.equal(formatValue(12.5, 'currency', { currency: 'USD' }), '$12.50');
  assert.equal(formatValue(-3, 'number'), '-3');
});

test('anomaly detection flags spikes and drops, ignores noise and tiny series', () => {
  const base = Array.from({ length: 14 }, (_, i) => 100 + (i % 3));
  assert.equal(detectAnomaly([...base, 101]), null);
  const drop = detectAnomaly([...base, 40]);
  assert.equal(drop?.direction, 'drop');
  assert.ok(drop!.pctVsMean < -50);
  assert.equal(detectAnomaly([...base, 300])?.direction, 'spike');
  assert.equal(detectAnomaly([1, 2, 3]), null);
  assert.equal(detectAnomaly(Array(15).fill(2)), null, 'tiny volumes never alarm');
  assert.equal(detectAnomaly([...Array(14).fill(50), 50]), null, 'zero variance never alarms');
});

test('sanitizer strips scripts, handlers and bad urls but keeps formatting', () => {
  const dirty = '<h3>Hi</h3><script>alert(1)</script><p onclick="x()">a <strong>b</strong> <a href="javascript:alert(1)">c</a> <a href="https://ok.com" onclick="y()">d</a></p><img src=x onerror=alert(1)><iframe src="//evil"></iframe>';
  const clean = sanitizeHtml(dirty);
  assert.ok(!/script|onclick|onerror|iframe|javascript:|<img/i.test(clean), clean);
  assert.ok(clean.includes('<strong>b</strong>'));
  assert.ok(clean.includes('href="https://ok.com"'));
  assert.equal(textToHtml('a < b\n\nsecond'), '<p>a &lt; b</p><p>second</p>');
});

test('crypto: encryption round-trips, tampering fails, HMAC compares in constant time', () => {
  const blob = encryptJson({ token: 'secret', n: 1 });
  assert.deepEqual(decryptJson(blob), { token: 'secret', n: 1 });
  const bad = Buffer.from(blob, 'base64');
  bad[bad.length - 1] ^= 1;
  assert.equal(decryptJson(bad.toString('base64')), null);
  assert.equal(decryptJson('garbage'), null);
  assert.ok(safeEqual(hmac('k', 'body'), hmac('k', 'body')));
  assert.ok(!safeEqual(hmac('k', 'body'), hmac('k', 'bodY')));
});

test('csv export flattens every widget type', () => {
  const csv = reportToCsv({
    range: { start: '2026-01-01', end: '2026-01-31' },
    comparison: null,
    generated_at: '',
    sources: [],
    sections: [
      {
        id: 's',
        title: 'Sec',
        blocks: [
          { integrationId: 1, platform: 'P', slug: 'x', account_name: 'A,1', widget: { reference_key: 'x:a', key: 'a', label: 'Num', format: 'number', diff_type: 'neutral', value: { type: 'number', value: 5, comparison: { value: 4, change_pct: 25, absolute: 1 } } } },
          { integrationId: 1, platform: 'P', slug: 'x', account_name: 'A', widget: { reference_key: 'x:b', key: 'b', label: 'Tbl', format: 'number', diff_type: 'neutral', value: { type: 'table', columns: ['n', 'v'], columnLabels: ['N', 'V'], columnFormats: ['text', 'number'], rows: [['r1', 9]], total_rows: 1 } } },
          { integrationId: 1, platform: 'P', slug: 'x', account_name: 'A', widget: { reference_key: 'x:c', key: 'c', label: 'Ch', format: 'number', diff_type: 'neutral', value: { type: 'chart', labels: ['d1', 'd2'], series: [[1, 2]], seriesLabels: ['S'] } } },
        ],
      },
    ],
  });
  const lines = csv.split('\n');
  assert.equal(lines.length, 1 + 1 + 1 + 2);
  assert.ok(lines[1].includes('"A,1"'), 'commas are quoted');
  assert.ok(lines[2].startsWith('Sec,P,A,Tbl,table,r1 · V,9'));
});

test('column keys keep non-Latin headers (Greek market) distinct instead of collapsing to "col"', async () => {
  const { sanitizeKey } = await import('../src/lib/catalog/build');
  assert.equal(sanitizeKey('Κόστος'), 'κοστος');
  assert.equal(sanitizeKey('Leads (Total) – 2026'), 'leads_total_2026');
  assert.equal(sanitizeKey('stats.signups'), 'stats_signups');
  assert.equal(sanitizeKey('€€€'), 'col');
  const d = detectColumns(['Ημερομηνία', 'Κόστος', 'Κλήσεις'], [{ Ημερομηνία: '2026-09-01', Κόστος: '12,5', Κλήσεις: '3' }]);
  assert.deepEqual(d.columns.map((c) => c.key), ['ημερομηνια', 'κοστος', 'κλησεις']);
});
