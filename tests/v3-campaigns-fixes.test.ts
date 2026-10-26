// Plan E review fix pass (.superpowers/sdd/2026-10-22-v3-e-campaign-containers/review.md): C1–C3, I1–I3, I5–I11.
import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../src/lib/db';
import { scopeHash } from '../src/lib/engine/campaigns';
import type { ReportData, RenderedBlock } from '../src/lib/engine/types';
import type { ReportLayout } from '../src/lib/layout/types';
import { addIntegration, makeCompany } from './helpers';

const range = { start: '2026-09-01', end: '2026-09-30' };
const reload = (id: number) => db.report.findUniqueOrThrow({ where: { id }, include: { project: true } });
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const ictx = (meta: { id: number; name: string; sourceId: string }) => ({ id: meta.id, slug: 'facebook_ads', name: meta.name, sourceId: meta.sourceId, config: { currency: 'EUR' }, credentials: { demo: true }, currency: 'EUR' });

/** A report of the default Meta template on a fresh demo account, with its seeded layout cloned for editing. */
async function metaReport(title: string) {
  const { reportView } = await import('../src/lib/layout/service');
  const { createReport } = await import('../src/lib/services/reports');
  const { company, project } = await makeCompany();
  const meta = await addIntegration(company.id, project.id, 'facebook_ads');
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  const created = await createReport({ companyId: company.id, projectId: project.id, kind: 'report', title, start: range.start, end: range.end, templateId: tpl.id, integrationIds: [meta.id] });
  const r = await reload(created.id);
  const layout: ReportLayout = clone((await reportView(r, { includeHidden: true })).layout);
  const block = layout.blocks.find((b) => b.integrationId === meta.id)!;
  return { company, project, meta, r, layout, block, tpl };
}
async function campaignSpend(meta: { id: number; name: string; sourceId: string }, pick: (label: string, id: string) => boolean) {
  const { demoConnector } = await import('../src/lib/connectors/demo');
  const rows = await demoConnector.breakdown({ integration: ictx(meta) }, 'campaign', ['spend'], range);
  return rows.filter((x) => pick(x.label ?? '', x.key)).reduce((t, x) => t + (x.values.spend ?? 0), 0);
}

test('C1: container settings (rows, hidden, sort, status dot) apply at compose time, after the first resolve, without a new store entry', async () => {
  const { reportView, saveLayout } = await import('../src/lib/layout/service');
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { ContainerCard } = await import('../src/components/container-card');
  const { r, layout, block } = await metaReport('C1');
  block.widgets.push({ id: 'ct', slug: 'container', key: 'campaigns', component: 'container_v1', integrationId: 0, x: 0, y: 40, w: 12, h: 4, custom: { metrics: ['spend', 'clicks'], rows: 10 } });
  const first = await saveLayout(r, layout);
  const containerKeys = (d: ReportData) => Object.keys(d.widgets ?? {}).filter((k) => k.includes(':container:'));
  assert.equal(containerKeys(first.data).length, 1);
  const composed = async () => {
    const v = await reportView(await reload(r.id));
    return v.data.sections.find((s) => s.id === block.id)!.blocks.find((b) => b.id === 'ct')!;
  };
  assert.equal(((await composed()).widget.value as any).rows.length, 6, 'the six demo campaigns');
  block.widgets.find((w) => w.id === 'ct')!.custom = { metrics: ['spend', 'clicks'], rows: 2, hiddenCampaigns: ['c1'], sortBy: 'clicks', showStatus: false };
  const second = await saveLayout(await reload(r.id), layout);
  assert.deepEqual(containerKeys(second.data), containerKeys(first.data), 'changing the settings does not re-resolve the table');
  const b = await composed();
  const v = b.widget.value as any;
  assert.equal(v.type, 'container');
  assert.equal(v.rows.length, 2, 'rows applied');
  assert.ok(!v.rows.some((x: any) => x.id === 'c1'), 'hidden campaign dropped');
  assert.ok(v.rows[0].values[1] >= v.rows[1].values[1], 'sorted by clicks');
  assert.equal(v.truncated, 3, 'six campaigns, one hidden, two shown');
  const html = renderToStaticMarkup(createElement(ContainerCard, { b: b as any, fmt: { decimalSeparatorFormat: 'comma_dot' as const }, grid: true }));
  assert.doesNotMatch(html, /ctable-dot/, 'the status dot is off');
});

