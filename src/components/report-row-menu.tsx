'use client';

// The "⋯" menu of a reports-list row (docs/superpowers/specs/2026-11-04-editor-report-management-design.md §1): active rows
// open, duplicate and archive; archived rows restore or delete for good, the latter only once the report's name is typed.
import Link from 'next/link';
import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useT } from '@/components/i18n-provider';
import { archiveReportAction, deleteReportAction, duplicateReportAction, restoreReportAction } from '@/app/actions/app';

const ITEM = 'flex w-full items-center rounded px-2 py-1.5 text-left text-sm hover:bg-slate-50';

export function ReportRowMenu({ id, title, href, archived }: { id: number; title: string; href: string; archived: boolean }) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const hidden = <input type="hidden" name="id" value={id} />;
  return (
    <div className="relative">
      <details data-row-menu className="rmenu">
        <summary className="btn px-2 py-1" aria-label={t('reports.rowMenu')}>
          <MoreHorizontal size={14} />
        </summary>
        <div className="card rmenu-pop absolute right-0 top-full z-40 mt-1 w-56 p-1">
          {archived ? (
            <>
              <form action={restoreReportAction}>
                {hidden}
                <button className={ITEM}>{t('reports.restore')}</button>
              </form>
              <button type="button" className={`${ITEM} text-red-600`} onClick={() => setConfirming(true)}>
                {t('reports.deleteForever')}
              </button>
            </>
          ) : (
            <>
              <Link href={href} className={ITEM}>
                {t('common.open')}
              </Link>
              <form action={duplicateReportAction}>
                {hidden}
                <button className={ITEM}>{t('common.duplicate')}</button>
              </form>
              <form action={archiveReportAction}>
                {hidden}
                <button className={ITEM}>{t('reports.archive')}</button>
              </form>
            </>
          )}
        </div>
      </details>
      {confirming && (
        <form action={deleteReportAction} className="card rmenu-pop absolute right-0 top-full z-50 mt-1 w-72 space-y-2 p-3" data-delete-dialog>
          {hidden}
          <label className="block text-xs text-ink-2" htmlFor={`del-${id}`}>
            {t('reports.deleteConfirm', { name: title })}
          </label>
          <input id={`del-${id}`} name="name" className="input" autoFocus autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} data-delete-name />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => (setConfirming(false), setTyped(''))}>
              {t('common.cancel')}
            </button>
            <button className="btn-danger" disabled={typed !== title} data-delete-confirm>
              {t('reports.deleteForever')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
