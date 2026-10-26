// WooCommerce — REST API v3 (orders + customers). Works with consumer key/secret over HTTPS.
// Verified against a mock server in tests/connectors.test.ts; not run against a live store.
import type { BreakdownRow, Connector, DailyData, DateRange } from '@/lib/engine/types';
import { eachDay } from '@/lib/util/dates';
import { fetchJson } from './http';

const base = (ctx: any) => {
  let u = String(ctx.integration.sourceId);
  // Reportei stores base64(url) as the source id; accept both
  if (!/^https?:/i.test(u)) {
    try {
      u = Buffer.from(u, 'base64').toString('utf8');
    } catch {
      /* not base64 */
    }
  }
  return u.replace(/\/+$/, '');
};
const auth = (ctx: any) => {
  const c = ctx.integration.credentials ?? {};
  return 'Basic ' + Buffer.from(`${c.consumerKey}:${c.consumerSecret}`).toString('base64');
};

interface Order {
  date_created: string;
  total: string;
  total_tax: string;
  discount_total: string;
  shipping_total: string;
  payment_method_title: string;
  customer_id: number;
  billing?: { country?: string };
  line_items: { quantity: number; name: string; total: string; product_id: number; categories?: { name: string }[] }[];
  coupon_lines: { code: string }[];
  refunds?: { total: string }[];
}

async function listAll<T>(ctx: any, path: string, params: Record<string, string>): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 50; page++) {
    const qs = new URLSearchParams({ ...params, per_page: '100', page: String(page) });
    const batch = await fetchJson<T[]>(`${base(ctx)}/wp-json/wc/v3/${path}?${qs}`, { headers: { authorization: auth(ctx) } });
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}
const orders = (ctx: any, r: DateRange) =>
  listAll<Order>(ctx, 'orders', { after: `${r.start}T00:00:00`, before: `${r.end}T23:59:59`, status: 'completed,processing,on-hold', orderby: 'date', order: 'asc' });

const f = (s: string | undefined) => Number(s ?? 0) || 0;

export const wooConnector: Connector = {
  id: 'woo',
  // carts are not exposed by the WooCommerce REST API
  unsupported: ['carts_created', 'abandoned_carts'],

  async daily(ctx, prims, range): Promise<DailyData> {
    const [os, customers] = await Promise.all([
      orders(ctx, range),
      prims.includes('new_customers') || prims.includes('returning_customers')
        ? listAll<{ date_created: string }>(ctx, 'customers', { after: `${range.start}T00:00:00`, before: `${range.end}T23:59:59`, role: 'all' })
        : Promise.resolve([]),
    ]);
    const out: DailyData = {};
    for (const d of eachDay(range)) out[d] = Object.fromEntries(prims.map((p) => [p, 0]));
    for (const o of os) {
      const d = o.date_created.slice(0, 10);
      const row = out[d];
      if (!row) continue;
      const add = (p: string, v: number) => {
        if (p in row) row[p] += v;
      };
      add('orders', 1);
      add('revenue', f(o.total));
      add('taxes', f(o.total_tax));
      add('discounts', f(o.discount_total));
      add('shipping', f(o.shipping_total));
      add('items_sold', o.line_items.reduce((a, l) => a + l.quantity, 0));
      add('refunds', Math.abs((o.refunds ?? []).reduce((a, r) => a + f(r.total), 0)));
    }
    for (const c of customers) {
      const row = out[c.date_created.slice(0, 10)];
      if (row && 'new_customers' in row) row.new_customers += 1;
    }
    if (prims.includes('returning_customers')) for (const d of Object.keys(out)) out[d].returning_customers = Math.max(0, out[d].orders - out[d].new_customers);
    return out;
  },

  async breakdown(ctx, dimension, prims, range, opts): Promise<BreakdownRow[]> {
    const os = await orders(ctx, range);
    const groups = new Map<string, Record<string, number>>();
    const bump = (key: string, vals: Record<string, number>) => {
      const g = groups.get(key) ?? Object.fromEntries(prims.map((p) => [p, 0]));
      for (const p of prims) if (vals[p] != null) g[p] += vals[p];
      groups.set(key, g);
    };
    for (const o of os) {
      if (dimension === 'product') {
        for (const l of o.line_items) bump(l.name, { orders: 1, items_sold: l.quantity, revenue: f(l.total) });
      } else if (dimension === 'country') bump(o.billing?.country || 'Unknown', { orders: 1, revenue: f(o.total) });
      else if (dimension === 'payment_method') bump(o.payment_method_title || 'Unknown', { orders: 1, revenue: f(o.total) });
      else if (dimension === 'coupon') {
        const codes = o.coupon_lines.length ? o.coupon_lines.map((c) => c.code.toUpperCase()) : ['(none)'];
        for (const c of codes) bump(c, { orders: 1, discounts: f(o.discount_total), revenue: f(o.total) });
      } else if (dimension === 'category') {
        for (const l of o.line_items) for (const c of l.categories?.length ? l.categories : [{ name: 'Uncategorized' }]) bump(c.name, { orders: 1, revenue: f(l.total) });
      }
    }
    const sortBy = opts?.sortBy && prims.includes(opts.sortBy) ? opts.sortBy : prims[0];
    const out = [...groups].map(([k, values]) => ({ key: k, label: k, values })).sort((a, b) => (b.values[sortBy] ?? 0) - (a.values[sortBy] ?? 0));
    return opts?.limit ? out.slice(0, opts.limit) : out;
  },

  async validate(ctx) {
    const j = await fetchJson<any>(`${base(ctx)}/wp-json/wc/v3/system_status`, { headers: { authorization: auth(ctx) } });
    return { name: j?.settings?.store_id ? undefined : undefined, config: { currency: j?.settings?.currency } };
  },
};
