'use client';

// Per-block AI analysis controls (spec v3 §4.4): "Analyse ▾" with a tone per block, "Analyse all blocks" on the toolbar.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Sparkles } from 'lucide-react';
import { generateAllBlocksAction, generateBlockAnalysisAction } from '@/app/actions/app';
import { TONES, type Tone } from '@/lib/ai/tones';
import { useT } from '@/components/i18n-provider';
import { useAiLanguage } from '@/components/ai-language';

const note = (t: (k: string) => string, ai: boolean) => (ai ? t('analysis.byClaude') : t('analysis.ruleBased'));

export function BlockAnalyseMenu({ reportId, blockId, language: forced, onDone }: { reportId: number; blockId: string; /** overrides the shared AI language */ language?: string; onDone?: (message: string) => void }) {
  const router = useRouter();
  const t = useT();
  const [shared] = useAiLanguage();
  const language = forced ?? shared;
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const run = (tone: Tone) => {
    setOpen(false);
    start(async () => {
      const r = await generateBlockAnalysisAction({ reportId, blockId, tone, language });
      onDone?.(r.ok ? `${t(`tones.${tone}`)}: ${note(t, r.ai)}` : r.error);
      if (r.ok) router.refresh();
    });
  };
  return (
    <span className="relative inline-flex" data-block-analyse={blockId} data-language={language}>
      <button type="button" className="btn px-2 py-1 text-[11px]" disabled={pending} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu">
        <Sparkles size={12} /> {pending ? t('analysis.working') : t('analysis.analyse')} <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 min-w-[190px] rounded-lg border border-[var(--line)] bg-white p-1 shadow-lg" role="menu">
          {TONES.map((tone) => (
            <button key={tone} type="button" role="menuitem" className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--paper)]" onClick={() => run(tone)}>
              {t(`tones.${tone}`)}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

export function AnalyseAllButton({ reportId, language: forced, onDone }: { reportId: number; /** overrides the shared AI language */ language?: string; onDone?: (message: string) => void }) {
  const router = useRouter();
  const t = useT();
  const [shared] = useAiLanguage();
  const language = forced ?? shared;
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn"
      disabled={pending}
      data-analyse-all
      onClick={() =>
        start(async () => {
          const r = await generateAllBlocksAction({ reportId, language });
          onDone?.(r.ok ? `${t('analysis.blocksAnalysed', { count: r.blocks })} ${note(t, r.ai)}` : r.error);
          if (r.ok) router.refresh();
        })
      }
    >
      <Sparkles size={14} /> {pending ? t('analysis.working') : t('analysis.analyseAll')}
    </button>
  );
}
