'use client';

// The client Ask tile on a shared link (docs/superpowers/specs/2026-11-04-map-search-ask-layout-design.md §3): up to three
// suggested questions built from the report's own metrics, a question field (300 characters at most), and the answer in
// plain words, written from this report's numbers only (POST /api/public/ask/<token>).
import { useState } from 'react';
import { ArrowUp } from 'lucide-react';

export interface ClientAskLabels {
  title: string;
  placeholder: string;
  ask: string;
  note: string;
  error: string;
  thinking: string;
}

export function ClientAsk({ token, lang, suggestions, labels }: { token: string; lang?: string; suggestions: string[]; labels: ClientAskLabels }) {
  const [q, setQ] = useState('');
  const [asked, setAsked] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(question: string) {
    const text = question.trim();
    if (text.length < 2 || busy) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    setAsked(text);
    try {
      const res = await fetch(`/api/public/ask/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ question: text, ...(lang ? { lang } : {}) }) });
      const j = (await res.json().catch(() => ({}))) as { answer?: string; message?: string };
      if (res.ok && j.answer) setAnswer(j.answer);
      else setError(res.status === 429 && j.message ? j.message : labels.error);
    } catch {
      setError(labels.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="client-ask card no-print p-5" aria-labelledby="client-ask-title">
      <h2 id="client-ask-title" className="text-base font-medium">
        {labels.title}
      </h2>
      {suggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button key={s} type="button" className="btn" data-suggestion disabled={busy} onClick={() => (setQ(s), void ask(s))}>
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(q);
        }}
      >
        <input className="input" value={q} maxLength={300} onChange={(e) => setQ(e.target.value)} placeholder={labels.placeholder} aria-label={labels.placeholder} />
        <button type="submit" className="btn-primary" disabled={busy || q.trim().length < 2} aria-label={labels.ask}>
          <ArrowUp size={16} strokeWidth={1.5} aria-hidden="true" />
          <span className="hidden sm:inline">{labels.ask}</span>
        </button>
      </form>
      <div className="mt-3" aria-live="polite">
        {busy && <p className="text-sm text-ink-3">{labels.thinking}</p>}
        {answer && (
          <div className="client-ask-answer">
            {asked && <p className="text-xs text-ink-3">{asked}</p>}
            <p className="mt-1 text-[15px] leading-6">{answer}</p>
            <p className="mt-2 text-xs text-ink-3">{labels.note}</p>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-[var(--down)]">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
