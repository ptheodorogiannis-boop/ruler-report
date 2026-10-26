import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../src/lib/db';
import { sha256 } from '../src/lib/crypto';
import { resetRateLimits } from '../src/lib/api/http';
import { listRoutes } from '../src/lib/api/routes';
import { addIntegration, api, makeCompany } from './helpers';

test('auth: missing or wrong bearer token → 401', async () => {
  const { NextRequest } = await import('next/server');
  const mod = await import('../src/app/api/v2/[...path]/route');
  const res = await mod.GET(new NextRequest('http://localhost:3100/api/v2/projects'), { params: Promise.resolve({ path: ['projects'] }) });
  assert.equal(res.status, 401);
  const r2 = await api('rr_wrong', 'GET', '/projects');
  assert.equal(r2.status, 401);
});

test('Reportei-compatible surface: every v2 endpoint from the evidence dossier exists', () => {
  const have = new Set(listRoutes().map((r) => `${r.method} ${r.path}`));
  const need = [
    'GET /companies/settings', 'GET /projects', 'GET /projects/:id', 'GET /integrations', 'GET /integrations/:id', 'GET /metrics', 'POST /metrics/get-data', 'GET /templates', 'GET /templates/:id',
    'GET /reports', 'GET /reports/:id', 'POST /reports', 'GET /dashboards', 'GET /dashboards/:id', 'POST /dashboards', 'GET /webhooks', 'GET /webhooks/events', 'GET /webhooks/:id', 'POST /webhooks',
    'PUT /webhooks/:id', 'DELETE /webhooks/:id', 'GET /timeline-events', 'GET /timeline-events/:id', 'POST /timeline-events', 'PUT /timeline-events/:id', 'DELETE /timeline-events/:id',
  ];
  for (const n of need) assert.ok(have.has(n), `missing ${n}`);
  assert.equal(listRoutes().filter((r) => !r.ext).length, need.length, 'extension flag is accurate');
});

test('pagination envelope, sorting and tenant isolation', async () => {
  const a = await makeCompany('A');
  const b = await makeCompany('B');
  for (let i = 0; i < 4; i++) await db.project.create({ data: { companyId: a.company.id, name: `Zed ${i}` } });
  await db.project.create({ data: { companyId: b.company.id, name: 'Other tenant secret' } });
  const r = await api(a.token, 'GET', '/projects?per_page=2&page=2&sortBy=name&descending=false');
  assert.equal(r.status, 200);
  assert.equal(r.json.meta.per_page, 2);
  assert.equal(r.json.meta.current_page, 2);
  assert.equal(r.json.meta.total, 5);
  assert.equal(r.json.meta.last_page, 3);
  assert.equal(r.json.meta.from, 3);
  assert.equal(r.json.meta.to, 4);
  assert.ok(r.json.links.prev && r.json.links.next && r.json.links.first && r.json.links.last);
  assert.ok(r.headers.get('x-ratelimit-limit') && r.headers.get('x-ratelimit-remaining'));
  const all = await api(a.token, 'GET', '/projects?per_page=100');
  assert.ok(!JSON.stringify(all.json).includes('Other tenant secret'));
  const bProj = (await api(b.token, 'GET', '/projects')).json.data[0];
  assert.equal((await api(a.token, 'GET', `/projects/${bProj.id}`)).status, 404, 'cannot read another tenant’s project');
  assert.equal((await api(a.token, 'PUT', `/projects/${bProj.id}`, { name: 'hacked' })).status, 404);
  assert.equal((await api(a.token, 'DELETE', `/projects/${bProj.id}`)).status, 404);
  assert.equal((await db.project.findUniqueOrThrow({ where: { id: bProj.id } })).name, 'Other tenant secret');
  assert.equal((await api(a.token, 'GET', '/projects?per_page=1000')).json.meta.per_page, 100, 'per_page is capped at 100');
});

