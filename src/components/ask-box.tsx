'use client';

import { useState } from 'react';
import { Bot, Send } from 'lucide-react';
import { useT } from '@/components/i18n-provider';

/** "Ask your data" for the agency: a free question about this report, with up to three suggested ones (spec 2026-11-04 editor §6). */
export function AskBox({ reportId, suggestions = [] }: { reportId: number; suggestions?: string[] }) {
  const t = useT();
  const [q, setQ] = useState('');
  const [a, setA] = useState<{ answer: string; ai: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function ask(question: string) {
    if (question.trim().length < 2) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/v2/reports/${reportId}/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? 'Request failed');
      setA(j);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="no-print card p-4" data-ask-box>
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Bot size={15} className="text-brand" /> {t('askbox.title')}
      </div>
      {suggestions.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button key={s} type="button" className="btn px-3 py-1 text-xs" disabled={busy} onClick={() => (setQ(s), void ask(s))} data-ask-suggestion>
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(q);
        }}
        className="flex gap-2"
      >
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('askbox.placeholder')} aria-label={t('askbox.title')} />
        <button className="btn-primary" disabled={busy}>
          <Send size={14} /> {busy ? '…' : t('askbox.ask')}
        </button>
      </form>
      {err && <div className="mt-2 text-sm text-red-600">{err}</div>}
      {a && (
        <div className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          {a.answer}
          <div className="mt-2 text-[11px] text-slate-400">{a.ai ? t('askbox.byClaude') : t('askbox.keyword')}</div>
        </div>
      )}
    </div>
  );
}
