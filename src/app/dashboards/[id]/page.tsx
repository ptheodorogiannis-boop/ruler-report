import { InternalReport } from '@/components/report-page';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({ params }: { params: Promise<{ id: string }> }) {
  return <InternalReport id={Number((await params).id)} kind="dashboard" />;
}
