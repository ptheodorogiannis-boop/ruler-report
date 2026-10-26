import assert from 'node:assert/strict';
import test from 'node:test';
import { ARCHETYPES } from '../src/lib/catalog/archetypes';
import { findWidget, getCatalog, metricNames, toDefinition } from '../src/lib/catalog/build';
import { INTEGRATIONS } from '../src/lib/catalog/integrations';
import { demoConnector } from '../src/lib/connectors/demo';
import { FetchSession, planPrims, resolveWidget, type IntegrationCtx } from '../src/lib/engine/resolve';
import { PLATFORM_TEMPLATES } from '../src/lib/templates/defaults';
import { db } from '../src/lib/db';
import { generateReportData } from '../src/lib/engine/report';
import { addIntegration, makeCompany } from './helpers';

const ctx = (slug: string, id = 7): IntegrationCtx => ({ id, slug, name: 'x', sourceId: 'abc', config: {}, credentials: { demo: true }, currency: 'EUR' });
const range = { start: '2026-09-01', end: '2026-09-30' };

test('catalog: every widget references primitives its archetype defines', () => {
  for (const def of INTEGRATIONS.filter((i) => i.archetype !== 'custom')) {
    const arch = ARCHETYPES[def.archetype];
    assert.ok(arch, `${def.slug}: archetype ${def.archetype} exists`);
    for (const [name, v] of Object.entries(arch.virtual ?? {})) {
      assert.ok(arch.prims[v.num], `${def.archetype}.${name}: numerator ${v.num}`);
      assert.ok(arch.prims[v.den], `${def.archetype}.${name}: denominator ${v.den}`);
    }
    for (const [name, p] of Object.entries(arch.prims)) if (p.of) assert.ok(arch.prims[p.of], `${def.archetype}.${name}: parent ${p.of}`);
    for (const w of getCatalog(def.slug)) {
      for (const m of metricNames(w.calc)) assert.ok(arch.prims[m] || arch.virtual?.[m], `${w.reference_key}: unknown prim ${m}`);
      if (w.calc.kind === 'breakdown' || w.calc.kind === 'chart_breakdown') assert.ok(arch.dims[w.calc.dimension] || arch.namedDims?.[w.calc.dimension], `${w.reference_key}: unknown dimension ${w.calc.dimension}`);
    }
  }
});

test('catalog: reference keys are unique per platform, prefixes are unique across platforms', () => {
  const prefixes = new Set<string>();
  const slugs = new Set<string>();
  for (const d of INTEGRATIONS) {
    assert.ok(!prefixes.has(d.prefix), `duplicate prefix ${d.prefix}`);
    assert.ok(!slugs.has(d.slug), `duplicate slug ${d.slug}`);
    prefixes.add(d.prefix);
    slugs.add(d.slug);
    const keys = getCatalog(d.slug).map((w) => w.reference_key);
    assert.equal(new Set(keys).size, keys.length, `${d.slug} has duplicate keys`);
  }
  const total = INTEGRATIONS.reduce((a, i) => a + getCatalog(i.slug).length, 0);
  assert.ok(total > 800, `catalog size ${total}`);
});

