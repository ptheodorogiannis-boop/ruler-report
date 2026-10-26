// Plan E: campaign scope, connectors, container widget, wizard.
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Campaign } from '../src/lib/engine/types';
import { applyScope, scopeHash, scopeIds, scopeLabel, scopeSchema, type CampaignScope } from '../src/lib/engine/campaigns';
import { ADS_CATEGORY, isAdsSlug } from '../src/lib/catalog/integrations';
import { db } from '../src/lib/db';
import { listRoutes } from '../src/lib/api/routes';
import type { ReportData } from '../src/lib/engine/types';
import type { ReportLayout } from '../src/lib/layout/types';
import { addIntegration, api, makeCompany } from './helpers';

const camps: Campaign[] = [
  { id: 'c1', name: 'Brand search', status: 'active' },
  { id: 'c2', name: 'Prospecting – video', status: 'active' },
  { id: 'c3', name: 'Retargeting – catalog', status: 'active' },
  { id: 'c4', name: 'Spring launch', status: 'paused' },
  { id: 'c5', name: 'Always-on – leads', status: 'active' },
  { id: 'c6', name: 'Test – brand lift', status: 'other' },
];

test('applyScope: all/undefined keep the input; pick keeps the listed order and drops unknown ids; rules are case-insensitive and ANDed', () => {
  assert.deepEqual(applyScope(camps, undefined), camps);
  assert.deepEqual(applyScope(camps, { mode: 'all' }), camps);
  assert.deepEqual(applyScope(camps, { mode: 'pick', ids: ['c3', 'zzz', 'c1'] }).map((c) => c.id), ['c3', 'c1']);
  assert.deepEqual(applyScope(camps, { mode: 'rule', rules: [{ op: 'contains', text: 'BRAND' }, { op: 'not_contains', text: 'test' }] }).map((c) => c.id), ['c1']);
  assert.deepEqual(applyScope(camps, { mode: 'rule', rules: [{ op: 'contains', text: 'nothing-matches' }] }), []);
});

test('scopeIds, scopeHash and scopeLabel', () => {
  assert.equal(scopeIds(undefined, camps), undefined);
  assert.equal(scopeIds({ mode: 'all' }, camps), undefined);
  assert.deepEqual(scopeIds({ mode: 'pick', ids: ['c2'] }, camps), ['c2']);
  assert.deepEqual(scopeIds({ mode: 'rule', rules: [{ op: 'contains', text: 'launch' }] }, camps), ['c4']);
  assert.equal(scopeHash(undefined), '');
  assert.equal(scopeHash({ mode: 'all' }), '');
  const h = scopeHash({ mode: 'pick', ids: ['c1', 'c2'] });
  assert.match(h, /^[0-9a-f]{8}$/);
  assert.equal(h, scopeHash({ mode: 'pick', ids: ['c1', 'c2'] }), 'stable');
  assert.notEqual(h, scopeHash({ mode: 'pick', ids: ['c2'] }));
  assert.equal(scopeLabel(undefined, camps), 'All campaigns');
  assert.equal(scopeLabel({ mode: 'pick', ids: ['c1', 'c4', 'zzz'] }, camps), '2 campaigns: Brand search, Spring launch');
  assert.equal(scopeLabel({ mode: 'rule', rules: [{ op: 'contains', text: 'brand' }] }, camps), 'Name contains "brand"');
  assert.equal(scopeLabel({ mode: 'rule', rules: [{ op: 'contains', text: 'brand' }, { op: 'not_contains', text: 'test' }] }, camps), 'Name contains "brand" and does not contain "test"');
});

test('scopeSchema: rejects an empty pick, an empty rule text and unknown ops; ADS_CATEGORY matches the catalog', () => {
  assert.equal(scopeSchema.safeParse({ mode: 'all' }).success, true);
  assert.equal(scopeSchema.safeParse({ mode: 'pick', ids: [] }).success, false);
  assert.equal(scopeSchema.safeParse({ mode: 'pick', ids: ['c1'] }).success, true);
  assert.equal(scopeSchema.safeParse({ mode: 'rule', rules: [{ op: 'contains', text: '' }] }).success, false);
  assert.equal(scopeSchema.safeParse({ mode: 'rule', rules: [{ op: 'starts', text: 'x' }] }).success, false);
  assert.equal(scopeSchema.safeParse({ mode: 'rule', rules: [{ op: 'not_contains', text: 'test' }] }).success, true);
  assert.equal(ADS_CATEGORY, 'ads');
  assert.equal(isAdsSlug('facebook_ads'), true);
  assert.equal(isAdsSlug('google_adwords'), true);
  assert.equal(isAdsSlug('google_analytics_4'), false);
  assert.equal(isAdsSlug('nope'), false);
  const s: CampaignScope = { mode: 'pick', ids: ['c1'] };
  assert.equal(s.mode, 'pick');
});

