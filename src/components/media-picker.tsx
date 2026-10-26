'use client';

// The one way images enter the product (spec §2): a button that opens a small panel with drag-and-drop or file choice,
// an external URL field, and the company's recent uploads. It hands back { url, width, height } — forms keep the url
// in a hidden input, widgets keep it in their settings.
import clsx from 'clsx';
import { useT } from '@/components/i18n-provider';
import { useEffect, useRef, useState } from 'react';
import { MediaImage } from './media-image';
import { isMediaOrHttps } from '@/lib/media/url';

export interface PickedMedia {
  url: string;
  width: number | null;
  height: number | null;
}
interface Recent {
  id: string;
  url: string;
  name: string;
  width: number | null;
  height: number | null;
}

const MAX = 5 * 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** Reads the natural size of an image file in the browser before uploading it. */
function measure(file: File): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth || null, height: img.naturalHeight || null });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ width: null, height: null });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export function MediaPicker({ value, onChange, projectId, label = 'Choose image', className }: { value?: string | null; onChange: (m: PickedMedia | null) => void; projectId?: number; label?: string; className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Recent[] | null>(null);
  const [url, setUrl] = useState('');
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    fetch('/api/media', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Could not list uploads (${r.status})`))))
      .then((j) => setRecent(j.items ?? []))
      .catch((e) => {
        setRecent([]);
        setError((e as Error).message);
      });
    const onDoc = (e: PointerEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [open]);

  const upload = async (file: File) => {
    setError(null);
    if (!TYPES.includes(file.type)) return setError('PNG, JPEG, WebP or GIF only.');
    if (file.size > MAX) return setError('Images must be 5 MB or smaller.');
    setBusy(true);
    try {
      const { width, height } = await measure(file);
      const fd = new FormData();
      fd.set('file', file);
      if (width) fd.set('width', String(width));
      if (height) fd.set('height', String(height));
      if (projectId) fd.set('projectId', String(projectId));
      const r = await fetch('/api/media', { method: 'POST', body: fd, credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message || `Upload failed (${r.status})`);
      onChange({ url: j.url, width: j.width ?? width, height: j.height ?? height });
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const useUrl = () => {
    const u = url.trim();
    if (!u || !isMediaOrHttps(u)) return setError('Enter a full https:// address.');
    onChange({ url: u, width: null, height: null });
    setUrl('');
    setOpen(false);
  };

  return (
    <div className={clsx('mpick', className)}>
      <div className="flex items-center gap-3">
        {value ? (
          <span className="mpick-thumb">
            <MediaImage src={value} alt="" fit="contain" />
          </span>
        ) : null}
        <button type="button" className="btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {value ? 'Change image' : label}
        </button>
        {value && (
          <button type="button" className="btn" onClick={() => onChange(null)}>
            {t('common.remove')}
          </button>
        )}
      </div>
      {open && (
        <div ref={panel} className="mpick-panel card" role="dialog" aria-label={t('media.chooseImage')}>
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
            <input ref={input} type="file" accept={TYPES.join(',')} className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <div className="text-sm">{busy ? t('media.uploading') : t('media.dropHere')}</div>
            <button type="button" className="btn mt-2" disabled={busy} onClick={() => input.current?.click()}>
              {t('media.chooseFile')}
            </button>
            <div className="mt-1 text-[11px] text-ink-3">{t('media.types')}</div>
          </div>
          <div className="mt-3 flex gap-2">
            <input className="input" placeholder="https://…/logo.png" value={url} onChange={(e) => setUrl(e.target.value)} aria-label={t('media.imageUrl')} />
            <button type="button" className="btn" onClick={useUrl}>
              {t('media.use')}
            </button>
          </div>
          {error && (
            <div className="mt-2 text-xs text-down" role="alert">
              {error}
            </div>
          )}
          {recent && recent.length > 0 && (
            <div className="mt-3">
              <div className="eyebrow mb-1">{t('media.recent')}</div>
              <div className="mpick-grid">
                {recent.map((m) => (
                  <button key={m.id} type="button" className="mpick-cell" title={m.name} onClick={() => { onChange({ url: m.url, width: m.width, height: m.height }); setOpen(false); }}>
                    <MediaImage src={m.url} alt={m.name} fit="cover" lazy />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** A form field: the picked url travels in a hidden input named `name`. */
export function MediaField({ name, defaultValue, projectId, label }: { name: string; defaultValue?: string | null; projectId?: number; label?: string }) {
  const [value, setValue] = useState<string | null>(defaultValue ?? null);
  return (
    <>
      <input type="hidden" name={name} value={value ?? ''} />
      <MediaPicker value={value} onChange={(m) => setValue(m?.url ?? null)} projectId={projectId} label={label} />
    </>
  );
}
