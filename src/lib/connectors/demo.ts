// Deterministic synthetic data. Same integration + prim + date always yields the same number, so
// reports are reproducible, comparison periods are coherent, and the whole product is demo-able offline.
import { archetypeFor } from '@/lib/catalog/build';
import type { PrimSpec } from '@/lib/catalog/helpers';
import type { BreakdownRow, Campaign, Connector, ConnectorContext, DailyData, DailyFilter, DateRange } from '@/lib/engine/types';
import { isAdsSlug } from '@/lib/catalog/integrations';
import { diffDays, eachDay, parseDate } from '@/lib/util/dates';

function hash32(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rnd(seed: string) {
  let a = hash32(seed) + 0x6d2b79f5;
  a = Math.imul(a ^ (a >>> 15), a | 1);
  a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
  return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
}

const EPOCH = '2024-01-01';

const NAMES: Record<string, string[]> = {
  campaign: ['Brand – Search', 'Remarketing – BOFU', 'Prospecting – Lookalike 1%', 'Sales – Catalog', 'Leads – Instant Form', 'Video Views – Awareness', 'Engagement – Reels', 'Performance Max – All products', 'Competitors – Search', 'Seasonal Promo'],
  adset: ['Lookalike 1% Purchasers', 'Interest – Fitness', 'Broad – 25-54', 'Retargeting 30d', 'Dynamic Remarketing', 'Cart Abandoners', 'Newsletter Subscribers', 'Video Viewers 50%', 'Engaged IG 90d', 'Athens +25km', 'Cyprus – Women 28-45', 'Custom Audience – CRM'],
  ad: ['Image – Product hero', 'Image – Lifestyle', 'Carousel – Catalog', 'Video – 15s Reel', 'Video – UGC testimonial', 'Collection – New arrivals', 'Image – Offer 20%', 'Story – Behind the scenes', 'Carousel – Best sellers', 'Video – Founder story'],
  post: ['Reel – New collection', 'Carousel – 5 tips', 'Image – Behind the scenes', 'Story highlight – Offers', 'Reel – Customer story', 'Image – Product spotlight', 'Video – Tutorial', 'Carousel – Before / after', 'Reel – Trend remix', 'Image – Quote'],
  page: ['/', '/shop', '/about', '/contact', '/blog/how-to-choose', '/product/classic', '/product/premium', '/offers', '/blog/top-trends', '/cart', '/checkout', '/faq'],
  landing_page: ['/', '/offers', '/lp/spring-sale', '/product/classic', '/lp/consultation', '/shop', '/blog/guide'],
  query: ['brand name', 'brand name reviews', 'best running shoes', 'buy online greece', 'near me', 'price list', 'how to choose', 'discount code', 'opening hours', 'contact number', 'alternatives', 'vs competitor', 'official store', 'sizes guide', 'sale'],
  search_term: ['brand near me', 'open now', 'opening hours', 'phone number', 'reviews', 'directions', 'appointment', 'best in town'],
  product: ['Classic', 'Premium', 'Starter bundle', 'Limited edition', 'Gift card', 'Accessory set', 'Pro', 'Essentials', 'Travel size', 'Refill pack'],
  video: ['How it works', 'Customer story', 'Product tour', 'Behind the scenes', 'Tutorial #1', 'Tutorial #2', 'Announcement', 'Q&A live'],
};

function scaleFor(ctx: ConnectorContext) {
  return 0.55 + rnd(`scale:${ctx.integration.id}:${ctx.integration.sourceId}`) * 1.4;
}

// Six fixed campaigns per ads account (spec v3 §2.1); the shares are deterministic per integration id.
const DEMO_CAMPAIGNS: { name: string; status: Campaign['status'] }[] = [
  { name: 'Brand search', status: 'active' },
  { name: 'Prospecting – video', status: 'active' },
  { name: 'Retargeting – catalog', status: 'active' },
  { name: 'Spring launch', status: 'paused' },
  { name: 'Always-on – leads', status: 'active' },
  { name: 'Promo weekend', status: 'other' },
];
export function demoCampaigns(_integrationId: number): Campaign[] {
  return DEMO_CAMPAIGNS.map((c, i) => ({ id: `c${i + 1}`, name: c.name, status: c.status }));
}
const campaignWeights = (integrationId: number) => demoWeights(`camp:${integrationId}`, DEMO_CAMPAIGNS.length, 1.2);
const campaignIndex = (id: string) => (/^c[1-6]$/.test(id) ? Number(id.slice(1)) - 1 : -1);

/** Split a value across campaigns so the parts sum exactly to the total (largest remainder, in units of 10^-decimals). */
function allocate(total: number, weights: number[], decimals: number): number[] {
  const f = Math.pow(10, decimals);
  const units = Math.round(total * f);
  const raw = weights.map((w) => units * w);
  const parts = raw.map(Math.floor);
  let rest = units - parts.reduce((a, b) => a + b, 0);
  for (const o of raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac)) {
    if (rest <= 0) break;
    parts[o.i] += 1;
    rest--;
  }
  return parts.map((u) => u / f);
}
const decimalsOf = (spec: PrimSpec | undefined) => spec?.decimals ?? (spec?.int === false ? 2 : 0);

