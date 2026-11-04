'use client';

// A search box over a list rendered on the server (docs/superpowers/specs/2026-11-04-map-search-ask-layout-design.md §2):
// rows opt in with data-search="<text>", groups (a category section) with data-search-group and hide when none of their
// rows match. Rows are hidden, never removed, so a ticked checkbox that is filtered out still submits with its form.
// Matching ignores case and accents ("όμιλος" finds "Όμιλος"); Escape clears.
import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { fold } from '@/lib/util/text';

export function ListFilter({ label, placeholder, countLabel, emptyLabel, children }: { label: string; placeholder: string; /** "{shown} of {total}" */ countLabel: string; emptyLabel: string; children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const [counts, setCounts] = useState<{ shown: number; total: number } | null>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const needle = fold(q.trim());
    const rows = [...el.querySelectorAll<HTMLElement>('[data-search]')];
    let shown = 0;
    for (const r of rows) {
      const hit = !needle || fold(r.dataset.search ?? '').includes(needle);
      r.hidden = !hit;
      if (hit) shown++;
    }
    for (const g of el.querySelectorAll<HTMLElement>('[data-search-group]')) g.hidden = !!needle && !g.querySelector('[data-search]:not([hidden])');
    setCounts(needle ? { shown, total: rows.length } : null);
  }, [q]);
  return (
    <div ref={root} className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search size={16} strokeWidth={1.5} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <input type="search" role="searchbox" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => {
              if (e.key === 'Escape') setQ('');
              // Enter filters; inside a form (the reconnect list) it must not submit the accounts ticked so far
              if (e.key === 'Enter') e.preventDefault();
            }} placeholder={placeholder} aria-label={label} autoComplete="off" className="input pl-9" />
        </div>
        {counts && (
          <span className="num text-xs text-ink-3" data-search-count aria-live="polite">
            {countLabel.replace('{shown}', String(counts.shown)).replace('{total}', String(counts.total))}
          </span>
        )}
      </div>
      {counts && counts.shown === 0 && <p className="text-sm text-ink-2">{emptyLabel}</p>}
      {children}
    </div>
  );
}
