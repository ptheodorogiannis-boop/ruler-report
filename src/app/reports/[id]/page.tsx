import { InternalReport } from '@/components/report-page';

export const dynamic = 'force-dynamic';
// the editor's period change re-pulls every source and rewrites the AI cards (src/lib/services/report-period.ts)
export const maxDuration = 60;

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  return <InternalReport id={Number((await params).id)} kind="report" />;
}
