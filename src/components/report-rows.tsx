'use client';

// Reports as an index (docs/DESIGN.md › Structure pass): a type-led list; pointing at a row lifts its cover beside the
// pointer, with the real title and period band. Touch and keyboard get the same cover anchored to the row.
import clsx from 'clsx';
import { useT } from '@/components/i18n-provider';
import Link from 'next/link';
import { motion, useMotionValue, useSpring } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { ClientMark } from './client-mark';
import { RulerBand } from './ruler-band';

export interface ReportRow {
  id: number;
  kind: 'report' | 'dashboard';
  title: string;
  project: string;
  logo?: string | null;
  start: string;
  end: string;
  comparisonStart?: string | null;
  comparisonEnd?: string | null;
  preset: string;
  views: number;
  created: string; // YYYY-MM-DD
  share?: string | null;
  dateFormat: string;
}


export function ReportRows({ items, base }: { items: ReportRow[]; base: string }) {
  const t = useT();
  const [hover, setHover] = useState<number | null>(null);
  const [fine, setFine] = useState(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 260, damping: 30, mass: 0.6 });
  const sy = useSpring(y, { stiffness: 260, damping: 30, mass: 0.6 });
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
    const set = () => setFine(mq.matches);
    set();
    mq.addEventListener('change', set);
    return () => mq.removeEventListener('change', set);
  }, []);

  const onMove = (e: React.PointerEvent) => {
    if (!fine || !list.current) return;
    const r = list.current.getBoundingClientRect();
    x.set(e.clientX - r.left + 24);
    y.set(e.clientY - r.top - 40);
  };
  const current = items.find((i) => i.id === hover) ?? null;

  return (
    <div className="relative">
      <ol ref={list} className="rlist" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {items.map((r) => (
          <li key={r.id} className={clsx('rlist-row', hover === r.id && 'is-hover')} onPointerEnter={() => setHover(r.id)} onFocus={() => setHover(r.id)} onBlur={() => setHover((h) => (h === r.id ? null : h))}>
            <span className="rlist-date num">{r.created}</span>
            <div className="rlist-main">
              <Link href={`${base}/${r.id}`} className="rlist-title display">
                {r.title}
              </Link>
              <div className="rlist-meta">
                <span className="rlist-project inline-flex items-center gap-1.5">
                  <ClientMark name={r.project} logo={r.logo} size={24} />
                  {r.project}
                </span>
                <span className="num">{r.kind === 'dashboard' && r.preset !== 'custom' ? t(`presets.${r.preset}`) : `${r.start} → ${r.end}`}</span>
                <span className="num">
                  {r.views} {r.views === 1 ? 'view' : 'views'}
                </span>
              </div>
            </div>
            {r.share && (
              <a href={r.share} target="_blank" rel="noreferrer" className="rlist-share">
                {t('share.clientLink')}
              </a>
            )}
            {!fine && hover === r.id && <Cover r={r} className="rlist-cover-inline" />}
          </li>
        ))}
      </ol>
      {fine && (
        <motion.div className={clsx('rlist-cover', current && 'is-on')} style={{ x: sx, y: sy }} aria-hidden="true">
          {current && <Cover r={current} />}
        </motion.div>
      )}
    </div>
  );
}

function Cover({ r, className }: { r: ReportRow; className?: string }) {
  return (
    <div className={clsx('rcover', className)}>
      <div className="flex items-center gap-2">
        <ClientMark name={r.project} logo={r.logo} size={32} />
        <div className="eyebrow text-brand">{r.project}</div>
      </div>
      <div className="display mt-1 text-[17px] font-semibold leading-tight">{r.title.toLowerCase().startsWith(r.project.toLowerCase()) ? r.title.slice(r.project.length).replace(/^\s*[|:–—-]\s*/, '') || r.title : r.title}</div>
      <RulerBand range={{ start: r.start, end: r.end }} comparison={r.comparisonStart && r.comparisonEnd ? { start: r.comparisonStart, end: r.comparisonEnd } : null} size="sm" dateFormat={r.dateFormat} live={r.kind === 'dashboard'} className="mt-3" />
    </div>
  );
}
