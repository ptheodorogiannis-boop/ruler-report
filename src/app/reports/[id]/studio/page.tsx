import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell, PageHeader } from '@/components/shell';
import { StudioDeck } from '@/components/studio-deck';
import { requirePrincipal } from '@/lib/auth';
import { db } from '@/lib/db';
import { studioDeck } from '@/lib/ai/insights';
import { reportView } from '@/lib/layout/service';

export const dynamic = 'force-dynamic';

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const p = await requirePrincipal();
  const { id } = await params;
  const r = await db.report.findFirst({ where: { id: Number(id), kind: 'report', companyId: p.companyId, ...(p.projectIds ? { projectId: { in: p.projectIds } } : {}) }, include: { project: true } });
  if (!r) notFound();
  const { slides, ai } = await studioDeck((await reportView(r)).data, r.project.name);
  return (
    <AppShell active="/reports">
      <PageHeader
        title="Studio"
        subtitle={
          <>
            Presentation built from <Link href={`/reports/${r.id}`} className="font-semibold text-brand">{r.title}</Link> · {ai ? 'insights written by Claude' : 'rule-based insights'}
          </>
        }
      />
      <StudioDeck slides={slides} title={r.title} />
    </AppShell>
  );
}
