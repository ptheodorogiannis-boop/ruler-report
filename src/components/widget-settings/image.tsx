'use client';

// Settings of an image widget (spec §6): the picture, how it fits its cell, a caption and alt text.
import { MediaPicker } from '../media-picker';
import { useT } from '@/components/i18n-provider';
import { Segmented } from './common';
import type { PanelProps } from './custom-chart';

export function ImageSettings({ c, onChange }: Pick<PanelProps, 'c' | 'onChange'>) {
  const t = useT();
  return (
    <div className="space-y-4" data-panel="image">
      <div>
        <div className="label">{t('editor.image')}</div>
        <MediaPicker value={c.url ?? null} onChange={(m) => onChange({ url: m?.url ?? undefined })} />
      </div>
      <Segmented
        label={t('editor.fit')}
        options={[
          { value: 'contain', label: t('editor.fitContain') },
          { value: 'cover', label: t('editor.fitCover') },
        ]}
        value={c.fit ?? 'contain'}
        onChange={(fit) => onChange({ fit })}
      />
      <div>
        <label className="label">{t('editor.caption')}</label>
        <input className="input" value={c.caption ?? ''} onChange={(e) => onChange({ caption: e.target.value || undefined }, 'caption')} placeholder={t('editor.captionPlaceholder')} />
      </div>
      <div>
        <label className="label">{t('editor.altText')}</label>
        <input className="input" value={c.alt ?? ''} onChange={(e) => onChange({ alt: e.target.value || undefined }, 'alt')} placeholder={t('editor.altPlaceholder')} />
      </div>
    </div>
  );
}
