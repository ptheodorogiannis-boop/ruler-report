import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test, { after } from 'node:test';
import { findWidget, getCatalog } from '../src/lib/catalog/build';
import { customConnector, invalidateRows } from '../src/lib/connectors/custom';
import { wooConnector } from '../src/lib/connectors/woo';
import { FetchSession, resolveWidget } from '../src/lib/engine/resolve';
import { connectIntegration } from '../src/lib/services/integrations';
import { db } from '../src/lib/db';
import { decryptJson } from '../src/lib/crypto';
import { toCtx } from '../src/lib/engine/report';
import { makeCompany } from './helpers';

const servers: http.Server[] = [];
function serve(handler: http.RequestListener): Promise<string> {
  return new Promise((resolve) => {
    const s = http.createServer(handler).listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(s.address() as AddressInfo).port}`));
    servers.push(s);
  });
}
after(() => servers.forEach((s) => s.close()));

const range = { start: '2026-09-01', end: '2026-09-30' };

test('CSV URL connector: detects columns, builds widgets, aggregates by day and by text column', async () => {
  const csv = [
    'Date,Source,Leads,Cost',
    '01/09/2026,Meta,4,"120,50"',
    '01/09/2026,Google,2,"80,00"',
    '02/09/2026,Meta,6,"150,00"',
    '15/09/2026,Referral,1,0',
    '02/10/2026,Meta,99,"999,00"', // outside the period
  ].join('\n');
  let hits = 0;
  const base = await serve((req, res) => {
    hits++;
    if (req.headers.authorization !== 'Bearer s3cret') {
      res.writeHead(401).end('nope');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/csv' }).end(csv);
  });
  const { company, project } = await makeCompany();

  // wrong credentials → connect fails with a human message
  await assert.rejects(connectIntegration({ companyId: company.id, projectId: project.id, slug: 'csv_url', sourceId: `${base}/data.csv` }), /401/);
  const row = await connectIntegration({ companyId: company.id, projectId: project.id, slug: 'csv_url', sourceId: `${base}/data.csv`, config: { headers: { Authorization: 'Bearer s3cret' } } });
  const cfg: any = row.config;
  assert.deepEqual(cfg.columns.map((c: any) => `${c.key}:${c.kind}`), ['date:date', 'source:text', 'leads:number', 'cost:number']);

  const catalog = getCatalog('csv_url', cfg).map((w) => w.key);
  for (const k of ['rows', 'sum_leads', 'sum_cost', 'avg_leads', 'leads_by_date', 'by_source', 'chart_by_source', 'all_by_date']) assert.ok(catalog.includes(k), `missing widget ${k}`);

  const ctx = toCtx(row, project);
  const get = async (key: string) => resolveWidget({ integration: ctx, widget: findWidget('csv_url', key, cfg)!, range, comparison: null, session: new FetchSession() }) as any;
  assert.equal((await get('sum_leads')).value, 13);
  assert.equal((await get('sum_cost')).value, 350.5, 'EU decimal commas parsed');
  assert.equal((await get('rows')).value, 4);
  const byDay = await get('leads_by_date');
  assert.equal(byDay.labels.length, 30);
  assert.equal(byDay.series[0][0], 6);
  const tbl = await get('by_source');
  assert.equal(tbl.rows[0][0], 'Meta', 'sorted by leads desc');
  assert.equal(tbl.rows[0][2], 10);
  assert.ok(tbl.rows.every((r: any[]) => r[0] !== undefined));
  const before = hits;
  await get('sum_leads');
  assert.equal(hits, before, 'rows are cached between widgets');
  invalidateRows(row.id);
});

test('Google Sheets connector builds the CSV export URL from spreadsheetId|||gid|||tab', async () => {
  const { sheetUrl } = await import('../src/lib/connectors/custom');
  assert.equal(sheetUrl('1AbC|||275561313|||Total'), 'https://docs.google.com/spreadsheets/d/1AbC/export?format=csv&gid=275561313');
  assert.equal(sheetUrl('1AbC'), 'https://docs.google.com/spreadsheets/d/1AbC/export?format=csv&gid=0');
});

test('REST/JSON connector flattens nested objects', async () => {
  const base = await serve((_, res) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data: [{ day: '2026-09-02', stats: { signups: 5 }, plan: 'pro' }, { day: '2026-09-03', stats: { signups: 7 }, plan: 'free' }] })));
  const { company, project } = await makeCompany();
  const row = await connectIntegration({ companyId: company.id, projectId: project.id, slug: 'rest_api', sourceId: `${base}/x.json` });
  const cfg: any = row.config;
  assert.ok(cfg.columns.some((c: any) => c.key === 'stats_signups' && c.kind === 'number'), JSON.stringify(cfg.columns));
  const v: any = await resolveWidget({ integration: toCtx(row, project), widget: findWidget('rest_api', 'sum_stats_signups', cfg)!, range, session: new FetchSession() });
  assert.equal(v.value, 12);
});

test('WooCommerce connector: pagination, daily aggregation, breakdowns, auth header', async () => {
  const orders = Array.from({ length: 130 }, (_, i) => ({
    date_created: i < 100 ? '2026-09-10T10:00:00' : '2026-09-11T09:00:00',
    total: '50.00',
    total_tax: '9.50',
    discount_total: i % 10 === 0 ? '5.00' : '0.00',
    shipping_total: '3.00',
    payment_method_title: i % 2 ? 'Card' : 'PayPal',
    customer_id: i,
    billing: { country: i % 4 ? 'GR' : 'CY' },
    line_items: [{ quantity: 2, name: i % 3 ? 'Shoe' : 'Sock', total: '50.00', product_id: i }],
    coupon_lines: i % 10 === 0 ? [{ code: 'save5' }] : [],
    refunds: i === 0 ? [{ total: '-10.00' }] : [],
  }));
  const seen: { auth?: string; urls: string[] } = { urls: [] };
  const base = await serve((req, res) => {
    seen.auth = req.headers.authorization;
    seen.urls.push(req.url!);
    const u = new URL(req.url!, 'http://x');
    res.setHeader('content-type', 'application/json');
    if (u.pathname.endsWith('/orders')) {
      const page = Number(u.searchParams.get('page'));
      return res.end(JSON.stringify(orders.slice((page - 1) * 100, page * 100)));
    }
    if (u.pathname.endsWith('/customers')) return res.end(JSON.stringify([{ date_created: '2026-09-10T08:00:00' }, { date_created: '2026-09-11T08:00:00' }]));
    res.writeHead(404).end('{}');
  });
  const ctx = { integration: { id: 1, slug: 'woo_commerce', name: 'w', sourceId: Buffer.from(base).toString('base64'), config: {}, credentials: { consumerKey: 'ck', consumerSecret: 'cs' } } };
  const d = await wooConnector.daily(ctx, ['orders', 'revenue', 'items_sold', 'refunds', 'new_customers', 'returning_customers', 'discounts'], range);
  assert.equal(seen.auth, 'Basic ' + Buffer.from('ck:cs').toString('base64'));
  assert.equal(seen.urls.filter((u) => u.includes('/orders')).length, 2, 'fetched page 1 and page 2');
  assert.equal(d['2026-09-10'].orders, 100);
  assert.equal(d['2026-09-11'].orders, 30);
  assert.equal(d['2026-09-10'].revenue, 5000);
  assert.equal(d['2026-09-10'].items_sold, 200);
  assert.equal(d['2026-09-10'].refunds, 10);
  assert.equal(d['2026-09-10'].new_customers, 1);
  assert.equal(d['2026-09-10'].returning_customers, 99);
  assert.equal(d['2026-09-10'].discounts, 50);
  assert.equal(d['2026-09-12'].orders, 0, 'days without orders are zero-filled');
  const byProduct = await wooConnector.breakdown(ctx, 'product', ['orders', 'revenue'], range);
  assert.equal(byProduct[0].label, 'Shoe');
  assert.equal(byProduct.reduce((a, r) => a + r.values.orders, 0), 130);
  const byCoupon = await wooConnector.breakdown(ctx, 'coupon', ['orders', 'discounts'], range);
  assert.equal(byCoupon.find((r) => r.label === 'SAVE5')!.values.orders, 13);
  assert.equal(byCoupon.find((r) => r.label === '(none)')!.values.orders, 117);
  assert.deepEqual(wooConnector.unsupported, ['carts_created', 'abandoned_carts']);
});

test('credentials are stored encrypted and never returned by the API serializers', async () => {
  const { company, project } = await makeCompany();
  const row = await connectIntegration({ companyId: company.id, projectId: project.id, slug: 'facebook_ads', sourceId: 'act_1', credentials: { accessToken: 'EAAB-secret', demo: true } });
  const raw = await db.integration.findUniqueOrThrow({ where: { id: row.id } });
  assert.ok(raw.credentials && !raw.credentials.includes('EAAB-secret'));
  assert.equal(decryptJson<any>(raw.credentials)!.accessToken, 'EAAB-secret');
});

test('customConnector is a no-op for unknown breakdown dimensions', async () => {
  const rows = await customConnector.breakdown({ integration: { id: 99, slug: 'csv_url', name: '', sourceId: 'x', config: { columns: [] }, credentials: null } }, 'nope', ['__rows'], range);
  assert.deepEqual(rows, []);
});