test('metrics catalog + get-data (single integration, with comparison, mixed valid/invalid metrics)', async () => {
  const { company, project, token } = await makeCompany();
  const fb = await addIntegration(company.id, project.id, 'facebook_ads');
  const m = await api(token, 'GET', '/metrics?integration_slug=facebook_ads&search=spend');
  assert.equal(m.status, 200);
  assert.ok(m.json.data.length >= 3 && m.json.data.every((d: any) => d.reference_key.startsWith('fb_ads:')));
  assert.equal((await api(token, 'GET', '/metrics')).status, 422);
  assert.equal((await api(token, 'GET', '/metrics?integration_slug=nope')).status, 422);
  const r = await api(token, 'POST', '/metrics/get-data', {
    integration_id: fb.id, start: '2026-09-01', end: '2026-09-30', comparison_start: '2026-08-01', comparison_end: '2026-08-31',
    metrics: [{ reference_key: 'fb_ads:spend' }, { reference_key: 'fb_ads:campaigns' }, { reference_key: 'fb_ads:spend_by_date' }, { reference_key: 'fb_ads:bogus' }],
  });
  assert.equal(r.status, 200);
  assert.ok(r.json['fb_ads:spend'].values > 0);
  assert.equal(typeof r.json['fb_ads:spend'].comparison.difference, 'number');
  assert.ok(r.json['fb_ads:campaigns'].values.rows.length > 0);
  assert.equal(r.json['fb_ads:spend_by_date'].values.labels.length, 30);
  assert.equal(r.json['fb_ads:bogus'].error.type, 'invalid_metrics_combination');
  assert.equal((await api(token, 'POST', '/metrics/get-data', { integration_id: fb.id, start: '2026-09-30', end: '2026-09-01', metrics: [{ reference_key: 'fb_ads:spend' }] })).status, 422, 'start after end');
  assert.equal((await api(token, 'POST', '/metrics/get-data', { integration_id: 999999, start: '2026-09-01', end: '2026-09-30', metrics: [{ reference_key: 'fb_ads:spend' }] })).status, 404);
});

test('reports: create → get → data → analysis → ask → csv → delete; validation; foreign integrations rejected', async () => {
  const { company, project, token } = await makeCompany();
  const other = await makeCompany('Other');
  const fb = await addIntegration(company.id, project.id, 'facebook_ads');
  const ga = await addIntegration(company.id, project.id, 'google_analytics_4');
  const foreign = await addIntegration(other.company.id, other.project.id, 'facebook_ads');
  const tpl = (await api(token, 'GET', '/templates?kind=report')).json.data.find((t: any) => t.is_default);

  assert.equal((await api(token, 'POST', '/reports', { title: 'x' })).status, 422);
  const bad = await api(token, 'POST', '/reports', { title: 'x', start: '2026-09-01', end: '2026-09-30', template_id: tpl.id, integration_ids: [foreign.id], project_id: project.id });
  assert.equal(bad.status, 422, 'integrations from another project/tenant are ignored → nothing selected');

  const created = await api(token, 'POST', '/reports', { title: 'Sept', subtitle: 'Perf', start: '2026-09-01', end: '2026-09-30', comparison_start: '2026-08-01', comparison_end: '2026-08-31', template_id: tpl.id, integration_ids: [fb.id, ga.id], project_id: project.id, with_ai: true });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const id = created.json.data.id;
  assert.match(created.json.data.external_url, /\/r\/[\w-]{20,}$/);
  assert.equal(created.json.data.client_id, project.id);
  const data = await api(token, 'GET', `/reports/${id}/data`);
  assert.equal(data.status, 200);
  assert.ok(data.json.data.sections.length >= 2);
  assert.equal(data.json.data.sources.length, 2);
  assert.equal(data.json.data.analysis.length, 1, 'with_ai writes an analysis card');
  assert.match(data.json.data.analysis[0].html, /Summary for/);
  const frozen = JSON.stringify((await db.report.findUniqueOrThrow({ where: { id } })).data);
  await db.integration.update({ where: { id: fb.id }, data: { sourceId: 'changed-after-the-fact' } }); // demo data keyed by integration id, so snapshot stays equal either way
  assert.equal(frozen, JSON.stringify((await db.report.findUniqueOrThrow({ where: { id } })).data), 'reports are static snapshots');

  const card = await api(token, 'POST', `/reports/${id}/analysis`, { title: 'Manual', html: '<p>hello <script>x</script></p>' });
  assert.equal(card.status, 201);
  assert.equal(card.json.data.length, 2);
  const ask = await api(token, 'POST', `/reports/${id}/ask`, { question: 'what was the meta ads amount spent' });
  assert.equal(ask.status, 200);
  assert.match(ask.json.answer, /Amount spent/i);
  const csv = await api(token, 'GET', `/reports/${id}/export.csv`);
  assert.equal(csv.status, 200);
  assert.match(String(csv.json), /^section,platform,account,metric/);

  const list = await api(token, 'GET', `/reports?project_id=${project.id}&search=sept`);
  assert.equal(list.json.meta.total, 1);
  assert.equal((await api(token, 'GET', `/dashboards/${id}`)).status, 404, 'a report is not a dashboard');
  assert.equal((await api(token, 'DELETE', `/reports/${id}`)).status, 200);
  assert.equal((await api(token, 'GET', `/reports/${id}`)).status, 404);
});

