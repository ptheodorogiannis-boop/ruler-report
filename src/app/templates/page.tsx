import Link from 'next/link';
import { getT } from '@/lib/i18n/server';
import { Copy, Plus } from 'lucide-react';
import { AppShell, PageHeader } from '@/components/shell';
import { duplicateTemplateAction } from '@/app/actions/app';
import { canWrite, requirePrincipal } from '@/lib/auth';
import { db } from '@/lib/db';
import type { TemplateSection } from '@/lib/engine/types';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const { t } = await getT();
  const p = await requirePrincipal();
  const templates = await db.template.findMany({ where: { OR: [{ companyId: null }, { companyId: p.companyId }] }, orderBy: [{ kind: 'asc' }, { isDefault: 'desc' }, { title: 'asc' }] });
  const write = canWrite(p);
  return (
    <AppShell active="/templates">
      <PageHeader
        title={t('nav.templates')}
        subtitle={t('templates.subtitle')}
        actions={
          write && (
            <>
              <Link href="/templates/new?kind=report" className="btn-primary">
                <Plus size={14} /> {t('templates.newReport')}
              </Link>
              <Link href="/templates/new?kind=dashboard" className="btn">
                <Plus size={14} /> {t('templates.newDashboard')}
              </Link>
            </>
          )
        }
      />
      {(['report', 'dashboard'] as const).map((kind) => (
        <section key={kind} className="mb-8">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">{kind === 'report' ? t('templates.reportTemplates') : t('templates.dashboardTemplates')}</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {templates
              .filter((tok) => tok.kind === kind)
              .map((tok) => {
                const sections = tok.sections as unknown as TemplateSection[];
                const widgets = sections.reduce((a, s) => a + s.widgets.length, 0);
                return (
                  <div key={tok.id} className="card flex flex-col p-4">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/templates/${tok.id}`} className="font-semibold hover:text-brand">
                        {tok.title}
                      </Link>
                      <div className="flex gap-1">
                        {tok.isDefault && <span className="badge bg-brand-soft text-brand">{t('templates.default')}</span>}
                        {tok.companyId == null && <span className="badge bg-slate-100 text-slate-500">{t('templates.builtIn')}</span>}
                      </div>
                    </div>
                    <p className="mt-1 flex-1 text-sm text-slate-500">{tok.description || '—'}</p>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                      <span>
                        {t('templates.stats', { sections: sections.length, widgets, used: tok.usedCount })}
                      </span>
                      {write && (
                        <form action={duplicateTemplateAction}>
                          <input type="hidden" name="id" value={tok.id} />
                          <button className="inline-flex items-center gap-1 text-slate-500 hover:text-brand">
                            <Copy size={12} /> {t('common.duplicate')}
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      ))}
    </AppShell>
  );
}