test('Meta connector: daily params carry a campaign.id IN filter, campaign rows are keyed by id, statuses map', async () => {
  const { metaDailyParams, metaCampaignRows, metaCampaignStatus } = await import('../src/lib/connectors/meta');
  const range = { start: '2026-09-01', end: '2026-09-30' };
  const plain = metaDailyParams(range);
  assert.equal(plain.time_increment, '1');
  assert.equal(plain.level, 'account');
  assert.equal(plain.filtering, undefined);
  assert.equal(plain.breakdowns, undefined);
  const scoped = metaDailyParams(range, { dimension: 'campaign', value: ['1', '2'] });
  assert.deepEqual(JSON.parse(scoped.filtering!), [{ field: 'campaign.id', operator: 'IN', value: ['1', '2'] }]);
  assert.equal(scoped.level, 'account');
  assert.equal(scoped.breakdowns, undefined);
  assert.deepEqual(JSON.parse(metaDailyParams(range, { dimension: 'campaign', value: '7' }).filtering!), [{ field: 'campaign.id', operator: 'IN', value: ['7'] }]);
  assert.equal(metaDailyParams(range, { dimension: 'publisher_platform', value: 'instagram' }).breakdowns, 'publisher_platform');
  const rows = metaCampaignRows([{ campaign_id: '1', campaign_name: 'A', spend: '10.5', impressions: '100' }, { campaign_id: '2', campaign_name: 'B', spend: '2', impressions: '50' }], ['spend', 'impressions']);
  assert.deepEqual(rows.map((r) => [r.key, r.label, r.values.spend, r.values.impressions]), [['1', 'A', 10.5, 100], ['2', 'B', 2, 50]]);
  assert.deepEqual(['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED'].map(metaCampaignStatus), ['active', 'paused', 'other', 'other']);
});