test('dashboards are live: preset ranges roll, no snapshot is stored', async () => {
  const { company, project, token } = await makeCompany();
  const fb = await addIntegration(company.id, project.id, 'facebook_ads');
  const tpl = (await api(token, 'GET', '/templates?kind=dashboard')).json.data.find((t: any) => t.is_default);
  const r = await api(token, 'POST', '/dashboards', { title: 'Live', template_id: tpl.id, integration_ids: [fb.id], project_id: project.id, preset: 'last_7d' });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const row = await db.report.findUniqueOrThrow({ where: { id: r.json.data.id } });
  assert.equal(row.kind, 'dashboard');
  assert.equal(row.data, null);
  assert.equal(row.preset, 'last_7d');
  const d = await api(token, 'GET', `/dashboards/${row.id}/data`);
  assert.equal(d.status, 200);
  assert.equal(d.json.data.comparison.end < d.json.data.range.start, true, 'comparison is the period before');
  assert.equal(d.json.data.range.start <= d.json.data.range.end, true);
});

test('webhooks CRUD, events and validation', async () => {
  const { token, project } = await makeCompany();
  assert.equal((await api(token, 'POST', '/webhooks', { url: 'not-a-url', event_type: 'report_created' })).status, 422);
  assert.equal((await api(token, 'POST', '/webhooks', { url: 'https://example.com/h', event_type: 'bogus_event' })).status, 422);
  const c = await api(token, 'POST', '/webhooks', { url: 'https://example.com/h', event_type: 'report_created', source: 'zapier', project_id: project.id });
  assert.equal(c.status, 201);
  assert.match(c.json.data.secret, /^whsec_/);
  const id = c.json.data.id;
  const g = await api(token, 'GET', `/webhooks/${id}`);
  assert.equal(g.json.data.source, 'zapier');
  assert.equal(g.json.data.secret, undefined, 'secret only shown on creation');
  assert.equal((await api(token, 'PUT', `/webhooks/${id}`, { status: 'inactive' })).json.data.status, 'inactive');
  assert.equal((await api(token, 'GET', '/webhooks?status=inactive')).json.meta.total, 1);
  assert.equal((await api(token, 'GET', '/webhooks/events')).json.data.length, 8);
  assert.equal((await api(token, 'DELETE', `/webhooks/${id}`)).json.success, true);
  assert.equal((await api(token, 'GET', `/webhooks/${id}`)).status, 404);
});

test('timeline events CRUD', async () => {
  const { token, project } = await makeCompany();
  assert.equal((await api(token, 'POST', '/timeline-events', { project_id: project.id })).status, 422);
  const c = await api(token, 'POST', '/timeline-events', { project_id: project.id, title: 'Launch', content: '<p>live</p>', date: '2026-09-15' });
  assert.equal(c.status, 201);
  const id = c.json.data.id;
  assert.equal((await api(token, 'PUT', `/timeline-events/${id}`, { title: 'Launch v2' })).json.data.title, 'Launch v2');
  assert.equal((await api(token, 'GET', `/timeline-events?project_id=${project.id}&date=2026-09-15`)).json.meta.total, 1);
  assert.equal((await api(token, 'DELETE', `/timeline-events/${id}`)).status, 200);
});

test('Push API: rows land in the catalog automatically and feed widgets', async () => {
  const { company, project, token } = await makeCompany();
  const created = await api(token, 'POST', '/integrations', { project_id: project.id, slug: 'webhook_ingest', source_id: 'Lead form' });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const id = created.json.data.id;
  assert.equal((await api(token, 'POST', `/ingest/${id}`, { rows: [] })).status, 422);
  const wrong = await addIntegration(company.id, project.id, 'facebook_ads');
  assert.equal((await api(token, 'POST', `/ingest/${wrong.id}`, { rows: [{ a: 1 }] })).status, 422, 'only Push API integrations accept rows');
  const r = await api(token, 'POST', `/ingest/${id}`, { rows: [{ date: '2026-09-02', source: 'Webinar', leads: 4, cost: 120 }, { date: '2026-09-03', source: 'Referral', leads: 2, cost: 0 }, { date: '2026-09-03', source: 'Webinar', leads: 1, cost: 30 }] });
  assert.equal(r.status, 201);
  assert.equal(r.json.inserted, 3);
  assert.deepEqual(r.json.columns.map((c: any) => `${c.name}:${c.kind}`), ['source:text', 'leads:number', 'cost:number', 'date:date'].filter((x) => r.json.columns.some((c: any) => `${c.name}:${c.kind}` === x)));
  const metrics = await api(token, 'GET', `/metrics?integration_slug=webhook_ingest&integration_id=${id}`);
  assert.ok(metrics.json.data.some((m: any) => m.reference_key === 'push:sum_leads'));
  const v = await api(token, 'POST', '/metrics/get-data', { integration_id: id, start: '2026-09-01', end: '2026-09-30', metrics: [{ reference_key: 'push:sum_leads' }, { reference_key: 'push:by_source' }] });
  assert.equal(v.json['push:sum_leads'].values, 7);
  assert.equal(v.json['push:by_source'].values.rows[0][0], 'Webinar');
});

