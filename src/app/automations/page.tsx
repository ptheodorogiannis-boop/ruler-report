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
  // every run still held (approval before send, or failed sources): the reports the client has not received yet
  const waiting = await db.automationRun.findMany({
    where: { status: 'held', automation: { project: { companyId: p.companyId, ...(p.projectIds ? { id: { in: p.projectIds } } : {}) } } },
    include: { automation: { include: { project: true } } },
    orderBy: { startedAt: 'desc' },
    take: 50,
  });
  const reports = waiting.length ? await db.report.findMany({ where: { id: { in: waiting.map((r) => r.reportId).filter((x): x is number => !!x) } }, select: { id: true, title: true } }) : [];
  return (
    <AppShell active="/automations">
      <PageHeader title={t('nav.automations')} subtitle={t('automations.indexSubtitle')} />
      {waiting.length > 0 && (
        <section className="card mb-6 p-5" aria-labelledby="waiting-title" data-waiting>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="waiting-title" className="block-title">
              {t('automations.waitingTitle')} <span className="num text-ink-3">{waiting.length}</span>
            </h2>
            <p className="text-sm text-ink-2">{t('automations.waitingIntro', { count: waiting.length })}</p>
          </div>
          <ul className="mt-4 divide-y divide-[var(--line)]">
            {waiting.map((r) => {
              const d = (r.detail ?? {}) as { review?: boolean; held?: string[] };
              const rep = reports.find((x) => x.id === r.reportId);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 py-3" data-waiting-run={r.id}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{rep?.title ?? r.automation.title}</div>
                    <div className="text-xs text-ink-3">
                      {r.automation.project.name}, {r.automation.title}, {r.startedAt.toISOString().slice(0, 10)}
                    </div>
                  </div>
                  <span className="badge bg-amber-50 text-amber-800">{d.review ? t('automations.waitingApproval') : t('automations.heldFailing')}</span>
                  {r.reportId && (
                    <Link href={`/reports/${r.reportId}`} className="btn">
                      {t('automations.openReport')}
                    </Link>
                  )}
                  {write && (
                    <form action={sendHeldRunAction}>
                      <input type="hidden" name="runId" value={r.id} />
                      <button className="btn-primary">{d.review && !d.held?.length ? t('automations.approveAndSend') : t('automations.sendNow')}</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
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