test('demo connector: six fixed campaigns per ads account; filtered daily values sum to the unfiltered ones; the campaign breakdown is keyed by id', async () => {
  const { demoConnector, demoCampaigns } = await import('../src/lib/connectors/demo');
  const list = demoCampaigns(1);
  assert.deepEqual(list.map((c) => c.id), ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
  assert.deepEqual(list.map((c) => c.name), ['Brand search', 'Prospecting – video', 'Retargeting – catalog', 'Spring launch', 'Always-on – leads', 'Promo weekend']);
  assert.deepEqual(list.map((c) => c.status), ['active', 'active', 'active', 'paused', 'active', 'other']);
  const ctx = { integration: { id: 1, slug: 'facebook_ads', name: 'x', sourceId: 'act_1', config: {}, credentials: { demo: true } } };
  assert.deepEqual(await demoConnector.listCampaigns!(ctx), list);
  const range = { start: '2026-09-01', end: '2026-09-07' };
  const prims = ['spend', 'clicks'];
  const all = await demoConnector.daily(ctx, prims, range);
  const perCampaign = await Promise.all(list.map((c) => demoConnector.daily(ctx, prims, range, { dimension: 'campaign', value: c.id })));
  for (const date of Object.keys(all)) {
    for (const p of prims) {
      const sum = perCampaign.reduce((t, d) => t + (d[date]?.[p] ?? 0), 0);
      assert.ok(Math.abs(sum - all[date][p]) <= 0.5 + 0.001 * all[date][p], `${date} ${p}: ${sum} vs ${all[date][p]}`);
    }
  }
  const two = await demoConnector.daily(ctx, prims, range, { dimension: 'campaign', value: ['c1', 'c2'] });
  const d0 = Object.keys(all)[0];
  assert.ok(Math.abs(two[d0].spend - (perCampaign[0][d0].spend + perCampaign[1][d0].spend)) <= 0.02, 'an id list sums exactly the chosen campaigns');
  const rows = await demoConnector.breakdown(ctx, 'campaign', prims, range);
  assert.deepEqual(rows.map((r) => r.key).sort(), ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
  assert.equal(rows.find((r) => r.key === 'c1')?.label, 'Brand search');
  const total = Object.values(all).reduce((t, d) => t + d.spend, 0);
  const rowSum = rows.reduce((t, r) => t + (r.values.spend ?? 0), 0);
  assert.ok(Math.abs(rowSum - total) <= 1 + 0.001 * total, `breakdown spend ${rowSum} vs daily total ${total}`);
  assert.deepEqual(await demoConnector.daily(ctx, prims, range, { dimension: 'campaign', value: 'zzz' }), Object.fromEntries(Object.keys(all).map((d) => [d, { spend: 0, clicks: 0 }])), 'an unknown id yields zeros');
});

test('campaigns API: GET /integrations/:id/campaigns lists the account campaigns; PUT stores a valid scope in config.campaigns and rejects an invalid one', async () => {
  const { company, project, token } = await makeCompany();
  const meta = await addIntegration(company.id, project.id, 'facebook_ads');
  const ga = await addIntegration(company.id, project.id, 'google_analytics_4');
  const list = await api(token, 'GET', `/integrations/${meta.id}/campaigns`);
  assert.equal(list.status, 200, JSON.stringify(list.json));
  assert.equal(list.json.data.length, 6);
  assert.deepEqual(list.json.data[0], { id: 'c1', name: 'Brand search', status: 'active' });
  assert.deepEqual((await api(token, 'GET', `/integrations/${ga.id}/campaigns`)).json.data, [], 'non-ads accounts have none');
  const put = await api(token, 'PUT', `/integrations/${meta.id}`, { campaigns: { mode: 'pick', ids: ['c1', 'c3'] } });
  assert.equal(put.status, 200, JSON.stringify(put.json));
  assert.deepEqual(put.json.data.campaigns, { mode: 'pick', ids: ['c1', 'c3'] });
  assert.deepEqual(((await db.integration.findUniqueOrThrow({ where: { id: meta.id } })).config as any).campaigns, { mode: 'pick', ids: ['c1', 'c3'] });
  assert.equal((await api(token, 'PUT', `/integrations/${meta.id}`, { campaigns: { mode: 'pick', ids: [] } })).status, 422);
  assert.equal((await api(token, 'PUT', `/integrations/${meta.id}`, { campaigns: { mode: 'all' } })).status, 200);
  assert.equal(((await db.integration.findUniqueOrThrow({ where: { id: meta.id } })).config as any).campaigns?.mode, 'all');
  assert.ok(listRoutes().some((r) => r.method === 'GET' && r.path === '/integrations/:id/campaigns'));
  const other = await makeCompany('Other');
  assert.equal((await api(other.token, 'GET', `/integrations/${meta.id}/campaigns`)).status, 404, 'another company cannot list them');
});

test('scope in generation and the store: block scopes sum exactly their campaigns, keys carry the scope hash, sections record names and missing ids, an empty rule errors, two scopes of one account stay apart, the account default is frozen into the sources', async () => {
  const { reportView, saveLayout } = await import('../src/lib/layout/service');
  const { createReport } = await import('../src/lib/services/reports');
  const { demoConnector } = await import('../src/lib/connectors/demo');
  const { company, project } = await makeCompany();
  const meta = await addIntegration(company.id, project.id, 'facebook_ads');
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  const range = { start: '2026-09-01', end: '2026-09-30' };
  const ctx = { integration: { id: meta.id, slug: 'facebook_ads', name: meta.name, sourceId: meta.sourceId, config: { currency: 'EUR' }, credentials: { demo: true } } };
  const rows = await demoConnector.breakdown(ctx, 'campaign', ['spend'], range);
  const spendOf = (ids: string[]) => rows.filter((r) => ids.includes(r.key)).reduce((t, r) => t + (r.values.spend ?? 0), 0);
  const reload = (id: number) => db.report.findUniqueOrThrow({ where: { id }, include: { project: true } });
  const created = await createReport({ companyId: company.id, projectId: project.id, kind: 'report', title: 'Scoped', start: range.start, end: range.end, templateId: tpl.id, integrationIds: [meta.id] });
  let r = await reload(created.id);
  const layout: ReportLayout = JSON.parse(JSON.stringify((await reportView(r, { includeHidden: true })).layout));
  const block = layout.blocks.find((b) => b.integrationId === meta.id)!;
  assert.ok(block.widgets.some((w) => w.key === 'spend'), 'the template has a spend KPI');
  block.campaigns = { mode: 'pick', ids: ['c1', 'c2'] };
  const second = { ...JSON.parse(JSON.stringify(block)), id: 'meta2', title: 'Meta (c3)', campaigns: { mode: 'pick', ids: ['c3'] }, widgets: block.widgets.map((w, i) => ({ ...w, id: `m2w${i}` })) };
  layout.blocks.push(second);
  const saved = await saveLayout(r, layout);
  const keys = Object.keys(saved.data.widgets ?? {});
  assert.ok(keys.includes(`${meta.id}:spend#${scopeHash({ mode: 'pick', ids: ['c1', 'c2'] })}`), `scoped key stored: ${keys.join(', ')}`);
  assert.ok(keys.includes(`${meta.id}:spend#${scopeHash({ mode: 'pick', ids: ['c3'] })}`), 'the second scope has its own key');
  assert.ok(saved.data.sections.flatMap((s) => s.blocks).some((b) => b.integrationId === meta.id && b.widget.key === 'spend' && b.widget.value.type === 'number'), 'the unscoped template value stays in the sections');
  r = await reload(created.id);
  let view = await reportView(r);
  const num = (sid: string) => {
    const s = view.data.sections.find((x) => x.id === sid)!;
    const v = s.blocks.find((b) => b.widget.key === 'spend')!.widget.value as any;
    return { v: v.value as number, s };
  };
  const one = num(block.id);
  const two = num('meta2');
  assert.ok(Math.abs(one.v - spendOf(['c1', 'c2'])) <= 0.05, `block 1 spend ${one.v} vs ${spendOf(['c1', 'c2'])}`);
  assert.ok(Math.abs(two.v - spendOf(['c3'])) <= 0.05, `block 2 spend ${two.v} vs ${spendOf(['c3'])}`);
  assert.deepEqual(one.s.campaignScope, { scope: { mode: 'pick', ids: ['c1', 'c2'] }, names: ['Brand search', 'Prospecting – video'], missing: 0 });
  // a picked id that no longer exists is counted; the rest still applies
  block.campaigns = { mode: 'pick', ids: ['c1', 'zzz'] };
  await saveLayout(r, layout);
  r = await reload(created.id);
  view = await reportView(r);
  const miss = num(block.id);
  assert.ok(Math.abs(miss.v - spendOf(['c1'])) <= 0.05, 'the known id still applies');
  assert.deepEqual(miss.s.campaignScope, { scope: { mode: 'pick', ids: ['c1', 'zzz'] }, names: ['Brand search'], missing: 1 });
  // a rule that matches nothing: every widget of the block says so
  block.campaigns = { mode: 'rule', rules: [{ op: 'contains', text: 'nothing-matches' }] };
  await saveLayout(r, layout);
  r = await reload(created.id);
  view = await reportView(r);
  const empty = view.data.sections.find((x) => x.id === block.id)!;
  assert.ok(empty.blocks.length > 0 && empty.blocks.every((b) => b.widget.value.type === 'error' && /No campaign matches the rule/.test((b.widget.value as any).message)), 'empty rule → every widget errors');
  // the account default is frozen into the sources at generation and composes the same
  await db.integration.update({ where: { id: meta.id }, data: { config: { currency: 'EUR', campaigns: { mode: 'pick', ids: ['c4'] } } } });
  const created2 = await createReport({ companyId: company.id, projectId: project.id, kind: 'report', title: 'Default scope', start: range.start, end: range.end, templateId: tpl.id, integrationIds: [meta.id] });
  const r2 = await reload(created2.id);
  const data2 = r2.data as unknown as ReportData;
  const src = data2.sources.find((s) => s.integrationId === meta.id)!;
  assert.deepEqual([src.campaigns, src.campaignNames, src.missingCampaigns], [{ mode: 'pick', ids: ['c4'] }, ['Spring launch'], 0]);
  const spendBlock = data2.sections.flatMap((s) => s.blocks).find((b) => b.integrationId === meta.id && b.widget.key === 'spend')!;
  assert.ok(Math.abs((spendBlock.widget.value as any).value - spendOf(['c4'])) <= 0.05, 'template values honour the account default');
  const view2 = await reportView(r2);
  const sec2 = view2.data.sections.find((s) => s.source?.integrationId === meta.id)!;
  assert.ok(Math.abs((sec2.blocks.find((b) => b.widget.key === 'spend')!.widget.value as any).value - spendOf(['c4'])) <= 0.05, 'the seeded layout composes the same scoped values');
  assert.equal(sec2.campaignScope?.names[0], 'Spring launch');
});

test('wizard and API: campaign scopes chosen per account at creation become the report\'s frozen defaults; the API accepts and validates them', async () => {
  const { createReport } = await import('../src/lib/services/reports');
  const { demoConnector } = await import('../src/lib/connectors/demo');
  const { company, project, token } = await makeCompany();
  const meta = await addIntegration(company.id, project.id, 'facebook_ads');
  const ga = await addIntegration(company.id, project.id, 'google_analytics_4');
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  const range = { start: '2026-09-01', end: '2026-09-30' };
  const ctx = { integration: { id: meta.id, slug: 'facebook_ads', name: meta.name, sourceId: meta.sourceId, config: { currency: 'EUR' }, credentials: { demo: true } } };
  const rows = await demoConnector.breakdown(ctx, 'campaign', ['spend'], range);
  const spendOf = (ids: string[]) => rows.filter((r) => ids.includes(r.key)).reduce((t, r) => t + (r.values.spend ?? 0), 0);
  const created = await createReport({ companyId: company.id, projectId: project.id, kind: 'report', title: 'Wizard scoped', start: range.start, end: range.end, templateId: tpl.id, integrationIds: [meta.id, ga.id], campaigns: { [meta.id]: { mode: 'pick', ids: ['c1'] } } });
  const r = await db.report.findUniqueOrThrow({ where: { id: created.id } });
  assert.deepEqual(r.campaignScopes, { [meta.id]: { mode: 'pick', ids: ['c1'] } }, 'stored on the report');
  const data = r.data as unknown as ReportData;
  const src = data.sources.find((s) => s.integrationId === meta.id)!;
  assert.deepEqual([src.campaigns, src.campaignNames], [{ mode: 'pick', ids: ['c1'] }, ['Brand search']]);
  assert.equal(data.sources.find((s) => s.integrationId === ga.id)?.campaigns, undefined, 'non-ads accounts carry no scope');
  const spend = data.sections.flatMap((s) => s.blocks).find((b) => b.integrationId === meta.id && b.widget.key === 'spend')!;
  assert.ok(Math.abs((spend.widget.value as any).value - spendOf(['c1'])) <= 0.05, 'generation honoured the chosen scope over the account default');
  // the API: a rule scope; a malformed one is refused
  const viaApi = await api(token, 'POST', '/reports', { project_id: project.id, title: 'Via API', template_id: tpl.id, integration_ids: [meta.id], start: range.start, end: range.end, campaigns: { [meta.id]: { mode: 'rule', rules: [{ op: 'contains', text: 'brand' }] } } });
  assert.equal(viaApi.status, 201, JSON.stringify(viaApi.json));
  const r2 = await db.report.findUniqueOrThrow({ where: { id: viaApi.json.data.id } });
  assert.deepEqual((r2.data as unknown as ReportData).sources.find((s) => s.integrationId === meta.id)?.campaignNames, ['Brand search']);
  const bad = await api(token, 'POST', '/reports', { project_id: project.id, title: 'Bad', template_id: tpl.id, integration_ids: [meta.id], start: range.start, end: range.end, campaigns: { [meta.id]: { mode: 'pick', ids: [] } } });
  assert.equal(bad.status, 422);
});

test('container widget: rows sorted, hidden and truncated, virtual metrics per row, comparison gaps null; the card renders a row per campaign', async () => {
  const { containerFromRows } = await import('../src/lib/layout/container');
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { ContainerCard } = await import('../src/components/container-card');
  const metrics = [
    { key: 'spend', label: 'Spend', format: 'currency' as const },
    { key: 'clicks', label: 'Clicks', format: 'number' as const },
    { key: 'cpc', label: 'CPC', format: 'currency' as const },
  ];
  const rows = [
    { key: 'c1', label: 'Brand search', values: { spend: 100, clicks: 50 } },
    { key: 'c2', label: 'Prospecting – video', values: { spend: 300, clicks: 0 } },
    { key: 'c3', label: 'Retargeting – catalog', values: { spend: 200, clicks: 100 } },
    { key: 'c4', label: 'Spring launch', values: { spend: 50, clicks: 10 } },
  ];
  const prev = [
    { key: 'c1', label: 'Brand search', values: { spend: 80, clicks: 40 } },
    { key: 'c3', label: 'Retargeting – catalog', values: { spend: 220, clicks: 110 } },
  ];
  const campaigns = [
    { id: 'c1', name: 'Brand search', status: 'active' as const },
    { id: 'c2', name: 'Prospecting – video', status: 'active' as const },
    { id: 'c3', name: 'Retargeting – catalog', status: 'paused' as const },
    { id: 'c4', name: 'Spring launch', status: 'other' as const },
  ];
  const v = containerFromRows(rows, prev, metrics, { sortBy: 'spend', rows: 2, hiddenCampaigns: ['c4'] }, campaigns);
  assert.equal(v.type, 'container');
  assert.deepEqual(v.metrics, metrics);
  assert.deepEqual(v.rows.map((r) => r.id), ['c2', 'c3'], 'sorted by spend desc, hidden dropped, truncated to 2');
  assert.equal(v.truncated, 1, 'one more row beyond the limit (c1); the hidden one is not counted');
  assert.deepEqual(v.rows[0], { id: 'c2', name: 'Prospecting – video', status: 'active', values: [300, 0, null], comparison: [null, null, null] }, 'cpc null when clicks are 0; no previous rows → nulls');
  assert.deepEqual(v.rows[1], { id: 'c3', name: 'Retargeting – catalog', status: 'paused', values: [200, 100, 2], comparison: [220, 110, 2] });
  const all = containerFromRows(rows, null, metrics, {}, campaigns);
  assert.equal(all.rows.length, 4);
  assert.equal(all.rows[0].comparison, undefined, 'no comparison period → no comparison arrays');
  assert.equal(all.truncated, 0);

  const block = { id: 'ct', integrationId: 1, platform: 'Meta Ads', slug: 'facebook_ads', account_name: 'Acme – Meta Ads', widget: { reference_key: 'container', key: 'campaigns', label: 'Campaigns', format: 'number' as const, diff_type: 'neutral' as const, value: v } };
  const html = renderToStaticMarkup(createElement(ContainerCard, { b: block as any, fmt: { decimalSeparatorFormat: 'comma_dot' as const }, grid: true }));
  assert.match(html, /class="ctable[^"]*"/);
  assert.equal((html.match(/<tr[\s>]/g) ?? []).length, 3, 'a header row and one row per campaign');
  assert.match(html, /Prospecting – video/);
  assert.match(html, /data-status="paused"/);
  assert.match(html, /\+1 more/);
  assert.match(html, /€300/, 'currency formatted');
});

test('container widget: registries (component, sizes, store key with and without scope) and the CSV export rows', async () => {
  const { componentOfValue, valueKey } = await import('../src/lib/layout/compose');
  const { DEFAULT_SIZE, MIN_SIZE, SPECIAL_SLUGS } = await import('../src/lib/layout/types');
  assert.equal(componentOfValue({ type: 'container', metrics: [], rows: [], truncated: 0 } as any), 'container_v1');
  assert.deepEqual(DEFAULT_SIZE.container_v1, { w: 12, h: 4 });
  assert.deepEqual(MIN_SIZE.container_v1, { w: 6, h: 3 });
  assert.ok((SPECIAL_SLUGS as readonly string[]).includes('container'));
  const w = { id: 'ct', slug: 'container', key: 'campaigns', component: 'container_v1' as const, integrationId: 7, custom: { metrics: ['spend', 'clicks'] } };
  const plain = valueKey(w as any)!;
  assert.match(plain, /^7:container:[0-9a-f]{8}$/, `metrics hashed into the key: ${plain}`);
  assert.notEqual(plain, valueKey({ ...w, custom: { metrics: ['spend'] } } as any), 'different metrics → different key');
  assert.match(valueKey(w as any, { mode: 'pick', ids: ['c1'] })!, /^7:container:[0-9a-f]{8}#[0-9a-f]{8}$/, 'scope appended');

  // the engine path: a container saved in an ads block resolves from the demo campaigns, honours the block scope, and exports to CSV
  const { reportView, saveLayout } = await import('../src/lib/layout/service');
  const { createReport } = await import('../src/lib/services/reports');
  const { reportToCsv } = await import('../src/lib/services/export');
  const { company, project } = await makeCompany();
  const meta = await addIntegration(company.id, project.id, 'facebook_ads');
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  const created = await createReport({ companyId: company.id, projectId: project.id, kind: 'report', title: 'Container', start: '2026-09-01', end: '2026-09-30', comparisonStart: '2026-08-01', comparisonEnd: '2026-08-31', templateId: tpl.id, integrationIds: [meta.id] });
  let r = await db.report.findUniqueOrThrow({ where: { id: created.id }, include: { project: true } });
  const layout: ReportLayout = JSON.parse(JSON.stringify((await reportView(r, { includeHidden: true })).layout));
  const block = layout.blocks.find((b) => b.integrationId === meta.id)!;
  block.campaigns = { mode: 'pick', ids: ['c1', 'c2', 'c3', 'c4', 'c5'] };
  block.widgets.push({ id: 'ct', slug: 'container', key: 'campaigns', component: 'container_v1', integrationId: meta.id, x: 0, y: 40, w: 12, h: 4, custom: { title: 'Top campaigns', metrics: ['spend', 'clicks', 'cpc'], rows: 3, hiddenCampaigns: ['c5'] } });
  // the editor adds specials with integrationId 0: the block's account must still be used
  block.widgets.push({ id: 'ct0', slug: 'container', key: 'campaigns', component: 'container_v1', integrationId: 0, x: 0, y: 44, w: 12, h: 4, custom: { title: 'From the drawer', metrics: ['spend'], rows: 2 } });
  await saveLayout(r, layout);
  r = await db.report.findUniqueOrThrow({ where: { id: created.id }, include: { project: true } });
  const view = await reportView(r);
  const sec = view.data.sections.find((s) => s.id === block.id)!;
  const ct = sec.blocks.find((b) => b.id === 'ct')!;
  assert.equal(ct.widget.value.type, 'container', JSON.stringify(ct.widget.value).slice(0, 200));
  const ct0 = sec.blocks.find((b) => b.id === 'ct0')!;
  assert.equal(ct0.widget.value.type, 'container', `integrationId 0 resolves through the block: ${JSON.stringify(ct0.widget.value).slice(0, 160)}`);
  assert.equal((ct0.widget.value as any).rows.length, 2);
  const cv = ct.widget.value as any;
  assert.deepEqual(cv.metrics.map((m: any) => m.key), ['spend', 'clicks', 'cpc']);
  assert.equal(cv.rows.length, 3, 'three rows shown');
  assert.equal(cv.truncated, 1, 'c5 hidden, c6 outside the scope, one more beyond the limit');
  assert.ok(cv.rows.every((row: any) => !['c5', 'c6'].includes(row.id)));
  assert.ok(cv.rows[0].values[0] >= cv.rows[1].values[0], 'sorted by spend');
  const [sp, cl, cpc] = cv.rows[0].values;
  assert.ok(Math.abs(cpc - sp / cl) < 0.011, `cpc ${cpc} ≈ spend/clicks ${sp / cl}`);
  assert.equal(cv.rows[0].comparison.length, 3, 'comparison values for the previous period');
  assert.equal(ct.widget.label, 'Top campaigns');
  const csv = reportToCsv(view.data);
  assert.match(csv, /,campaign,"?Brand search · /i, 'one CSV row per campaign and metric');
  assert.equal((csv.match(/,campaign,/g) ?? []).length, 9 + 2, 'three rows × three metrics, plus two rows × one metric of the drawer-added table');
});
