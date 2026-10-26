'use client';

import { useState } from 'react';
import { Bot, Send } from 'lucide-react';

export function AskBox({ reportId }: { reportId: number }) {
  const [q, setQ] = useState('');
  const [a, setA] = useState<{ answer: string; ai: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/v2/reports/${reportId}/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: q }) });
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
    <div className="no-print card p-4">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Bot size={15} className="text-brand" /> Ask your data
      </div>
      <form onSubmit={ask} className="flex gap-2">
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Which channel drove the most conversions? Why did spend go up?" />
        <button className="btn-primary" disabled={busy}>
          <Send size={14} /> {busy ? '…' : 'Ask'}
        </button>
      </form>
      {err && <div className="mt-2 text-sm text-red-600">{err}</div>}
      {a && (
        <div className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          {a.answer}
          <div className="mt-2 text-[11px] text-slate-400">{a.ai ? 'Answered by Claude from this report’s numbers.' : 'Keyword match (set ANTHROPIC_API_KEY for free-form answers).'}</div>
        </div>
      )}
    </div>
  );
}
