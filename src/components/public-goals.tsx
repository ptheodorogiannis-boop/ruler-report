// The public goals page (spec v3 §3.4): the client's mark, one card per goal with a progress ring, the situation,
// current / target / projection and the period. `PublicGoalsBody` is pure so it can be rendered in tests;
// `PublicGoals` adds the lookup and the password gate.
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Lock } from 'lucide-react';
import { ClientMark } from '@/components/client-mark';
import { Ring } from '@/components/infographic';
import { PlatformIcon } from '@/components/platform-icon';
import { UnlockClient } from '@/components/unlock-client';
import { goalsPageData, type GoalsPageData, type GoalsPageGoal } from '@/lib/services/goals-share';
import { goalsUnlockCookie } from '@/lib/share';
import { formatDisplayDate } from '@/lib/util/dates';
import { formatValue } from '@/lib/util/format';
import { localeForPublic } from '@/lib/i18n';
import { tr } from '@/lib/i18n/request';
import { setServerLocale } from '@/lib/i18n/server';

const SITUATION: Record<string, { label: string; cls: string }> = {
  high: { label: 'public.situationHigh', cls: 'bg-emerald-500' },
  ideal: { label: 'public.situationIdeal', cls: 'bg-emerald-400' },
  average: { label: 'public.situationAverage', cls: 'bg-amber-400' },
  low: { label: 'public.situationLow', cls: 'bg-red-500' },
  no_data: { label: 'public.situationNoData', cls: 'bg-slate-300' },
};

function GoalCard({ g, fmt, df }: { g: GoalsPageGoal; fmt: { currency: string; decimalSeparatorFormat: string }; df: string }) {
  const pr = g.progress;
  const sit = SITUATION[pr.situation] ?? SITUATION.no_data;
  const pct = pr.progressPct == null ? 0 : Math.max(0, Math.min(100, pr.progressPct));
  const n = (v: number | null | undefined) => (v == null ? '—' : formatValue(v, 'number', fmt));
  return (
    <article className="card flex gap-4 p-5" data-goal={g.id}>
      <Ring pct={pct} label={pr.progressPct == null ? '—' : `${Math.round(pct)}%`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="display truncate text-base font-semibold">{g.title}</h2>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
              <PlatformIcon slug={g.slug} size={14} />
              <span>
                {g.platform} · {g.frequency} · {g.direction === 'lower_better' ? 'stay under' : 'reach'} {n(g.target)}
              </span>
            </div>
          </div>
          <span className={`badge text-white ${sit.cls}`}>{tr(sit.label)}</span>
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-ink-3">{tr('public.now')}</dt>
            <dd className="num font-semibold">{n(pr.current)}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-ink-3">{tr('public.target')}</dt>
            <dd className="num font-semibold">{n(pr.target)}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-ink-3">{tr('public.projected')}</dt>
            <dd className="num font-semibold">{n(pr.estimatedEnd)}</dd>
          </div>
        </dl>
        <div className="mt-2 text-[11px] text-ink-3">
          {formatDisplayDate(pr.period.start, df)} – {formatDisplayDate(pr.period.end, df)}
          {pr.daysRemaining > 0 ? ` · ${tr('public.daysLeft', { count: pr.daysRemaining })}` : ''}
        </div>
      </div>
    </article>
  );
}

export function PublicGoalsBody({ data, embed, locale = 'en' }: { data: GoalsPageData; embed?: boolean; locale?: 'en' | 'el' }) {
  const { project, company, goals } = data;
  const style = { ['--brand' as string]: company.brandColor, ['--brand-soft' as string]: company.brandColor + '1a' } as React.CSSProperties;
  const fmt = { currency: project.currency, decimalSeparatorFormat: project.decimalSeparatorFormat };
  return (
    <div style={style} className="report-root min-h-screen" lang={locale}>
      {!embed && (
        <header className="dossier-head no-print border-b border-[var(--line)] bg-[var(--card)]">
          <div className="mx-auto flex max-w-[1080px] items-center justify-between px-4 py-3 md:px-8">
            {company.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logo} alt={company.name} className="h-7 max-w-[160px] object-contain" />
            ) : (
              <span className="display text-[15px] font-semibold">{company.name}</span>
            )}
          </div>
        </header>
      )}
      <main className="mx-auto max-w-[1080px] px-4 pb-16 pt-8 md:px-8 md:pt-12">
        <ClientMark name={project.name} logo={project.logo} color={company.brandColor} size={48} className="mb-3" />
        <div className="eyebrow text-brand">{project.name}</div>
        <h1 className="display mt-2 text-[clamp(28px,2.6vw,36px)] font-semibold leading-[1.05] tracking-[-0.02em]">{tr('public.goalsTitle')}</h1>
        <p className="mt-3 text-sm text-ink-2">{tr('public.goalsIntro')}</p>
        {goals.length === 0 ? (
          <p className="card mt-8 p-6 text-sm text-ink-2">{tr('public.noGoals')}</p>
        ) : (
          <div className="mt-8 grid gap-4 md:grid-cols-2" data-goals={goals.length}>
            {goals.map((g) => (
              <GoalCard key={g.id} g={g} fmt={fmt} df={project.dateFormat} />
            ))}
          </div>
        )}
        {!embed && !company.hidePoweredBy && <div className="mt-10 text-[11px] text-ink-3">{tr('common.poweredBy')}</div>}
      </main>
    </div>
  );
}

export async function PublicGoals({ token, embed, lang }: { token: string; embed?: boolean; lang?: string }) {
  const data = await goalsPageData(token);
  if (!data) notFound();
  const locale = localeForPublic(data.project, lang);
  setServerLocale(locale);
  const { project, company } = data;
  if (project.goalsPassword) {
    const ok = (await cookies()).get(`rr_gpw_${project.id}`)?.value === goalsUnlockCookie(project.id, project.goalsPassword);
    if (!ok) {
      const style = { ['--brand' as string]: company.brandColor, ['--brand-soft' as string]: company.brandColor + '1a' } as React.CSSProperties;
      return (
        <div className="flex min-h-screen items-center justify-center p-4" style={style} lang={locale}>
          <div className="card w-full max-w-sm p-7">
            <div className="eyebrow">{project.name}</div>
            <h1 className="display mt-1 text-2xl font-semibold">{tr('public.goalsTitle')}</h1>
            <p className="mt-3 flex items-center gap-1.5 text-sm text-ink-2">
              <Lock size={14} className="text-brand" aria-hidden="true" /> {tr('public.passwordProtected')}
            </p>
            <div className="mt-4">
              <UnlockClient token={token} kind="goals" lang={lang} embed={embed} labels={{ password: tr('public.password'), checking: tr('public.checking'), view: tr('public.view') }} />
            </div>
          </div>
        </div>
      );
    }
  }
  return <PublicGoalsBody data={data} embed={embed} locale={locale} />;
}
