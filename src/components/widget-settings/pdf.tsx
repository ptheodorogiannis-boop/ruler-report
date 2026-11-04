'use client';

// Settings of the PDF widget (pdf_v1): upload a PDF (or pick a recent one), the pages to show, a caption. The upload goes to
// /api/media like images; the size limit is the media store's (4 MB on Vercel, where uploads live in the database).
import clsx from 'clsx';
import { FileText } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useT } from '@/components/i18n-provider';
import type { PanelProps } from './custom-chart';

interface Recent {
  id: string;
  url: string;
  name: string;
  size: number;
}

export function PdfSettings({ c, onChange, maxMb = 4 }: Pick<PanelProps, 'c' | 'onChange'> & { maxMb?: number }) {
  const t = useT();
  const [recent, setRecent] = useState<Recent[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    fetch('/api/media?kind=pdf', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j) => setRecent(j.items ?? []))
      .catch(() => setRecent([]));
  }, []);
  const upload = async (file: File) => {
    setError(null);
    if (file.type !== 'application/pdf') return setError(t('editor.pdfLimit', { size: maxMb }));
    if (file.size > maxMb * 1024 * 1024) return setError(t('editor.pdfLimit', { size: maxMb }));
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const r = await fetch('/api/media', { method: 'POST', body: fd, credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message || `Upload failed (${r.status})`);
      onChange({ url: j.url, title: c.title ?? file.name.replace(/\.pdf$/i, '') });
      setRecent((list) => [{ id: j.id, url: j.url, name: file.name, size: file.size }, ...(list ?? [])]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const current = recent?.find((r) => r.url === c.url);
  return (
    <div className="space-y-4" data-panel="pdf">
      <div>
        <div className="label">{t('editor.pdfFile')}</div>
        {c.url && (
          <div className="tone-inset mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-xs">
            <FileText size={14} strokeWidth={1.5} aria-hidden="true" />
            <span className="truncate">{current?.name ?? c.url}</span>
          </div>
        )}
        <div
          className={clsx('mpick-drop', over && 'is-over')}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void upload(f);
          }}
        >
          <input ref={input} type="file" accept="application/pdf" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <div className="text-sm">{busy ? t('editor.pdfUploading') : t('editor.pdfDrop')}</div>
          <button type="button" className="btn mt-2" disabled={busy} onClick={() => input.current?.click()}>
            {c.url ? t('editor.pdfReplace') : t('editor.pdfUpload')}
          </button>
          <div className="mt-1 text-[11px] text-ink-3">{t('editor.pdfLimit', { size: maxMb })}</div>
        </div>
        {error && (
          <div className="mt-2 text-xs text-down" role="alert">
            {error}
          </div>
        )}
        {recent && recent.length > 0 && (
          <div className="mt-3 space-y-1">
            <div className="text-xs text-ink-3">{t('editor.pdfRecent')}</div>
            {recent.slice(0, 6).map((r) => (
              <button key={r.id} type="button" aria-pressed={r.url === c.url} className={clsx('navlink w-full text-[13px]', r.url === c.url && 'is-active')} onClick={() => onChange({ url: r.url })}>
                <FileText size={14} strokeWidth={1.5} aria-hidden="true" />
                <span className="truncate">{r.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className="label" htmlFor="pdf-pages">
          {t('editor.pdfPages')}
        </label>
        <input id="pdf-pages" className="input" value={c.pdfPages ?? ''} placeholder="1-3, 5" inputMode="numeric" onChange={(e) => onChange({ pdfPages: e.target.value.replace(/[^\d\s,-]/g, '') || undefined }, 'pdfPages')} />
        <div className="mt-1 text-[11px] text-ink-3">{t('editor.pdfPagesHint')}</div>
      </div>
      <div>
        <label className="label" htmlFor="pdf-caption">
          {t('editor.caption')}
        </label>
        <input id="pdf-caption" className="input" value={c.caption ?? ''} maxLength={200} onChange={(e) => onChange({ caption: e.target.value || undefined }, 'caption')} />
      </div>
    </div>
  );
}
