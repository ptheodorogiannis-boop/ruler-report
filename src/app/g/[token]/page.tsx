import type { Metadata } from 'next';
import { PublicGoals } from '@/components/public-goals';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const p = await db.project.findUnique({ where: { goalsToken: token }, select: { name: true } });
  if (!p) return { title: 'Goals' };
  const title = `${p.name} · Goals`;
  const description = `${p.name}: progress against the agreed targets, live.`;
  return { title, description, alternates: { canonical: `/g/${token}` }, openGraph: { title, description, images: ['/opengraph-image'] }, twitter: { title, description, images: ['/opengraph-image'] } };
}

export default async function PublicGoalsPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ embed?: string; lang?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  return <PublicGoals token={token} embed={sp.embed === '1'} lang={sp.lang} />;
}
