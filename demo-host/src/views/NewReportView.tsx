// The new report / dashboard wizard (src/app/reports/new/page.tsx) in the browser: pick a client, then the app's own
// ReportBuilder, which creates the report through the demo's createReportAction.
import Link from 'next/link';
import { ReportBuilder } from '@/components/report-builder';
import { useT } from '@/components/i18n-provider';
import type { Locale } from '../bus';
import { loadNewReport, useLoaded, type NewReportData } from './load';
import { Loading, PageHeader } from './common';

export function NewReportView({ query, locale }: { query: string; locale: Locale }) {
  const { data: d } = useLoaded(() => loadNewReport(query), [query]);
  if (!d) return <Loading locale={locale} />;
  return <NewReport d={d} />;
}

/** The wizard page from loaded data (pure, so tests can render it). */
export function NewReport({ d }: { d: NewReportData }) {
  const t = useT();
  const { kind, project } = d;
  const heading = t(kind === 'report' ? 'reports.newReport' : 'reports.newDashboard');
  if (!project) {
    return (
      <div data-live-view="new-report">
        <PageHeader title={heading} subtitle={t('wizard.pickClient')} />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {d.projects.map((x) => (
            <Link key={x.id} href={`/reports/new?project=${x.id}&kind=${kind}`} className="card p-4 font-semibold transition hover:border-brand">
              {x.name}
            </Link>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div data-live-view="new-report">
      <PageHeader title={`${heading} · ${project.name}`} subtitle={kind === 'report' ? t('wizard.reportExplainer') : t('wizard.dashboardExplainer')} />
      <ReportBuilder key={`${kind}-${project.id}`} project={{ id: project.id, name: project.name, timezone: project.timezone }} templates={d.templates} integrations={d.integrations} kind={kind} />
    </div>
  );
}
