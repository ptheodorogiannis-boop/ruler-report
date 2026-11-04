import Link from 'next/link';
import { getT } from '@/lib/i18n/server';
import { AppShell, Empty, PageHeader } from '@/components/shell';
import { evaluateGoalsAction } from '@/app/actions/app';
import { canWrite, requirePrincipal } from '@/lib/auth';
import { db } from '@/lib/db';
import { goalProgress } from '@/lib/services/goals';
import { formatValue } from '@/lib/util/format';

export const dynamic = 'force-dynamic';

const COLORS: Record<string, string> = { high: 'bg-emerald-500', ideal: 'bg-emerald-400', average: 'bg-amber-400', low: 'bg-red-500', no_data: 'bg-slate-300' };
/** A goal's standing as quiet text in the colour of its meaning (the bar beside it carries the fill). */
const SITUATION: Record<string, { label: string; tone: string }> = {
  high: { label: 'public.situationHigh', tone: 'text-up' },
  ideal: { label: 'public.situationIdeal', tone: 'text-up' },
  average: { label: 'public.situationAverage', tone: 'text-[var(--warning)]' },
  low: { label: 'public.situationLow', tone: 'text-down' },
  no_data: { label: 'public.situationNoData', tone: 'text-ink-3' },
};


export default async function GoalsPage() {
  const { t } = await getT();
  const p = await requirePrincipal();
  const goals = await db.goal.findMany({ where: { project: { companyId: p.companyId, ...(p.projectIds ? { id: { in: p.projectIds } } : {}) } }, include: { integration: { include: { project: true } } } });
  const prog = await Promise.all(goals.map((g) => goalProgress(g as any).catch(() => null)));
  const rows = goals.map((g, i) => ({ g, pr: prog[i] })).sort((a, b) => ['low', 'average', 'ideal', 'high', 'no_data'].indexOf(a.pr?.situation ?? 'no_data') - ['low', 'average', 'ideal', 'high', 'no_data'].indexOf(b.pr?.situation ?? 'no_data'));
  return (
    <AppShell active="/goals">
      <PageHeader
        title={t('nav.goals')}
        subtitle={t('goals.indexSubtitle')}
        actions={
          canWrite(p) && (
            <form action={evaluateGoalsAction}>
              <button className="btn">{t('goals.evaluateNow')}</button>
            </form>
          )
        }
      />
      {rows.length === 0 ? (
        <Empty title={t('goals.noneTitle')} hint={t('goals.indexHint')} />
      ) : (
        <div className="card divide-y divide-[var(--line)]">
          {rows.map(({ g, pr }) => (
            <div key={g.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{g.title}</div>
                <Link href={`/projects/${g.projectId}?tab=goals`} className="text-xs text-slate-500 hover:text-brand">
                  {g.integration.project.name} · {g.frequency === 'weekly' ? t('automations.weekly') : t('automations.monthly')}
                </Link>
              </div>
              <div className="w-56">
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full ${COLORS[pr?.situation ?? 'no_data']}`} style={{ width: `${Math.min(100, pr?.progressPct ?? 0)}%` }} />
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                  <span>{pr?.current != null ? formatValue(pr.current, 'number') : '—'} / {formatValue(g.target, 'number')}</span>
                  <span>{pr?.progressPct ?? 0}%</span>
                </div>
              </div>
              <span className={`w-32 text-right text-sm font-medium ${SITUATION[pr?.situation ?? 'no_data'].tone}`}>{t(SITUATION[pr?.situation ?? 'no_data'].label)}</span>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
