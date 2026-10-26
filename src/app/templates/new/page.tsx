import { notFound } from 'next/navigation';
import { AppShell, PageHeader } from '@/components/shell';
import { TemplateEditor } from '@/components/template-editor';
import { canWrite, requirePrincipal } from '@/lib/auth';
import { CATEGORY_LABEL, INTEGRATIONS } from '@/lib/catalog/integrations';

export default async function NewTemplate({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const p = await requirePrincipal();
  if (!canWrite(p)) notFound();
  const kind = (await searchParams).kind === 'dashboard' ? 'dashboard' : 'report';
  return (
    <AppShell active="/templates">
      <PageHeader title={`New ${kind} template`} />
      <TemplateEditor initial={{ title: '', description: '', kind, sections: [] }} slugs={[...INTEGRATIONS.map((i) => ({ slug: i.slug, name: i.name, category: CATEGORY_LABEL[i.category] })), { slug: 'custom', name: 'Blended metrics', category: 'Blended / custom formulas' }]} />
    </AppShell>
  );
}
