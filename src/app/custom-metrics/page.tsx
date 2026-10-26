import { AppShell, Empty, PageHeader } from '@/components/shell';
import { getT } from '@/lib/i18n/server';
import { ActionForm, ConfirmButton } from '@/components/action-form';
import { deleteCustomMetricAction, saveCustomMetricAction } from '@/app/actions/app';
import { canWrite, requirePrincipal } from '@/lib/auth';
import { db } from '@/lib/db';
import { INTEGRATIONS } from '@/lib/catalog/integrations';

export const dynamic = 'force-dynamic';

export default async function CustomMetricsPage() {
  const { t } = await getT();
  const p = await requirePrincipal();
  const items = await db.customMetric.findMany({ where: { companyId: p.companyId }, orderBy: { createdAt: 'desc' } });
  const prefixes = INTEGRATIONS.filter((i) => ['ads', 'ecommerce', 'analytics', 'crm', 'calls'].includes(i.category)).map((i) => i.prefix);
  return (
    <AppShell active="/custom-metrics">
      <PageHeader title={t('nav.blendedMetrics')} subtitle="Formulas across networks, e.g. blended ROAS = (Meta + Google conversion value) ÷ (Meta + Google spend). Add them to any template via the “Blended metrics” source." />
      {canWrite(p) && (
        <ActionForm action={saveCustomMetricAction} submit={t('metrics.save')} className="card mb-6 grid gap-3 p-4 md:grid-cols-4">
          <div>
            <label className="label">{t('common.name')}</label>
            <input name="name" className="input" required placeholder={t('metrics.namePlaceholder')} />
          </div>
          <div className="md:col-span-2">
            <label className="label">{t('metrics.formula')}</label>
            <input name="formula" className="input font-mono text-xs" required placeholder="({fb_ads:spend} + {gads:spend}) / ({fb_ads:leads} + {gads:leads})" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">{t('common.format')}</label>
              <select name="format" className="input">
                {['number', 'currency', 'percent', 'decimal'].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t('metrics.upIs')}</label>
              <select name="diff" className="input">
                <option value="positive_good">{t('metrics.good')}</option>
                <option value="positive_bad">{t('metrics.bad')}</option>
                <option value={t('metrics.neutral')}>{t('metrics.neutral')}</option>
              </select>
            </div>
          </div>
          <div className="text-xs text-slate-500 md:col-span-4">
            {t('metrics.referenceAs')} <code>{'{prefix:key}'}</code>. Values from every connected account with that prefix are summed first, so use additive metrics (spend, leads, revenue, conversions). Operators + − × ÷ ( ), functions sum/avg/min/max/abs/round. Prefixes: {prefixes.join(', ')}.
          </div>
        </ActionForm>
      )}
      {items.length === 0 ? (
        <Empty title={t('metrics.noneTitle')} />
      ) : (
        <div className="card divide-y divide-[var(--line)]">
          {items.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{m.name}</div>
                <code className="text-xs text-slate-500">{m.formula}</code>
              </div>
              <span className="badge bg-slate-100 text-slate-600">{m.format}</span>
              {canWrite(p) && (
                <form action={deleteCustomMetricAction}>
                  <input type="hidden" name="id" value={m.id} />
                  <ConfirmButton message={t('metrics.confirmDelete')}>{t('common.delete')}</ConfirmButton>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
