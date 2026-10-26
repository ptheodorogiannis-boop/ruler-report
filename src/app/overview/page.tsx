import Link from 'next/link';
import { getT } from '@/lib/i18n/server';
import { ClientMark } from '@/components/client-mark';
import { ArrowRight } from 'lucide-react';
import { AppShell, Empty, PageHeader } from '@/components/shell';
import { RulerBand } from '@/components/ruler-band';
import { Delta, caliper } from '@/components/widgets';
import { requirePrincipal } from '@/lib/auth';
import { companyOverview, OVERVIEW_KPIS } from '@/lib/services/overview';
import { formatValue } from '@/lib/util/format';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * The board (docs/DESIGN.md › Structure pass): every client is a rail across the page, its headline numbers read off
 * the rail as instrument readouts. No cards, no table chrome: hairlines, display numerals and the caliper on hover.
 */
export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { t } = await getT();
  const p = await requirePrincipal();
  const sp = await searchParams;
  const days = [7, 14, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const { range, rows } = await companyOverview(p, days);
  const projects = await db.project.findMany({ where: { companyId: p.companyId, ...(p.projectIds ? { id: { in: p.projectIds } } : {}) }, select: { id: true, decimalSeparatorFormat: true, dateFormat: true } });
  const dec = new Map(projects.map((x) => [x.id, x.decimalSeparatorFormat]));
  const anomalies = rows.flatMap((r) => r.anomalies.map((a) => ({ project: r.name, id: r.project_id, ...a })));
  const broken = rows.filter((r) => r.broken > 0);
  const prevLen = days;
  const comparison = { start: addDays(range.start, -prevLen), end: addDays(range.start, -1) };

  return (
    <AppShell active="/overview">
      <PageHeader
        title={rows.length === 1 ? t('overview.clientLast', { days }) : t('overview.clientsLast', { count: rows.length, days })}
        subtitle={t('overview.subtitle')}
        actions={
          <div className="segments" role="group" aria-label={t('common.period')}>
            {[7, 14, 30, 90].map((d) => (
              <Link key={d} href={`/overview?days=${d}`} aria-current={days === d ? 'page' : undefined} className={days === d ? 'is-active' : ''}>
                {d}d
              </Link>
            ))}
          </div>
        }
      />
      <RulerBand range={range} comparison={comparison} size="sm" dateFormat={projects[0]?.dateFormat} className="mb-12 max-w-3xl" />

      {(anomalies.length > 0 || broken.length > 0) && (
        <section className="notes mb-8" aria-label={t('overview.needsAttention')}>
          <h2 className="eyebrow mb-2">{t('overview.needsAttention')}</h2>
          <ul className="notes-list">
            {anomalies.map((a, i) => (
              <li key={`a${i}`}>
                <Link href={`/projects/${a.id}`} className="link font-semibold">
                  {a.project}
                </Link>{' '}
                · {a.metric} {a.direction === 'drop' ? 'dropped' : 'spiked'} <span className="num">{Math.abs(a.pctVsMean)}%</span> {t('overview.vsAverage')}
              </li>
            ))}
            {broken.map((r) => (
              <li key={`b${r.project_id}`} className="text-down">
                <Link href={`/projects/${r.project_id}?tab=integrations`} className="link font-semibold">
                  {r.name}
                </Link>{' '}
                · {r.broken} {r.broken === 1 ? t('overview.attentionOne') : t('overview.attentionMany')}
              </li>
            ))}
          </ul>
        </section>
      )}

      {rows.length === 0 ? (
        <Empty title={t('overview.noProjects')} hint={t('overview.noProjectsHint')} action={<Link href="/projects" className="btn-primary">{t('overview.goToProjects')}</Link>} />
      ) : (
        <section aria-label={t('overview.clients')}>
          <h2 className="sr-only">{t('overview.clients')}</h2>
          <div className="board-scroll"><table className="board">
            <thead>
              <tr>
                <th scope="col">{t('overview.client')}</th>
                {OVERVIEW_KPIS.map((k) => (
                  <th key={k.id} scope="col">
                    {t(k.labelKey)}
                  </th>
                ))}
                <th scope="col">
                  <span className="sr-only">{t('common.open')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.project_id} className="board-row">
                  <th scope="row" className="board-client">
                    <span className="flex items-center gap-3">
                      <ClientMark name={r.name} logo={r.logo} size={32} />
                      <span className="min-w-0">
                        <Link href={`/projects/${r.project_id}`} className="display board-name">
                          {r.name}
                        </Link>
                        <span className="board-sub num">
                          {r.integrations} {r.integrations === 1 ? 'account' : 'accounts'}
                        </span>
                      </span>
                    </span>
                  </th>
                  {OVERVIEW_KPIS.map((k) => {
                    const v = r.kpis[k.id];
                    const diff = k.goodUp ? 'positive_good' : 'neutral';
                    // the overview rows carry value + change %, so the previous value is reconstructed for the caliper
                    const prev = v && v.value != null && v.change_pct != null && v.change_pct !== -100 ? v.value / (1 + v.change_pct / 100) : null;
                    const cal = v ? caliper(v.value, prev, diff) : null;
                    return (
                      <td key={k.id} className="board-cell">
                        {v ? (
                          <div className="readout">
                            <span className="readout-value display num">{formatValue(v.value, k.format, { currency: r.currency, decimalSeparatorFormat: dec.get(r.project_id) })}</span>
                            <span className="readout-delta">
                              <Delta pct={v.change_pct} diff={diff} />
                            </span>
                            {cal && (
                              <span className={`caliper caliper-xs ${cal.tone}`} style={{ ['--prev' as any]: cal.prev, ['--cur' as any]: cal.cur }} aria-hidden="true">
                                <span className="caliper-track" />
                                <span className="caliper-bracket" />
                                <span className="caliper-prev" />
                                <span className="caliper-cur" />
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="board-go">
                    <Link href={`/projects/${r.project_id}`} aria-label={`Open ${r.name}`} className="board-arrow">
                      <ArrowRight size={18} aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>
      )}
    </AppShell>
  );
}

function addDays(s: string, n: number) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