test('C2: the account default is frozen as "all" too; an editor-added widget survives a later change of the account default', async () => {
  const { reportView, saveLayout } = await import('../src/lib/layout/service');
  const { meta, r, layout, block } = await metaReport('C2');
  const data = r.data as unknown as ReportData;
  assert.deepEqual(data.sources.find((s) => s.integrationId === meta.id)?.campaigns, { mode: 'all' }, 'frozen explicitly, not left undefined');
  block.widgets.push({ id: 'cpm1', slug: 'facebook_ads', key: 'cpm', component: 'number_v1', integrationId: meta.id, x: 0, y: 40, w: 3, h: 2 });
  const first = await saveLayout(r, layout);
  assert.ok(Object.keys(first.data.widgets ?? {}).includes(`${meta.id}:cpm`), 'plain key under the frozen "all"');
  await db.integration.update({ where: { id: meta.id }, data: { config: { currency: 'EUR', campaigns: { mode: 'pick', ids: ['c4'] } } } });
  const second = await saveLayout(await reload(r.id), layout);
  const keys = Object.keys(second.data.widgets ?? {});
  assert.ok(keys.includes(`${meta.id}:cpm`), `the plain value is kept: ${keys.join(', ')}`);
  assert.ok(!keys.some((k) => k.includes('#')), `no scoped re-fetch under a key nobody reads: ${keys.join(', ')}`);
  const view = await reportView(await reload(r.id));
  const cpm = view.data.sections.find((s) => s.id === block.id)!.blocks.find((b) => b.id === 'cpm1')!;
  assert.equal(cpm.widget.value.type, 'number', `composes from the plain key: ${JSON.stringify(cpm.widget.value)}`);
});

test('C3: a template saved from a scoped block seeds the scope back onto the block; a report created from it composes the scoped values', async () => {
  const { seedLayout, layoutToSections } = await import('../src/lib/layout/compose');
  const { reportView, saveLayout, saveAsTemplate } = await import('../src/lib/layout/service');
  const { createReport } = await import('../src/lib/services/reports');
  const { company, project, meta, r, layout, block } = await metaReport('C3');
  const scope = { mode: 'rule' as const, rules: [{ op: 'contains' as const, text: 'brand' }] };
  block.campaigns = scope;
  const sections = layoutToSections(layout);
  assert.deepEqual(sections.find((s) => s.id === block.id)?.campaigns, scope, 'the section carries the block scope');
  const seeded = seedLayout(sections, [{ id: meta.id, slug: 'facebook_ads', name: meta.name }], () => 'number_v1');
  assert.deepEqual(seeded.blocks.find((b) => b.integrationId === meta.id)?.campaigns, scope, 'seedLayout puts it back on the ads block');
  await saveLayout(r, layout);
  const tpl = await saveAsTemplate(await reload(r.id), company.id, { title: 'Scoped template' });
  const created = await createReport({ companyId: company.id, projectId: project.id, kind: 'report', title: 'From the template', start: range.start, end: range.end, templateId: tpl.id, integrationIds: [meta.id] });
  const view = await reportView(await reload(created.id));
  const sec = view.data.sections.find((s) => s.source?.integrationId === meta.id)!;
  assert.ok(sec.blocks.length > 0 && sec.blocks.every((b) => b.widget.value.type !== 'error'), `no Loading…: ${sec.blocks.map((b) => `${b.widget.key}=${b.widget.value.type}`).join(', ')}`);
  const brand = await campaignSpend(meta, (label) => /brand/i.test(label));
  const spend = (sec.blocks.find((b) => b.widget.key === 'spend')!.widget.value as any).value;
  assert.ok(Math.abs(spend - brand) <= 0.05, `scoped spend ${spend} vs the brand campaigns ${brand}`);
  assert.deepEqual(sec.campaignScope?.scope, scope);
});

