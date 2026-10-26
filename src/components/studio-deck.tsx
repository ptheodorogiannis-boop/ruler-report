'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import type { Slide } from '@/lib/ai/insights';

export function StudioDeck({ slides, title }: { slides: Slide[]; title: string }) {
  const [i, setI] = useState(0);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') setI((x) => Math.min(slides.length - 1, x + 1));
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
      if (e.key === 'Escape') setFull(false);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [slides.length]);
  const s = slides[i];
  return (
    <div className={full ? 'fixed inset-0 z-50 flex flex-col bg-slate-900 p-6' : ''}>
      <div className={`${full ? 'mx-auto w-full max-w-5xl flex-1' : ''}`}>
        <div className={`card flex flex-col justify-between overflow-hidden p-8 ${full ? 'h-full' : 'min-h-[460px]'}`}>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand">{title}</div>
            <h2 className="text-3xl font-bold tracking-tight">{s.title}</h2>
            {s.bullets.length > 0 && (
              <ul className="mt-4 list-disc space-y-1.5 pl-5 text-lg text-slate-700">
                {s.bullets.map((b, j) => (
                  <li key={j}>{b}</li>
                ))}
              </ul>
            )}
            {s.kpis.length > 0 && (
              <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3">
                {s.kpis.map((k, j) => (
                  <div key={j} className="rounded-xl border border-[var(--line)] p-4">
                    <div className="text-xs text-slate-500">{k.label}</div>
                    <div className="mt-1 text-2xl font-bold">{k.value}</div>
                    {k.change && <div className={`text-xs font-semibold ${k.change.startsWith('-') ? 'text-red-600' : 'text-emerald-600'}`}>{k.change}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-6 text-right text-xs text-slate-400">
            {i + 1} / {slides.length}
          </div>
        </div>
      </div>
      <div className={`mt-3 flex items-center justify-center gap-2 ${full ? 'text-white' : ''}`}>
        <button className="btn" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>
          <ChevronLeft size={14} /> Prev
        </button>
        <button className="btn" onClick={() => setI(Math.min(slides.length - 1, i + 1))} disabled={i === slides.length - 1}>
          Next <ChevronRight size={14} />
        </button>
        <button className="btn" onClick={() => setFull(!full)}>
          <Maximize2 size={14} /> {full ? 'Exit' : 'Present'}
        </button>
      </div>
    </div>
  );
}
