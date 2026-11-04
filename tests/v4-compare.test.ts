import assert from 'node:assert/strict';
import test from 'node:test';
import { compareNeeds, comparePeriods, compareValue } from '../src/lib/layout/compare';
import { composeReport, normalizeLayout, storeKey } from '../src/lib/layout/compose';
import { widgetRefs } from '../src/lib/layout/refs';
import type { RenderedBlock } from '../src/lib/engine/types';

const range = { start: '2026-09-01', end: '2026-09-30' };
const comparison = { start: '2026-08-02', end: '2026-08-31' };
const num = (integrationId: number, key: string, value: number | null, prev?: number, extra: Partial<RenderedBlock> = {}): RenderedBlock => ({
  integrationId,
  platform: 'Meta Ads',
  slug: 'facebook_ads',
  account_name: `Account ${integrationId}`,
  widget: { reference_key: `fb:${key}`, key, label: 'Amount spent', format: 'currency', diff_type: 'positive_good', currency: 'EUR', value: { type: 'number', value, ...(prev != null ? { comparison: { value: prev, change_pct: value != null ? Number((((value - prev) / prev) * 100).toFixed(2)) : null, absolute: value != null ? value - prev : null } } : {}) } },
  ...extra,
});

test('comparison periods: this period first, the previous one by default, a year ago and custom periods on request', () => {
  const ref = { integrationId: 7, key: 'spend' };
  assert.deepEqual(comparePeriods({ custom: { ref } }, range, comparison).map((p) => p.token), ['current', 'previous']);
  assert.deepEqual(comparePeriods({ custom: { ref } }, range, comparison)[1].range, comparison, 'the report comparison is the previous period');
  assert.deepEqual(comparePeriods({ custom: { ref } }, range, null)[1].range, { start: '2026-08-02', end: '2026-08-31' }, 'without one, the period before of the same length');
  const all = comparePeriods({ custom: { ref, comparePrevious: false, compareYearAgo: true, comparePeriods: [{ label: 'Spring sale', start: '2026-03-01', end: '2026-03-15' }, { start: '2026-05-10', end: '2026-05-01' }] } }, range, comparison);
  assert.deepEqual(all.map((p) => p.token), ['current', 'yearAgo', 'custom'], 'previous off; a period that ends before it starts is ignored');
  assert.deepEqual(all[1].range, { start: '2025-09-01', end: '2025-09-30' });
  assert.equal(all[2].label, 'Spring sale');
  // what the engine fetches: the base without a period suffix, then each period
  const needs = compareNeeds({ custom: { ref, compareYearAgo: true } }, range, comparison);
  assert.deepEqual(needs.map((n) => n.period), [undefined, comparison, { start: '2025-09-01', end: '2025-09-30' }]);
  assert.deepEqual(compareNeeds({ custom: {} }, range, comparison), [], 'no metric, nothing to fetch');
});

