import Link from 'next/link';
import { getT } from '@/lib/i18n/server';
import { AppShell, Empty, PageHeader } from '@/components/shell';
import { toggleAutomationAction, runAutomationAction, sendHeldRunAction } from '@/app/actions/app';
import { canWrite, requirePrincipal } from '@/lib/auth';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function AutomationsPage() {
  const { t } = await getT();
  const p = await requirePrincipal();
  const items = await db.automation.findMany({ where: { project: { companyId: p.companyId, ...(p.projectIds ? { id: { in: p.projectIds } } : {}) } }, include: { project: true, runs: { orderBy: { startedAt: 'desc' }, take: 3 } }, orderBy: { nextRunAt: 'asc' } });
  const write = canWrite(p);
  return (
    <AppShell active="/automations">
      <PageHeader title={t('nav.automations')} subtitle={t('automations.indexSubtitle')} />
      {items.length === 0 ? (
        <Empty title={t('automations.noneYet')} hint={t('automations.indexHint')} action={<Link href="/projects" className="btn-primary">{t('overview.goToProjects')}</Link>} />
      ) : (
        <div className="card divide-y divide-[var(--line)]">
          {items.map((a) => (
            <div key={a.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/projects/${a.projectId}?tab=automations`} className="font-medium hover:text-brand">
                    {a.title}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {a.project.name} · {a.frequency} · {(a.channels as string[]).join(', ')}
                  </div>
                </div>
                <span className={`badge ${a.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{a.enabled ? 'enabled' : 'disabled'}</span>
                <div className="w-44 text-right text-xs text-slate-500">next: {a.nextRunAt ? a.nextRunAt.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—'}</div>
                {write && (
                  <div className="flex gap-1">
                    <form action={runAutomationAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <button className="btn">{t('automations.runNow')}</button>
                    </form>
                    <form action={toggleAutomationAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <button className="btn">{a.enabled ? t('common.disable') : t('common.enable')}</button>
                    </form>
                  </div>
                )}
              </div>
              {a.runs.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-slate-400">
                  {a.runs.map((r) => (
                    <span key={r.id}>
                      {r.startedAt.toISOString().slice(0, 16).replace('T', ' ')} ·{' '}
                      <span className={r.status === 'ok' ? 'text-emerald-600' : r.status === 'held' || r.status === 'sending' ? 'text-amber-700' : 'text-red-600'}>{r.status}</span>
                      {r.status === 'held' && (
                        <form action={sendHeldRunAction} className="inline">
                          <input type="hidden" name="runId" value={r.id} />
                          <button className="link ml-1">{t('automations.sendNow')}</button>
                        </form>
                      )}
                      {r.reportId && (
                        <>
                          {' '}
                          · <Link href={`/reports/${r.reportId}`} className="text-brand">report #{r.reportId}</Link>
                        </>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
