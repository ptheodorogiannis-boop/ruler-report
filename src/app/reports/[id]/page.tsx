import { InternalReport } from '@/components/report-page';

export const dynamic = 'force-dynamic';

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  return <InternalReport id={Number((await params).id)} kind="report" />;
}
