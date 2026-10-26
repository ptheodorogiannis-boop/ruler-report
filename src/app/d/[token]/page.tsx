import type { Metadata } from 'next';
import { PublicReport } from '@/components/public-report';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const r = await db.report.findFirst({ where: { shareToken: token, kind: 'dashboard', shareEnabled: true }, select: { title: true, subtitle: true, project: { select: { name: true } } } });
  if (!r) return { title: 'Dashboard' };
  const description = `${r.project.name}: ${r.subtitle}, live.`;
  return { title: r.title, description, alternates: { canonical: `/d/${token}` }, openGraph: { title: r.title, description, images: ['/opengraph-image'] }, twitter: { title: r.title, description, images: ['/opengraph-image'] } };
}

export default async function PublicDashboardPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ embed?: string; preset?: string; compare?: string; print?: string; layout?: string; lang?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  // the picker form always sends `preset`, so a missing `compare` then means unticked; a plain link keeps the comparison
  return <PublicReport token={token} kind="dashboard" embed={sp.embed === '1'} preset={sp.preset} compare={sp.preset ? sp.compare === '1' : sp.compare !== '0'} print={sp.print} layout={sp.layout} lang={sp.lang} />;
}
