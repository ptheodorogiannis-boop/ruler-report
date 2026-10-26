import { notFound } from 'next/navigation';
import { getT } from '@/lib/i18n/server';
import { AppShell, PageHeader } from '@/components/shell';
import { ConfirmButton } from '@/components/action-form';
import { TemplateEditor } from '@/components/template-editor';
import { deleteTemplateAction } from '@/app/actions/app';
import { canWrite, requirePrincipal } from '@/lib/auth';
import { CATEGORY_LABEL, INTEGRATIONS } from '@/lib/catalog/integrations';
import { db } from '@/lib/db';
import type { TemplateSection } from '@/lib/engine/types';

export const dynamic = 'force-dynamic';

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = await getT();
  const p = await requirePrincipal();
  const tpl = await db.template.findFirst({ where: { id: Number((await params).id), OR: [{ companyId: null }, { companyId: p.companyId }] } });
  if (!tpl) notFound();
  const readOnly = tpl.companyId == null || !canWrite(p);
  return (
    <AppShell active="/templates">
      <PageHeader
        title={tpl.title}
        subtitle={readOnly ? (tpl.companyId == null ? t('templates.builtInHint') : t('templates.readOnly')) : `${tpl.kind} template · used ${tpl.usedCount}×`}
        actions={
          !readOnly && (
            <form action={deleteTemplateAction}>
              <input type="hidden" name="id" value={tpl.id} />
              <ConfirmButton message={t('templates.confirmDelete')}>{t('common.delete')}</ConfirmButton>
            </form>
          )
        }
      />
      <TemplateEditor
        initial={{ id: tpl.id, title: tpl.title, description: tpl.description, kind: tpl.kind as 'report' | 'dashboard', sections: tpl.sections as unknown as TemplateSection[] }}
        slugs={[...INTEGRATIONS.map((i) => ({ slug: i.slug, name: i.name, category: CATEGORY_LABEL[i.category] })), { slug: 'custom', name: 'Blended metrics', category: 'Blended / custom formulas' }]}
        readOnly={readOnly}
      />
    </AppShell>
  );
}