test('comparison values: periods mode measures this period against each column; accounts mode adds a total', () => {
  const ref = { integrationId: 7, key: 'spend' };
  const store = new Map<string, RenderedBlock>([
    [storeKey(7, 'spend'), num(7, 'spend', 1200, 1000)],
    [storeKey(7, 'spend', comparison), num(7, 'spend', 1000)],
    [storeKey(7, 'spend', { start: '2025-09-01', end: '2025-09-30' }), num(7, 'spend', 800)],
  ]);
  const lookup = (r: { integrationId: number; key: string }, p?: { start: string; end: string }) => store.get(storeKey(r.integrationId, r.key, p));
  const v = compareValue({ custom: { ref, compareYearAgo: true } }, lookup, range, comparison);
  assert.equal(v.type, 'compare');
  if (v.type !== 'compare') return;
  assert.equal(v.format, 'currency');
  assert.deepEqual(v.columns.map((c) => c.value), [1200, 1000, 800]);
  assert.equal(v.columns[0].base, true);
  assert.equal(v.columns[1].change_pct, 20, 'this period is 20% above the previous one');
  assert.equal(v.columns[2].change_pct, 50, 'and 50% above a year ago');
  assert.equal(v.columns[2].absolute, 400);
  // a period whose value is missing says so instead of showing a zero
  const missing = compareValue({ custom: { ref, comparePeriods: [{ start: '2026-01-01', end: '2026-01-31' }] } }, lookup, range, comparison);
  if (missing.type === 'compare') assert.ok(missing.columns[2].error && missing.columns[2].value === null);
  // accounts mode
  store.set(storeKey(9, 'spend'), num(9, 'spend', 300, 400));
  const acc = compareValue({ custom: { ref, compareMode: 'accounts', compareRefs: [{ integrationId: 9, key: 'spend' }] } }, lookup, range, comparison);
  if (acc.type !== 'compare') return assert.fail('accounts mode');
  assert.deepEqual(acc.columns.map((c) => c.value), [1200, 300]);
  assert.equal(acc.columns[1].change_pct, -25, "each account's own change against the previous period");
  assert.equal(acc.total, 1500);
  assert.equal(acc.columns[1].label, 'Account 9 · Amount spent');
  // a different unit beside it: its own format, and no total
  store.set(storeKey(11, 'reach'), { ...num(11, 'reach', 5000, 4000), widget: { ...num(11, 'reach', 5000, 4000).widget, key: 'reach', label: 'Reach', format: 'number' } });
  const mixed = compareValue({ custom: { ref, compareMode: 'accounts', compareRefs: [{ integrationId: 11, key: 'reach' }] } }, lookup, range, comparison);
  if (mixed.type !== 'compare') return assert.fail('mixed');
  assert.equal(mixed.columns[1].format, 'number');
  assert.equal(mixed.total, undefined, 'no sum across units');
  assert.equal(compareValue({ custom: {} }, lookup, range, comparison).type, 'error', 'no metric chosen');
});

test('comparison in a layout: validated, its refs join the report, compose renders it from the stored values', () => {
  const base = { id: 'w1', slug: 'compare', key: 'compare', component: 'compare_v1', integrationId: 0, x: 0, y: 0, w: 12, h: 4 };
  const custom = { ref: { integrationId: 7, key: 'spend' }, compareMode: 'periods', compareYearAgo: true, changeAs: 'absolute' };
  const layout = normalizeLayout({ version: 1, blocks: [{ id: 'b1', title: 'Paid', integrationId: 0, slug: 'custom', widgets: [{ ...base, custom }] }] });
  assert.equal(layout.blocks[0].widgets[0].component, 'compare_v1');
  assert.throws(() => normalizeLayout({ version: 1, blocks: [{ id: 'b1', title: 'Paid', integrationId: 0, slug: 'custom', widgets: [{ ...base, custom: { ...custom, comparePeriods: Array.from({ length: 5 }, () => ({ start: '2026-01-01', end: '2026-01-02' })) } }] }] }), 'at most four custom periods');
  assert.throws(() => normalizeLayout({ version: 1, blocks: [{ id: 'b1', title: 'Paid', integrationId: 0, slug: 'custom', widgets: [{ ...base, custom: { ...custom, compareMode: 'campaigns' } }] }] }), 'unknown mode');
  assert.deepEqual(widgetRefs({ slug: 'compare', custom: { ...custom, compareMode: 'accounts', compareRefs: [{ integrationId: 9, key: 'cost' }] } as any }), [{ integrationId: 7, key: 'spend' }, { integrationId: 9, key: 'cost' }]);
  const data = { range, comparison, generated_at: '', sources: [], sections: [], widgets: { [storeKey(7, 'spend')]: num(7, 'spend', 1200, 1000), [storeKey(7, 'spend', comparison)]: num(7, 'spend', 1000), [storeKey(7, 'spend', { start: '2025-09-01', end: '2025-09-30' })]: num(7, 'spend', 900) } } as any;
  const out = composeReport(data, layout, { sources: [], currency: 'EUR', range, comparison });
  const b = out.sections[0].blocks[0];
  assert.equal(b.widget.value.type, 'compare');
  assert.equal(b.widget.currency, 'EUR');
  if (b.widget.value.type === 'compare') assert.deepEqual(b.widget.value.columns.map((c) => c.value), [1200, 1000, 900]);
});