export function demoWeights(seedBase: string, n: number, skew = 1.1): number[] {
  const w = Array.from({ length: n }, (_, i) => (0.35 + rnd(`${seedBase}:${i}`)) / Math.pow(i + 1, skew));
  const t = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / t);
}

function dimCategories(slug: string, dimension: string): string[] {
  const arch = archetypeFor(slug);
  if (!arch) return [];
  if (arch.dims[dimension]) return arch.dims[dimension];
  const named = arch.namedDims?.[dimension];
  if (named) {
    const base = NAMES[dimension] ?? [];
    return Array.from({ length: named.count }, (_, i) => (base[i] ?? `${named.prefix} ${i + 1}`));
  }
  return [];
}

function primValue(ctx: ConnectorContext, specs: Record<string, PrimSpec>, prim: string, date: string, memo: Map<string, number>, scale: number): number {
  const mk = `${prim}|${date}`;
  const m = memo.get(mk);
  if (m !== undefined) return m;
  const spec = specs[prim];
  if (!spec) return 0;
  const id = ctx.integration.id;
  const n = rnd(`${id}:${prim}:${date}`);
  const vol = spec.vol ?? 0.15;
  const noise = 1 + (n - 0.5) * 2 * vol;
  const dow = parseDate(date).getUTCDay();
  const weekend = dow === 0 || dow === 6;
  let v: number;
  if (spec.stock) {
    const k = diffDays(EPOCH, date);
    const trendNoise = 1 + (rnd(`${id}:${prim}:${Math.floor(k / 3)}`) - 0.5) * 0.004;
    v = (spec.base ?? 1000) * scale * Math.exp((spec.growth ?? 0.001) * k) * trendNoise;
  } else if (spec.of) {
    v = primValue(ctx, specs, spec.of, date, memo, scale) * (spec.rate ?? 1) * noise;
  } else {
    const k = diffDays(EPOCH, date);
    const season = 1 + (spec.weekly ?? 0) * (weekend ? -1 : 0.4);
    const trend = 1 + 0.0009 * k * (rnd(`trend:${id}`) - 0.3) + 0.12 * Math.sin((k / 30) * Math.PI * 0.7 + rnd(`ph:${id}`) * 6);
    v = (spec.base ?? 1) * scale * season * trend * noise;
  }
  if (spec.min != null) v = Math.max(spec.min, v);
  if (spec.max != null) v = Math.min(spec.max, v);
  const dec = spec.decimals ?? (spec.int === false ? 2 : 0);
  const out = dec === 0 ? Math.max(0, Math.round(v)) : Math.max(0, Number(v.toFixed(dec)));
  memo.set(mk, out);
  return out;
}

function filterShare(slug: string, ctxId: number, filter: DailyFilter): number {
  const cats = dimCategories(slug, filter.dimension);
  const idx = Math.max(0, cats.indexOf(Array.isArray(filter.value) ? filter.value[0] : filter.value));
  if (!cats.length) return 1;
  return demoWeights(`filter:${ctxId}:${filter.dimension}`, cats.length, 1.6)[idx];
}

