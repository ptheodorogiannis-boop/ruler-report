import type { Metadata } from 'next';
import { PublicReport } from '@/components/public-report';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const r = await db.report.findFirst({ where: { shareToken: token, kind: 'report', shareEnabled: true }, select: { title: true, subtitle: true, startDate: true, endDate: true, project: { select: { name: true } } } });
  if (!r) return { title: 'Report' };
  const description = `${r.project.name}: ${r.subtitle}, ${r.startDate} to ${r.endDate}.`;
  return { title: r.title, description, alternates: { canonical: `/r/${token}` }, openGraph: { title: r.title, description, images: ['/opengraph-image'] }, twitter: { title: r.title, description, images: ['/opengraph-image'] } };
}

export default async function PublicReportPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ embed?: string; print?: string; layout?: string; lang?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  return <PublicReport token={token} kind="report" embed={sp.embed === '1'} print={sp.print} layout={sp.layout} lang={sp.lang} />;
}
