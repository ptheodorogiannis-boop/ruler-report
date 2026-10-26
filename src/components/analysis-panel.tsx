'use client';

import { useState, useTransition } from 'react';
import { useT } from '@/components/i18n-provider';
import { useRouter } from 'next/navigation';
import { Bot, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { deleteAnalysisAction, generateAnalysisAction, saveAnalysisAction } from '@/app/actions/app';
import { MediaPicker } from './media-picker';
import { useAiLanguage } from '@/components/ai-language';
import { AI_LANGUAGES } from '@/lib/ai/language';

export interface CardView {
  id: string;
  title: string;
  html: string; // already sanitised on the server
  raw: string;
  author: 'human' | 'ai';
  /** per-block cards (spec v3 §4.4) */
  blockId?: string;
  tone?: string;
}

export function AnalysisPanel({ reportId, cards, editable }: { reportId: number; cards: CardView[]; editable: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [lang, setLang] = useAiLanguage();
  const [note, setNote] = useState<string | null>(null);

  const open = (c?: CardView) => {
    setEditing(c?.id ?? 'new');
    setTitle(c?.title ?? 'Analysis');
    setBody(c?.raw ?? '');
  };
  const save = () =>
    start(async () => {
      const r = await saveAnalysisAction({ reportId, cardId: editing === 'new' ? undefined : editing!, title, html: body });
      if (!r.ok) setNote(r.error);
      else {
        setEditing(null);
        router.refresh();
      }
    });

  return (
    <section className="space-y-3">
      {(cards.length > 0 || editable) && (
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{t('analysis.title')}</h2>
          {editable && (
            <div className="no-print flex flex-wrap items-center gap-2">
              <select className="input w-32 py-1" value={lang} onChange={(e) => setLang(e.target.value)} data-ai-language aria-label="AI language">
                {AI_LANGUAGES.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
              <button
                className="btn"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setNote(null);
                    const r = await generateAnalysisAction({ reportId, language: lang });
                    if (!r.ok) setNote(r.error);
                    else {
                      setNote(r.ai ? 'Written by Claude.' : 'Rule-based analysis (set ANTHROPIC_API_KEY for AI commentary).');
                      router.refresh();
                    }
                  })
                }
              >
                <Sparkles size={14} /> {pending ? t('analysis.working') : t('analysis.generate')}
              </button>
              <button className="btn" onClick={() => open()}>
                <Plus size={14} /> {t('analysis.write')}
              </button>
            </div>
          )}
        </div>
      )}
      {note && <div className="no-print rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-600">{note}</div>}
      {cards.map((c) => (
        <div key={c.id} className="card p-4">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              {c.author === 'ai' && <Bot size={14} className="text-brand" />}
              {c.title}
              {c.blockId && <span className="badge bg-slate-100 text-[10px] font-normal text-slate-500" title="Shown right after its block on the client link">{t('analysis.blockCard')}</span>}
            </div>
            {editable && (
              <div className="no-print flex gap-1">
                <button className="text-slate-400 hover:text-brand" onClick={() => open(c)} title="Edit">
                  <Pencil size={14} />
                </button>
                <button
                  className="text-slate-400 hover:text-red-500"
                  title="Delete"
                  onClick={() =>
                    confirm('Delete this card?') &&
                    start(async () => {
                      await deleteAnalysisAction({ reportId, cardId: c.id });
                      router.refresh();
                    })
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
          <div className="analysis" dangerouslySetInnerHTML={{ __html: c.html }} />
        </div>
      ))}
      {editing && (
        <div className="no-print card space-y-2 border-brand p-4">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Card title" />
          <textarea className="input min-h-[160px] font-mono text-xs" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your commentary. Plain text or simple HTML (h3, p, ul/li, strong, em, a)." />
          <div className="flex flex-wrap items-center gap-2">
            <MediaPicker label="Insert image" value={null} onChange={(m) => m && setBody((b) => `${b.trimEnd()}${b.trim() ? '\n' : ''}<img src="${m.url}" alt="">`)} />
            <span className="text-[11px] text-ink-3">{t('analysis.imageHint')}</span>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={pending} onClick={save}>
              {t('analysis.saveCard')}
            </button>
            <button className="btn" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