export const demoConnector: Connector = {
  id: 'demo',

  async daily(ctx, prims, range, filter, scopeIds) {
    const arch = archetypeFor(ctx.integration.slug);
    if (!arch) return {};
    const scale = scaleFor(ctx);
    const memo = new Map<string, number>();
    const out: DailyData = {};
    // a campaign scope (ids, or the legacy campaign filter) and the widget's own slice (a platform) both apply: the scope
    // allocates each day's value exactly, so scoped days add up to the account; the slice then takes its share of that
    const ads = isAdsSlug(ctx.integration.slug);
    const campaignIds = ads ? (scopeIds ?? (filter?.dimension === 'campaign' ? (Array.isArray(filter.value) ? filter.value : [filter.value]) : null)) : null;
    const slice = filter && filter.dimension !== 'campaign' ? filter : null;
    const share = slice ? filterShare(ctx.integration.slug, ctx.integration.id, slice) : 1;
    const cw = campaignIds ? campaignWeights(ctx.integration.id) : null;
    for (const date of eachDay(range)) {
      const row: Record<string, number> = {};
      for (const p of prims) {
        let v = primValue(ctx, arch.prims, p, date, memo, scale);
        if (campaignIds && cw && !arch.prims[p]?.stock) {
          const dec = decimalsOf(arch.prims[p]);
          const parts = allocate(v, cw, dec);
          v = Number(campaignIds.reduce((t, id) => t + (campaignIndex(id) >= 0 ? parts[campaignIndex(id)] : 0), 0).toFixed(dec));
        }
        if (slice && !arch.prims[p]?.stock) {
          const j = share * (0.88 + 0.24 * rnd(`fj:${ctx.integration.id}:${slice.value}:${p}`)); // platform-specific rates differ a little
          v = arch.prims[p]?.decimals ? Number((v * j).toFixed(arch.prims[p].decimals)) : Math.round(v * j);
        }
        row[p] = v;
      }
      out[date] = row;
    }
    return out;
  },

  async listCampaigns(ctx) {
    return isAdsSlug(ctx.integration.slug) ? demoCampaigns(ctx.integration.id) : [];
  },

  async breakdown(ctx, dimension, prims, range, opts) {
    const arch = archetypeFor(ctx.integration.slug);
    if (!arch) return [];
    if (dimension === 'campaign' && isAdsSlug(ctx.integration.slug)) {
      // the same shares the daily campaign filter uses, summed over the period, keyed by campaign id
      const list = demoCampaigns(ctx.integration.id);
      const w = campaignWeights(ctx.integration.id);
      const scale = scaleFor(ctx);
      const memo = new Map<string, number>();
      const sums = list.map(() => Object.fromEntries(prims.map((p) => [p, 0])) as Record<string, number>);
      for (const date of eachDay(range)) {
        for (const p of prims) {
          const spec = arch.prims[p];
          const v = primValue(ctx, arch.prims, p, date, memo, scale);
          const parts = spec?.stock ? list.map(() => v) : allocate(v, w, decimalsOf(spec));
          parts.forEach((x, i) => (sums[i][p] += x));
        }
      }
      const sortBy = opts?.sortBy && prims.includes(opts.sortBy) ? opts.sortBy : prims[0];
      const rows: BreakdownRow[] = list.map((c, i) => ({ key: c.id, label: c.name, values: Object.fromEntries(prims.map((p) => [p, Number(sums[i][p].toFixed(2))])) })).sort((a, b) => (b.values[sortBy] ?? 0) - (a.values[sortBy] ?? 0));
      const kept = opts?.campaignIds ? rows.filter((r) => opts.campaignIds!.includes(r.key)) : rows;
      return opts?.limit ? kept.slice(0, opts.limit) : kept;
    }
    const cats = dimCategories(ctx.integration.slug, dimension);
    if (!cats.length) return [];
    const scale = scaleFor(ctx);
    const memo = new Map<string, number>();
    // under a campaign scope every row is the scoped campaigns' share of the account (stock prims are not split)
    const cw = opts?.campaignIds && isAdsSlug(ctx.integration.slug) ? campaignWeights(ctx.integration.id) : null;
    const scopeShare = cw ? opts!.campaignIds!.reduce((t, id) => t + (campaignIndex(id) >= 0 ? cw[campaignIndex(id)] : 0), 0) : 1;
    const totals: Record<string, number> = {};
    for (const p of prims) {
      let t = 0;
      for (const date of eachDay(range)) t += primValue(ctx, arch.prims, p, date, memo, scale);
      totals[p] = arch.prims[p]?.stock ? t : t * scopeShare;
    }
    const named = !!arch.namedDims?.[dimension];
    const weights = demoWeights(`dim:${ctx.integration.id}:${dimension}`, cats.length, named ? 1.15 : dimension === 'hour' ? 0 : 0.9);
    // hour-of-day: a smooth daily curve instead of a power law
    const hourCurve = (i: number) => 0.35 + 0.65 * Math.max(0, Math.sin(((i - 5) / 24) * Math.PI * 1.15)) ** 1.4;
    const hw = dimension === 'hour' ? cats.map((_, i) => hourCurve(i)) : null;
    const hsum = hw ? hw.reduce((a, b) => a + b, 0) : 1;
    const rows: BreakdownRow[] = cats.map((label, i) => {
      const w = hw ? hw[i] / hsum : weights[i];
      const values: Record<string, number> = {};
      for (const p of prims) {
        const spec = arch.prims[p];
        const jitter = hw ? 1 : 0.75 + rnd(`row:${ctx.integration.id}:${dimension}:${label}:${p}`) * 0.5;
        const dec = spec?.decimals ?? 0;
        const v = totals[p] * w * jitter;
        values[p] = spec?.stock ? totals[p] : dec === 0 ? Math.round(v) : Number(v.toFixed(dec));
      }
      return { key: label, label, values };
    });
    const sortBy = opts?.sortBy && prims.includes(opts.sortBy) ? opts.sortBy : prims[0];
    if (dimension !== 'hour' && !(arch.dims[dimension] && ['age', 'device'].includes(dimension))) rows.sort((a, b) => (b.values[sortBy] ?? 0) - (a.values[sortBy] ?? 0));
    return opts?.limit ? rows.slice(0, opts.limit) : rows;
  },
};