test('I1: a platform-split KPI keeps its own filter under a campaign scope instead of showing the scoped account total', async () => {
  const { resolveWidget, FetchSession } = await import('../src/lib/engine/resolve');
  const { findWidget } = await import('../src/lib/catalog/build');
  const { company, project } = await makeCompany();
  const meta = await addIntegration(company.id, project.id, 'facebook_ads');
  const c = ictx(meta);
  const spend = findWidget('facebook_ads', 'spend', {})!;
  const ig = findWidget('facebook_ads', 'spend_instagram', {})!;
  assert.ok(ig?.filter, 'the Instagram variant carries a platform filter');
  const session = new FetchSession();
  const ids = ['c1', 'c2'];
  const total = (await resolveWidget({ integration: c, widget: spend, range, session, campaignIds: ids })) as any;
  const scopedIg = (await resolveWidget({ integration: c, widget: ig, range, session, campaignIds: ids })) as any;
  const plainIg = (await resolveWidget({ integration: c, widget: ig, range, session })) as any;
  assert.equal(scopedIg.type, 'number');
  assert.ok(scopedIg.value < total.value, `Instagram slice ${scopedIg.value} < scoped total ${total.value}`);
  assert.ok(scopedIg.value < plainIg.value, `scoped Instagram ${scopedIg.value} < unscoped Instagram ${plainIg.value}`);
});

test('I2: a scoped generation makes as many daily calls as an unscoped one (the scope is part of the fetch plan)', async () => {
  const { generateReportData } = await import('../src/lib/engine/report');
  const { demoConnector } = await import('../src/lib/connectors/demo');
  const { company, project } = await makeCompany();
  const meta = await addIntegration(company.id, project.id, 'facebook_ads');
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  const integrations = [await db.integration.findUniqueOrThrow({ where: { id: meta.id } })];
  const orig = demoConnector.daily;
  let calls = 0;
  (demoConnector as any).daily = (...a: unknown[]) => {
    calls++;
    return (orig as any).apply(demoConnector, a);
  };
  try {
    await generateReportData({ project, integrations, sections: tpl.sections as any, range, comparison: null, customMetrics: [], persistStatus: false });
    const plain = calls;
    calls = 0;
    await generateReportData({ project, integrations, sections: tpl.sections as any, range, comparison: null, customMetrics: [], persistStatus: false, campaignScopes: { [meta.id]: { mode: 'pick', ids: ['c1', 'c2'] } } });
    assert.equal(calls, plain, `scoped ${calls} daily calls vs unscoped ${plain}`);
    assert.ok(plain <= 6, `the template batches into a handful of calls (${plain})`);
  } finally {
    (demoConnector as any).daily = orig;
  }
});

test('I3: Meta totals, daily and breakdown requests carry the campaign filter when a scope is active', async () => {
  const { metaDailyParams, metaTotalsParams, metaBreakdownParams } = await import('../src/lib/connectors/meta');
  const filtering = JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: ['1', '2'] }]);
  assert.equal(metaTotalsParams(range, ['1', '2']).filtering, filtering);
  assert.equal(metaTotalsParams(range).filtering, undefined);
  const both = metaDailyParams(range, { dimension: 'publisher_platform', value: 'instagram' }, ['1', '2']);
  assert.equal(both.breakdowns, 'publisher_platform');
  assert.equal(both.filtering, filtering, 'a platform breakdown and a campaign filter travel together');
  assert.equal(metaBreakdownParams('age', range, ['1', '2'])!.filtering, filtering);
  assert.equal(metaBreakdownParams('age', range)!.filtering, undefined);
});

test('I5: a project-restricted session user cannot list or set the campaigns of another project\'s account', async () => {
  const { match } = await import('../src/lib/api/routes');
  const { principalFor } = await import('./principal');
  const { company, project } = await makeCompany();
  const other = await db.project.create({ data: { companyId: company.id, name: 'Other client' } });
  const hidden = await addIntegration(company.id, other.id, 'facebook_ads');
  const mine = await addIntegration(company.id, project.id, 'facebook_ads');
  const editor = await principalFor(company.id, 'editor', [project.id]);
  const run = async (method: string, path: string, body?: unknown) => {
    const m = match(method, path)!;
    try {
      return { ok: true as const, out: await m.route.fn({ p: editor, query: new URLSearchParams(), params: m.params, body }) };
    } catch (e: any) {
      return { ok: false as const, status: e.status as number };
    }
  };
  assert.deepEqual(await run('GET', `/integrations/${hidden.id}/campaigns`), { ok: false, status: 404 });
  assert.deepEqual(await run('PUT', `/integrations/${hidden.id}`, { campaigns: { mode: 'all' } }), { ok: false, status: 404 });
  assert.equal((await run('GET', `/integrations/${mine.id}/campaigns`)).ok, true, 'the own project stays reachable');
});

