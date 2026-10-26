import { ReportIndex } from '@/components/report-index';

export const dynamic = 'force-dynamic';

export default async function DashboardsPage({ searchParams }: { searchParams: Promise<{ q?: string; project?: string; page?: string }> }) {
  const sp = await searchParams;
  return <ReportIndex kind="dashboard" {...sp} />;
}
