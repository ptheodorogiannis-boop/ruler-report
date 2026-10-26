// "Overview": headline KPIs across every project on one screen, plus anomaly flags.
import { findWidget } from '@/lib/catalog/build';
import { INTEGRATIONS } from '@/lib/catalog/integrations';
import { db } from '@/lib/db';
import { FetchSession, resolveWidget } from '@/lib/engine/resolve';
import { toCtx } from '@/lib/engine/report';
import type { Principal } from '@/lib/auth';
import { addDays, presetRange, previousPeriod, today } from '@/lib/util/dates';
import { detectAnomaly, type Anomaly } from './anomaly';

const bySlugs = (cat: string) => INTEGRATIONS.filter((i) => i.category === cat).map((i) => i.slug);
export const OVERVIEW_KPIS = [
  { id: 'spend', labelKey: 'overview.kpiSpend', slugs: bySlugs('ads'), key: 'spend', format: 'currency' as const, goodUp: false },
  { id: 'conversions', labelKey: 'overview.kpiConversions', slugs: bySlugs('ads'), key: 'conversions', format: 'number' as const, goodUp: true },
  { id: 'sessions', labelKey: 'overview.kpiSessions', slugs: bySlugs('analytics'), key: 'sessions', format: 'number' as const, goodUp: true },
  { id: 'revenue', labelKey: 'overview.kpiRevenue', slugs: bySlugs('ecommerce'), key: 'revenue', format: 'currency' as const, goodUp: true },
  { id: 'leads', labelKey: 'overview.kpiLeads', slugs: bySlugs('crm'), key: 'leads', format: 'number' as const, goodUp: true },
  { id: 'calls', labelKey: 'overview.kpiCalls', slugs: bySlugs('calls'), key: 'calls', format: 'number' as const, goodUp: true },
];

export interface OverviewRow {
  project_id: number;
  name: string;
  logo: string | null;
  currency: string;
  integrations: number;
  broken: number;
  kpis: Record<string, { value: number | null; change_pct: number | null } | null>;
  anomalies: ({ metric: string } & Anomaly)[];
}

const cache = new Map<string, { at: number; rows: OverviewRow[] }>();

export async function companyOverview(p: Principal, days = 30, onlyProjectId?: number): Promise<{ range: { start: string; end: string }; rows: OverviewRow[] }> {
  const range = (() => {
    const r = presetRange('last_30d');
    const end = addDays(today('UTC'), -1);
    return { start: addDays(end, -(days - 1)), end: r.end > end ? end : r.end };
  })();
  const comp = previousPeriod(range);
  const ck = `${onlyProjectId ?? ''}|${p.companyId}|${p.projectIds?.join(',') ?? '*'}|${range.start}|${range.end}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < 5 * 60_000) return { range, rows: hit.rows };

  const projects = await db.project.findMany({ where: { companyId: p.companyId, AND: [p.projectIds ? { id: { in: p.projectIds } } : {}, onlyProjectId ? { id: onlyProjectId } : {}] }, include: { integrations: { where: { status: 'active' } } }, orderBy: { name: 'asc' } });
  const rows: OverviewRow[] = [];
  for (const proj of projects) {
    const session = new FetchSession();
    const row: OverviewRow = { project_id: proj.id, name: proj.name, logo: proj.logo, currency: proj.currency, integrations: proj.integrations.length, broken: proj.integrations.filter((i) => i.lastError || i.health === 'failing' || i.health === 'expiring').length, kpis: {}, anomalies: [] };
    for (const k of OVERVIEW_KPIS) {
      let value: number | null = null;
      let prev: number | null = null;
      let found = false;
      for (const i of proj.integrations) {
        if (!k.slugs.includes(i.slug)) continue;
        const ctx = toCtx(i, proj);
        const w = findWidget(i.slug, k.key, ctx.config as any);
        if (!w) continue;
        const v = await resolveWidget({ integration: ctx, widget: w, range, comparison: comp, session });
        if (v.type === 'number') {
          found = true;
          value = (value ?? 0) + (v.value ?? 0);
          prev = (prev ?? 0) + (v.comparison?.value ?? 0);
        }
      }
      row.kpis[k.id] = found ? { value, change_pct: prev == null || value == null ? null : prev === 0 ? null : Math.round(((value - prev) / Math.abs(prev)) * 1000) / 10 } : null;
    }
    // anomaly check on the first ads + web integration's daily series (last 28 days)
    for (const [slug, key, label] of [['facebook_ads', 'spend_by_date', 'Meta spend'], ['google_analytics_4', 'sessions_by_date', 'Sessions'], ['google_adwords', 'spend_by_date', 'Google Ads spend']] as const) {
      const i = proj.integrations.find((x) => x.slug === slug);
      if (!i) continue;
      const ctx = toCtx(i, proj);
      const w = findWidget(slug, key, ctx.config as any);
      if (!w) continue;
      const v = await resolveWidget({ integration: ctx, widget: w, range: { start: addDays(range.end, -27), end: range.end }, session: new FetchSession() });
      if (v.type === 'chart') {
        const a = detectAnomaly(v.series[0]);
        if (a) row.anomalies.push({ metric: label, ...a });
      }
    }
    rows.push(row);
  }
  cache.set(ck, { at: Date.now(), rows });
  return { range, rows };
}
