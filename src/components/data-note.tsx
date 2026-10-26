// "About these numbers" on client pages (spec v3 §1.4): a no-JS <details> in each block header on screen, numbered
// footnotes under the cover's sources in print. Server components.
import type { CampaignScopeInfo, SourceStatus } from '@/lib/engine/types';
import { dataNote } from '@/lib/catalog/data-notes';
import { getRequestLocale, tr } from '@/lib/i18n/request';

/** Sentences about the campaign scope a block or account used (spec v3 §2.2). */
export function campaignNotes(info?: { names: string[]; missing: number; scope?: { mode: string; ids?: string[] }; unresolved?: boolean }): string[] {
  if (!info) return [];
  const out: string[] = [];
  if (info.unresolved && info.scope?.mode === 'pick') out.push(tr('public.campaignsUnresolved', { count: info.scope.ids?.length ?? 0 }));
  else if (info.names.length) out.push(tr('public.campaignsNote', { names: info.names.join(', ') }));
  else if (info.scope && info.scope.mode !== 'all') out.push(tr(info.scope.mode === 'pick' ? 'public.noneSelectedExists' : 'public.noScopeMatch'));
  if (info.missing > 0) out.push(tr(info.missing === 1 ? 'public.missingOne' : 'public.missingMany', { count: info.missing }));
  return out;
}

export function DataNote({ slug, config, className, campaigns }: { slug: string; config?: Record<string, unknown> | null; className?: string; campaigns?: CampaignScopeInfo }) {
  const notes = [...campaignNotes(campaigns), ...dataNote(slug, config, getRequestLocale())];
  return (
    <details className={`data-note no-print${className ? ` ${className}` : ''}`}>
      <summary aria-label={tr('public.aboutNumbers')} title={tr('public.aboutNumbers')}>
        i
      </summary>
      <div className="data-note-body">
        <div className="eyebrow mb-1">{tr('public.aboutNumbers')}</div>
        <ul>
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </div>
    </details>
  );
}

/** Print only: one numbered footnote per source, in the order of the cover's "Sources" list. */
export function DataFootnotes({ sources }: { sources: Pick<SourceStatus, 'integrationId' | 'slug' | 'platform' | 'campaignNames' | 'missingCampaigns' | 'campaigns' | 'campaignsUnresolved'>[] }) {
  if (!sources.length) return null;
  return (
    <ol className="print-only data-footnotes">
      {sources.map((s, i) => (
        <li key={s.integrationId}>
          <span className="num">[{i + 1}]</span> <strong>{s.platform}</strong>: {[...campaignNotes(s.campaigns ? { names: s.campaignNames ?? [], missing: s.missingCampaigns ?? 0, scope: s.campaigns, unresolved: s.campaignsUnresolved } : undefined), ...dataNote(s.slug, null, getRequestLocale())].join(' ')}
        </li>
      ))}
    </ol>
  );
}
