'use client';

// The report's look (spec §5): accent colour, chart palette and cover image for the whole report, and a colour per
// block. Edits go through the editor's layout state, so they autosave and undo like any other change.
import { X } from 'lucide-react';
import { useT } from '@/components/i18n-provider';
import { MediaPicker } from './media-picker';
import { cleanTheme, paletteFor } from '@/lib/layout/theme';
import { PALETTE_NAMES, type ReportTheme } from '@/lib/layout/types';

// dictionary keys, resolved with t at render (spec v3 §5)
const PALETTE_LABEL: Record<(typeof PALETTE_NAMES)[number], string> = { brand: 'look.paletteBrand', vivid: 'look.paletteVivid', calm: 'look.paletteCalm', mono: 'look.paletteMono' };
const COVER_LABEL = { banner: 'look.coverBanner', header: 'look.coverHeader', none: 'look.coverNone' } as const;

export function LookPanel({ theme, clientColor, projectId, onChange, onClose }: { theme: ReportTheme | undefined; clientColor: string; projectId?: number; onChange: (t: ReportTheme | undefined) => void; onClose: () => void }) {
  const t = useT();
  const th = theme ?? {};
  const set = (patch: Partial<ReportTheme>) => onChange(cleanTheme({ ...th, ...patch }));
  const accent = th.accent ?? clientColor;
  return (
    <div data-look className="look-panel card no-print p-4" role="region" aria-label={t('editor.look')}>
      <div className="flex items-center justify-between">
        <div className="font-semibold">{t('editor.look')}</div>
        <button type="button" className="btn px-2 py-1" onClick={onClose} aria-label={t('look.close')}>
          <X size={14} />
        </button>
      </div>
      <div className="mt-3 grid gap-5 md:grid-cols-4">
        <div>
          <label className="label" htmlFor="look-accent">
            {t('look.accent')}
          </label>
          <div className="flex items-center gap-2">
            <input id="look-accent" type="color" name="accent" className="swatch-input" value={accent} onChange={(e) => set({ accent: e.target.value })} />
            <code className="num text-xs text-ink-3">{accent}</code>
            <button type="button" className="btn py-1" disabled={!th.accent} onClick={() => set({ accent: undefined })}>
              {t('look.useClientColour')}
            </button>
          </div>
          <div className="mt-1 text-[11px] text-ink-3">{t('look.accentHint')}</div>
        </div>
        <div>
          <div className="label">{t('look.palette')}</div>
          <div className="space-y-1.5">
            {PALETTE_NAMES.map((name) => (
              <label key={name} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="radio" name="palette" value={name} checked={(th.palette ?? 'brand') === name} onChange={() => set({ palette: name === 'brand' ? undefined : name })} />
                <span className="swatches" aria-hidden="true">
                  {paletteFor(name, accent)
                    .slice(0, 6)
                    .map((c, i) => (
                      <i key={i} style={{ background: c }} />
                    ))}
                </span>
                <span>{t(PALETTE_LABEL[name])}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <div className="label">{t('look.coverImage')}</div>
          <MediaPicker value={th.cover ?? null} onChange={(m) => set({ cover: m?.url })} projectId={projectId} label={t('look.chooseCover')} />
          <div className="mt-1 text-[11px] text-ink-3">{t('look.bannerHint')}</div>
        </div>
        <div data-cover-options>
          <div className="label">{t('look.cover')}</div>
          <div className="space-y-1.5">
            {(['banner', 'header', 'none'] as const).map((l) => (
              <label key={l} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="radio" name="coverLayout" value={l} checked={(th.coverLayout ?? 'banner') === l} onChange={() => set({ coverLayout: l === 'banner' ? undefined : l })} />
                <span>{t(COVER_LABEL[l])}</span>
              </label>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input type="color" name="coverText" aria-label={t('look.titleColour')} className="swatch-input" value={th.coverText ?? '#101418'} onChange={(e) => set({ coverText: e.target.value })} />
            <code className="num text-xs text-ink-3">{th.coverText ?? 'ink'}</code>
            <button type="button" className="btn py-1" disabled={!th.coverText} onClick={() => set({ coverText: undefined })}>
              {t('look.useInk')}
            </button>
          </div>
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" name="showPeriod" checked={th.showPeriod !== false} onChange={(e) => set({ showPeriod: e.target.checked ? undefined : false })} /> {t('look.showPeriod')}
          </label>
        </div>
      </div>
    </div>
  );
}

/** A block's colour: a small round swatch in the block header; the platform colour until changed. */
export function BlockColor({ value, fallback, onChange }: { value: string | undefined; fallback: string; onChange: (color: string | null) => void }) {
  const t = useT();
  return (
    <span className="block-color" title={value ? `Block colour ${value} — click × for the platform colour` : 'Block colour (platform colour)'}>
      <input type="color" aria-label={t('look.blockColour')} value={value ?? fallback} onChange={(e) => onChange(e.target.value)} />
      {value && (
        <button type="button" className="text-ink-3 hover:text-ink" aria-label={t('look.usePlatformColour')} onClick={() => onChange(null)}>
          <X size={12} />
        </button>
      )}
    </span>
  );
}