test('I6/I7: an explicit "all" on a block is stored as such and overrides a narrowing default; widget keys follow the block\'s effective scope', async () => {
  const { effectiveScope, widgetValueKey, withBlockScope } = await import('../src/lib/layout/compose');
  const { scopeSummary } = await import('../src/lib/engine/campaigns');
  const pick = { mode: 'pick' as const, ids: ['c4'] };
  const data = { range, comparison: null, sections: [], sources: [{ integrationId: 5, source_id: 'x', platform: 'Meta Ads', slug: 'facebook_ads', account_name: 'Acme', currency: 'EUR', data_status: 'ok' as const, campaigns: pick, campaignNames: ['Spring launch'], missingCampaigns: 0 }], generated_at: '2026-10-22T00:00:00Z' } as ReportData;
  const layout: ReportLayout = { version: 1, blocks: [{ id: 'b', title: 'Meta', integrationId: 5, slug: 'facebook_ads', widgets: [{ id: 'w', slug: 'facebook_ads', key: 'spend', component: 'number_v1', integrationId: 5, x: 0, y: 0, w: 3, h: 2 }, { id: 'ct', slug: 'container', key: 'campaigns', component: 'container_v1', integrationId: 0, x: 0, y: 2, w: 12, h: 4, custom: { metrics: ['spend'] } }] }] };
  const b = layout.blocks[0];
  assert.deepEqual(effectiveScope(b, data), pick, 'inherits the frozen default');
  assert.equal(scopeSummary(effectiveScope(b, data)), '1 campaign picked');
  assert.equal(widgetValueKey(b.widgets[0], b, data), `5:spend#${scopeHash(pick)}`);
  assert.match(widgetValueKey(b.widgets[1], b, data)!, /^5:container:[0-9a-f]{8}#[0-9a-f]{8}$/, 'a drawer-added table keys on the block account and scope');
  const all = withBlockScope(layout, 'b', { mode: 'all' });
  assert.deepEqual(all.blocks[0].campaigns, { mode: 'all' }, 'an explicit "all" is kept, not erased to inherit');
  assert.deepEqual(effectiveScope(all.blocks[0], data), { mode: 'all' });
  assert.equal(widgetValueKey(all.blocks[0].widgets[0], all.blocks[0], data), '5:spend', 'plain key under an explicit "all"');
  assert.equal(withBlockScope(layout, 'b', undefined).blocks[0].campaigns, undefined, 'undefined clears the override');
  assert.equal(effectiveScope({ ...b, slug: 'google_analytics_4' }, data), undefined, 'non-ads blocks have no scope');
});

test('I8: refs to the block\'s own account inside a scoped block take the block scope; non-campaign breakdowns are narrowed by the connector', async () => {
  const { reportView, saveLayout } = await import('../src/lib/layout/service');
  const { demoConnector } = await import('../src/lib/connectors/demo');
  const { meta, r, layout, block } = await metaReport('I8');
  const scope = { mode: 'pick' as const, ids: ['c1', 'c2'] };
  block.campaigns = scope;
  block.widgets.push({ id: 'cc', slug: 'custom_chart', key: 'chart', component: 'custom_chart_v1', integrationId: 0, x: 0, y: 40, w: 12, h: 4, custom: { series: [{ integrationId: meta.id, key: 'spend_by_date' }] } });
  const saved = await saveLayout(r, layout);
  const keys = Object.keys(saved.data.widgets ?? {});
  assert.ok(keys.includes(`${meta.id}:spend_by_date#${scopeHash(scope)}`), `the ref is resolved under the block scope: ${keys.join(', ')}`);
  const view = await reportView(await reload(r.id));
  const cc = view.data.sections.find((s) => s.id === block.id)!.blocks.find((b) => b.id === 'cc')!;
  assert.equal(cc.widget.value.type, 'chart', JSON.stringify(cc.widget.value).slice(0, 160));
  const sum = (cc.widget.value as any).series[0].reduce((t: number, v: number | null) => t + (v ?? 0), 0);
  const scoped = await campaignSpend(meta, (_l, id) => scope.ids.includes(id));
  assert.ok(Math.abs(sum - scoped) <= 0.5, `chart sums to the scoped spend: ${sum} vs ${scoped}`);
  // a non-campaign breakdown under a scope is the scoped share of every row
  const ctx = { integration: ictx(meta) };
  const plain = await demoConnector.breakdown(ctx, 'age', ['spend'], range);
  const narrowed = await demoConnector.breakdown(ctx, 'age', ['spend'], range, { campaignIds: ['c1'] });
  const total = await campaignSpend(meta, () => true);
  const share = (await campaignSpend(meta, (_l, id) => id === 'c1')) / total;
  const top = plain.reduce((a, b) => ((b.values.spend ?? 0) > (a.values.spend ?? 0) ? b : a));
  const row = narrowed.find((x) => x.key === top.key)!;
  assert.ok(row && Math.abs(row.values.spend / top.values.spend - share) < 0.02, `age row scaled by the c1 share ${share.toFixed(3)}: ${row?.values.spend} / ${top.values.spend}`);
});

test('I9: a scope that matches nothing is "no data", not a sync failure', async () => {
  const { generateReportData } = await import('../src/lib/engine/report');
  const { company, project } = await makeCompany();
  const meta = await addIntegration(company.id, project.id, 'facebook_ads');
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  const integrations = [await db.integration.findUniqueOrThrow({ where: { id: meta.id } })];
  const data = await generateReportData({ project, integrations, sections: tpl.sections as any, range, comparison: null, customMetrics: [], persistStatus: true, campaignScopes: { [meta.id]: { mode: 'rule', rules: [{ op: 'contains', text: 'nothing-matches' }] } } });
  const src = data.sources.find((s) => s.integrationId === meta.id)!;
  assert.equal(src.data_status, 'no_data');
  assert.equal(src.error, undefined);
  assert.equal((await db.integration.findUniqueOrThrow({ where: { id: meta.id } })).lastError, null, 'nothing written to lastError');
});

test('I10: scope messages per mode; an unresolved pick never prints raw ids in the data note; plural wording', async () => {
  const { resolveScope, noCampaign } = await import('../src/lib/engine/report');
  const { campaignNotes } = await import('../src/components/data-note');
  const list = [{ id: 'c1', name: 'Brand search', status: 'active' as const }];
  const ok = { getCampaigns: async () => list } as any;
  const failing = { getCampaigns: async () => { throw new Error('boom'); } } as any;
  const ctx = { id: 1, slug: 'facebook_ads' } as any;
  const gone = await resolveScope(ctx, { mode: 'pick', ids: ['zzz'] }, ok);
  assert.equal(gone.empty, true);
  assert.match(noCampaign(gone).message, /None of the selected campaigns exists any more/);
  const rule = await resolveScope(ctx, { mode: 'rule', rules: [{ op: 'contains', text: 'x' }] }, ok);
  assert.match(noCampaign(rule).message, /No campaign matches the rule/);
  const unresolved = await resolveScope(ctx, { mode: 'pick', ids: ['c1', 'c2'] }, failing);
  assert.deepEqual(unresolved.ids, ['c1', 'c2'], 'a pick still applies by id');
  assert.deepEqual(campaignNotes(unresolved.info), ['Campaigns: 2 selected (names unavailable).']);
  assert.deepEqual(campaignNotes({ scope: { mode: 'pick', ids: ['a', 'b', 'c'] }, names: ['A'], missing: 2 }), ['Campaigns: A.', '2 selected campaigns no longer exist.']);
});

test('I11: a campaign table on an account without campaigns says so (pinned Review Focus item)', async () => {
  const { ensureWidgetValues } = await import('../src/lib/engine/report');
  const { company, project } = await makeCompany();
  const ga = await addIntegration(company.id, project.id, 'google_analytics_4');
  const integrations = [await db.integration.findUniqueOrThrow({ where: { id: ga.id } })];
  const layout = { version: 1, blocks: [{ id: 'g', title: 'GA4', integrationId: ga.id, slug: 'google_analytics_4', widgets: [{ id: 'ct', slug: 'container', key: 'campaigns', component: 'container_v1', integrationId: 0, x: 0, y: 0, w: 12, h: 4, custom: { metrics: ['sessions'] } }] }] } as ReportLayout;
  const data = { range, comparison: null, sections: [], sources: [], generated_at: new Date().toISOString() } as ReportData;
  const out = await ensureWidgetValues({ layout, data, project, integrations, customMetrics: [], range, comparison: null });
  const v = Object.values(out.data.widgets ?? {})[0] as RenderedBlock | undefined;
  assert.equal(v?.widget.value.type, 'error');
  assert.match((v!.widget.value as any).message, /This account has no campaigns/);
});