test('read-only roles cannot write; project-restricted users only see their projects', async () => {
  const { company, project } = await makeCompany();
  const other = await db.project.create({ data: { companyId: company.id, name: 'Hidden client' } });
  const { principalFor } = await import('./principal');
  const viewer = await principalFor(company.id, 'viewer', null);
  const client = await principalFor(company.id, 'client', [project.id]);
  const { match } = await import('../src/lib/api/routes');
  const run = async (p: any, method: string, path: string, body?: any) => {
    const m = match(method, path)!;
    try {
      return { ok: true as const, out: await m.route.fn({ p, query: new URLSearchParams(), params: m.params, body }) };
    } catch (e: any) {
      return { ok: false as const, status: e.status as number };
    }
  };
  const w = await run(viewer, 'POST', '/projects', { name: 'nope' });
  assert.deepEqual(w, { ok: false, status: 403 });
  const list: any = (await run(client, 'GET', '/projects')) as any;
  assert.deepEqual(list.out.data.map((p: any) => p.name), ['Client A']);
  const direct = await run(client, 'GET', '/projects/:id'.replace(':id', String(other.id)));
  assert.deepEqual(direct, { ok: false, status: 404 });
  assert.deepEqual(await run(client, 'DELETE', `/projects/${project.id}`), { ok: false, status: 403 });
});

test('rate limiting: 429 with Retry-After once the per-second budget is exhausted', async () => {
  resetRateLimits();
  const { token } = await makeCompany();
  const statuses: number[] = [];
  let retry: string | null = null;
  // fired together so all 20 land inside one wall-clock second even under load (the loop version flaked in full-suite runs)
  const results = await Promise.all(Array.from({ length: 20 }, () => api(token, 'GET', '/companies/settings')));
  for (const r of results) {
    statuses.push(r.status);
    if (r.status === 429) retry = r.headers.get('retry-after');
  }
  assert.equal(statuses.filter((s) => s === 200).length, 15);
  assert.ok(statuses.includes(429));
  assert.ok(retry && Number(retry) >= 1);
  resetRateLimits();
});

test('tokens are stored hashed', async () => {
  const { token } = await makeCompany();
  const row = await db.apiToken.findFirst({ where: { tokenHash: sha256(token) } });
  assert.ok(row);
  assert.ok(!JSON.stringify(row).includes(token));
});

test('restricted users cannot widen their scope through filters (regression: later spread overwrote the project restriction)', async () => {
  const { company, project } = await makeCompany();
  const hidden = await db.project.create({ data: { companyId: company.id, name: 'Hidden' } });
  const fbVisible = await addIntegration(company.id, project.id, 'facebook_ads');
  const fbHidden = await addIntegration(company.id, hidden.id, 'facebook_ads');
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  const { createReport } = await import('../src/lib/services/reports');
  const secret = await createReport({ companyId: company.id, projectId: hidden.id, kind: 'report', title: 'Secret report', start: '2026-09-01', end: '2026-09-30', templateId: tpl.id, integrationIds: [fbHidden.id] });
  const { principalFor } = await import('./principal');
  const { match } = await import('../src/lib/api/routes');
  const client = await principalFor(company.id, 'client', [project.id]);
  const call = async (method: string, path: string, qs = '') => {
    const m = match(method, path)!;
    try {
      return { out: (await m.route.fn({ p: client, query: new URLSearchParams(qs), params: m.params, body: undefined })) as any };
    } catch (e: any) {
      return { status: e.status as number };
    }
  };
  assert.equal((await call('GET', '/reports', `project_id=${hidden.id}`)).out.meta.total, 0);
  assert.equal((await call('GET', '/integrations', `project_id=${hidden.id}`)).out.meta.total, 0);
  assert.equal((await call('GET', '/integrations', `project_id=${project.id}`)).out.meta.total, 1);
  assert.equal((await call('GET', `/reports/${secret.id}`)).status, 404);
  assert.equal((await call('GET', `/reports/${secret.id}/data`)).status, 404);
  assert.equal((await call('GET', `/integrations/${fbHidden.id}`)).status, 404);
  assert.equal((await call('GET', `/projects/${hidden.id}`)).status, 404);
  assert.equal((await call('GET', `/integrations/${fbVisible.id}`)).out.data.id, fbVisible.id);
  assert.ok(!JSON.stringify((await call('GET', '/reports')).out).includes('Secret report'));
});