test('catalog: platform variants mirror Reportei (reach_facebook, reach_instagram …) and carry a dimension filter', () => {
  const w = findWidget('facebook_ads', 'reach_instagram')!;
  assert.ok(w);
  const def = toDefinition(w);
  assert.deepEqual(def.dimensions, [{ field: 'publisher_platform', operator: 'IN', value: ['instagram'] }]);
  assert.match(def.id, /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  assert.equal(toDefinition(findWidget('facebook_ads', 'ctr')!).calculated, true);
});

test('templates: every widget a built-in template references exists in the catalog', () => {
  for (const t of PLATFORM_TEMPLATES)
    for (const s of t.sections)
      for (const ref of s.widgets) {
        const w = findWidget(ref.slug, ref.key);
        const custom = INTEGRATIONS.find((i) => i.slug === ref.slug)?.archetype === 'custom';
        if (custom && ['rows', 'rows_by_date'].includes(ref.key)) assert.ok(w, `${t.title}: ${ref.slug}:${ref.key}`);
        else if (!custom) assert.ok(w, `${t.title} → ${ref.slug}:${ref.key} is missing from the catalog`);
      }
});

test('engine: ratios are derived from aggregated primitives, not averaged', async () => {
  const c = ctx('facebook_ads');
  const s = new FetchSession();
  const get = async (key: string) => {
    const v = await resolveWidget({ integration: c, widget: findWidget('facebook_ads', key)!, range, session: s });
    assert.equal(v.type, 'number');
    return (v as any).value as number;
  };
  const [clicks, impr, spend, ctr, cpc, cpm, roas, conv, convVal] = await Promise.all(['clicks', 'impressions', 'spend', 'ctr', 'cpc', 'cpm', 'roas', 'conversions', 'conversion_value'].map(get));
  assert.ok(Math.abs(ctr - (clicks / impr) * 100) < 0.01);
  assert.ok(Math.abs(cpc - spend / clicks) < 0.01);
  assert.ok(Math.abs(cpm - (spend / impr) * 1000) < 0.01);
  assert.ok(Math.abs(roas - convVal / spend) < 0.01);
  assert.ok(conv > 0);
});

test('engine: comparison deltas are correct and demo data is deterministic', async () => {
  const c = ctx('google_analytics_4');
  const w = findWidget('google_analytics_4', 'sessions')!;
  const comparison = { start: '2026-08-01', end: '2026-08-31' };
  const a = await resolveWidget({ integration: c, widget: w, range, comparison, session: new FetchSession() });
  const b = await resolveWidget({ integration: c, widget: w, range, comparison, session: new FetchSession() });
  assert.deepEqual(a, b, 'same inputs → same numbers');
  assert.equal(a.type, 'number');
  const n = a as any;
  assert.ok(Math.abs(n.comparison.change_pct - ((n.value - n.comparison.value) / n.comparison.value) * 100) < 0.02);
  assert.equal(n.comparison.absolute, Math.round((n.value - n.comparison.value) * 10000) / 10000);
  // a different integration id yields different data
  const other = await resolveWidget({ integration: ctx('google_analytics_4', 8), widget: w, range, session: new FetchSession() });
  assert.notEqual((other as any).value, n.value);
});

test('engine: chart shapes — time series length, categorical order, weekly bucketing on long ranges', async () => {
  const c = ctx('facebook_ads');
  const ts = await resolveWidget({ integration: c, widget: findWidget('facebook_ads', 'spend_by_date')!, range, session: new FetchSession() });
  assert.equal(ts.type, 'chart');
  assert.equal((ts as any).labels.length, 30);
  assert.equal((ts as any).series[0].length, 30);
  const hours = await resolveWidget({ integration: c, widget: findWidget('facebook_ads', 'impressions_reach_by_hour')!, range, session: new FetchSession() });
  assert.deepEqual((hours as any).labels.slice(0, 3), ['00h', '01h', '02h']);
  assert.equal((hours as any).labels.length, 24);
  const long = await resolveWidget({ integration: c, widget: findWidget('facebook_ads', 'spend_by_date')!, range: { start: '2026-01-01', end: '2026-08-31' }, session: new FetchSession() });
  assert.ok((long as any).labels.length < 40, 'weekly buckets for ranges over 120 days');
});

test('engine: tables sort by the requested column and compute per-row ratios', async () => {
  const v: any = await resolveWidget({ integration: ctx('facebook_ads'), widget: findWidget('facebook_ads', 'campaigns')!, range, session: new FetchSession() });
  assert.equal(v.type, 'table');
  assert.equal(v.columns[0], 'campaign');
  const si = v.columns.indexOf('spend');
  const spends = v.rows.map((r: any[]) => r[si]);
  assert.deepEqual([...spends].sort((a, b) => b - a), spends, 'sorted by spend desc');
  const ci = v.columns.indexOf('clicks'), ii = v.columns.indexOf('impressions'), ti = v.columns.indexOf('ctr');
  for (const r of v.rows) assert.ok(Math.abs(r[ti] - (r[ci] / r[ii]) * 100) < 0.01, 'row CTR = clicks/impressions');
  assert.equal(v.columnFormats[si], 'currency');
  assert.equal(v.columnFormats[ti], 'percent');
});

test('engine: funnel is monotone for the post-click steps', async () => {
  const v: any = await resolveWidget({ integration: ctx('facebook_ads'), widget: findWidget('facebook_ads', 'funnel')!, range, session: new FetchSession() });
  assert.equal(v.type, 'funnel');
  const vals = v.steps.slice(3).map((s: any) => s.value);
  for (let i = 1; i < vals.length; i++) assert.ok(vals[i] <= vals[i - 1], `step ${i} should not exceed the previous one: ${vals}`);
});

test('engine: stock metrics use the latest day, net growth uses the delta', async () => {
  const c = ctx('instagram_business');
  const followers: any = await resolveWidget({ integration: c, widget: findWidget('instagram_business', 'followers')!, range, session: new FetchSession() });
  const growth: any = await resolveWidget({ integration: c, widget: findWidget('instagram_business', 'follower_growth')!, range, session: new FetchSession() });
  const daily = await demoConnector.daily({ integration: c }, ['followers'], range);
  assert.equal(followers.value, daily['2026-09-30'].followers);
  assert.equal(growth.value, daily['2026-09-30'].followers - daily['2026-09-01'].followers);
});

test('engine: platform-filtered variants add up to roughly the total and never exceed it', async () => {
  const c = ctx('facebook_ads');
  const total: any = await resolveWidget({ integration: c, widget: findWidget('facebook_ads', 'impressions')!, range, session: new FetchSession() });
  let parts = 0;
  for (const p of ['facebook', 'instagram', 'messenger', 'audience_network']) parts += ((await resolveWidget({ integration: c, widget: findWidget('facebook_ads', `impressions_${p}`)!, range, session: new FetchSession() })) as any).value;
  assert.ok(parts > total.value * 0.7 && parts < total.value * 1.3, `${parts} vs ${total.value}`);
});

test('engine: unsupported primitives render a clear error instead of zeros', async () => {
  const c: IntegrationCtx = { ...ctx('woo_commerce'), credentials: { consumerKey: 'k', consumerSecret: 's' } }; // not demo → real Woo connector
  const v: any = await resolveWidget({ integration: c, widget: findWidget('woo_commerce', 'abandoned_carts')!, range, session: new FetchSession() });
  assert.equal(v.type, 'error');
  assert.equal(v.code, 'invalid_metrics_combination');
});

test('engine: provider failures become typed errors, not exceptions', async () => {
  const c: IntegrationCtx = { ...ctx('facebook_ads'), credentials: null as any };
  const v: any = await resolveWidget({ integration: c, widget: findWidget('facebook_ads', 'spend')!, range, session: new FetchSession() });
  assert.equal(v.type, 'error');
  assert.equal(v.code, 'expired_token');
});

test('planPrims expands virtual metrics to their numerator and denominator', () => {
  const p = planPrims('facebook_ads', ['ctr', 'spend']);
  assert.deepEqual(new Set(p.real), new Set(['clicks', 'impressions', 'spend']));
  assert.ok(p.virtual.ctr);
});

test('report generation: sections, blended metric, source statuses', async () => {
  const { company, project } = await makeCompany();
  const fb = await addIntegration(company.id, project.id, 'facebook_ads');
  const g = await addIntegration(company.id, project.id, 'google_adwords');
  const cm = await db.customMetric.create({ data: { companyId: company.id, name: 'Blended ROAS', formula: '({fb_ads:conversion_value} + {gads:conversion_value}) / ({fb_ads:spend} + {gads:spend})', format: 'decimal' } });
  const bad = await db.customMetric.create({ data: { companyId: company.id, name: 'Broken', formula: '{nope:x} + 1' } });
  const data = await generateReportData({
    project,
    integrations: [fb, g],
    sections: [
      { id: 'a', title: 'Ads', widgets: [{ slug: 'facebook_ads', key: 'spend' }, { slug: 'google_adwords', key: 'spend' }, { slug: 'custom', key: `cm_${cm.id}` }, { slug: 'custom', key: `cm_${bad.id}` }, { slug: 'search_console', key: 'clicks' }] },
      { id: 'empty', title: 'Nothing matches', widgets: [{ slug: 'shopify', key: 'revenue' }] },
    ],
    range,
    comparison: { start: '2026-08-01', end: '2026-08-31' },
    customMetrics: [cm, bad],
  });
  assert.deepEqual(data.sections.map((s) => s.id), ['a'], 'sections without matching integrations are dropped');
  const blocks = data.sections[0].blocks;
  assert.equal(blocks.filter((b) => b.slug === 'facebook_ads').length, 1);
  const blended: any = blocks.find((b) => b.widget.label === 'Blended ROAS')!.widget.value;
  const spend = blocks.filter((b) => b.widget.key === 'spend').map((b) => (b.widget.value as any).value as number);
  assert.equal(blended.type, 'number');
  assert.ok(blended.value > 0 && blended.comparison);
  assert.ok(spend.length === 2 && spend.every((x) => x > 0));
  const broken: any = blocks.find((b) => b.widget.label === 'Broken')!.widget.value;
  assert.equal(broken.type, 'error');
  assert.equal(data.sources.length, 2);
  assert.ok(data.sources.every((s) => s.data_status === 'ok'));
});
