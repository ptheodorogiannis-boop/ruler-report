import { AppShell, PageHeader } from '@/components/shell';
import { getT } from '@/lib/i18n/server';
import { requirePrincipal } from '@/lib/auth';
import { getCatalog, toDefinition } from '@/lib/catalog/build';
import { CATEGORY_LABEL, INTEGRATIONS, getIntegrationDef } from '@/lib/catalog/integrations';

export const dynamic = 'force-dynamic';

const COMP: Record<string, string> = { number_v1: 'KPI', chart_v1: 'Chart', datatable_v1: 'Table', funnel_v1: 'Funnel' };

export default async function MetricsPage({ searchParams }: { searchParams: Promise<{ slug?: string; q?: string }> }) {
  const { t } = await getT();
  await requirePrincipal();
  const sp = await searchParams;
  const slug = getIntegrationDef(sp.slug ?? '') ? sp.slug! : 'facebook_ads';
  const def = getIntegrationDef(slug)!;
  const all = getCatalog(slug).map(toDefinition);
  const q = (sp.q ?? '').toLowerCase();
  const list = q ? all.filter((w) => `${w.reference_key} ${w.references.title}`.toLowerCase().includes(q)) : all;
  const total = INTEGRATIONS.filter((i) => i.archetype !== 'custom').reduce((a, i) => a + getCatalog(i.slug).length, 0);
  return (
    <AppShell active="/metrics">
      <PageHeader title={t('nav.metricCatalog')} subtitle={`${total.toLocaleString()} widgets across ${INTEGRATIONS.length} integrations. Same shape as Reportei’s /metrics endpoint: reference_key, component, metrics, dimensions, diff_type, tags.`} />
      <form className="mb-4 flex flex-wrap gap-2">
        <select name="slug" defaultValue={slug} className="input w-64">
          {Object.entries(CATEGORY_LABEL).map(([cat, label]) => (
            <optgroup key={cat} label={label}>
              {INTEGRATIONS.filter((i) => i.category === cat && i.archetype !== 'custom').map((i) => (
                <option key={i.slug} value={i.slug}>
                  {i.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <input name="q" defaultValue={sp.q} placeholder={t('common.searchPlaceholder')} className="input w-56" />
        <button className="btn">{t('common.show')}</button>
      </form>
      <div className="mb-2 text-sm text-slate-500">
        {def.name}: {list.length} widgets
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-[var(--line)] bg-slate-50/60">
            <tr>
              <th className="th">reference_key</th>
              <th className="th">{t('common.title')}</th>
              <th className="th">{t('common.type')}</th>
              <th className="th">{t('common.format')}</th>
              <th className="th">{t('metrics.deltaMeaning')}</th>
              <th className="th">{t('metrics.dimensions')}</th>
              <th className="th">{t('metrics.calculation')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {list.map((w) => (
              <tr key={w.reference_key} className="hover:bg-slate-50/50" title={w.references.description}>
                <td className="td font-mono text-xs">{w.reference_key}</td>
                <td className="td">{w.references.title}</td>
                <td className="td">
                  <span className="badge bg-slate-100 text-slate-600">{COMP[w.component]}</span>
                </td>
                <td className="td text-xs">{w.references.formatting_function}</td>
                <td className="td text-xs">{w.references.diff_type}</td>
                <td className="td text-xs text-slate-500">{(w.dimensions ?? []).map((d) => (typeof d === 'string' ? d : `${d.field}=${d.value.join(',')}`)).join(', ') || '—'}</td>
                <td className="td text-xs text-slate-500">{w.references.tags.calculation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
