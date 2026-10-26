// The cover of a client link (spec v3 §4.2): the client mark, eyebrow, title, subtitle and the period band, in one of
// three layouts — `banner` (image above the title in the cover column), `header` (image full width above both columns
// with the titles overlaid) or `none` (no image, no cover column). Pure server markup, so it renders in tests.
import type { ReactNode } from 'react';
import { ClientMark } from '@/components/client-mark';
import { MediaImage } from '@/components/media-image';
import { RulerBand } from '@/components/ruler-band';
import type { DateRange } from '@/lib/engine/types';
import type { ReportTheme } from '@/lib/layout/types';
import { getRequestLocale, tr } from '@/lib/i18n/request';

export type CoverLayout = NonNullable<ReportTheme['coverLayout']>;
export const coverLayoutOf = (theme?: ReportTheme | null): CoverLayout => theme?.coverLayout ?? 'banner';

export interface ReportCoverProps {
  projectName: string;
  title: string;
  subtitle?: string | null;
  logo?: string | null;
  brandColor: string;
  range: DateRange;
  comparison?: DateRange | null;
  dateFormat: string;
  live?: boolean;
  marker?: string;
  cover?: string | null;
  theme?: ReportTheme | null;
  /** `hero` = only the full-width header image (layout `header`); `head` = the titles and the band; omitted = both */
  slot?: 'hero' | 'head';
  /** rendered under the band: the comparison note, a dashboard's controls */
  children?: ReactNode;
}

export function ReportCover(p: ReportCoverProps) {
  const layout = coverLayoutOf(p.theme);
  const showPeriod = p.theme?.showPeriod !== false;
  const band = showPeriod ? <RulerBand range={p.range} comparison={p.comparison} size="sm" dateFormat={p.dateFormat} live={p.live} marker={p.marker} className="mt-6" locale={getRequestLocale()} labels={{ live: tr('public.live'), comparedWith: tr('public.comparedWith') }} /> : null;
  const titles = (
    <>
      <ClientMark name={p.projectName} logo={p.logo} color={p.brandColor} size={48} className="mb-3" />
      <div className="eyebrow cover-eyebrow">{p.projectName}</div>
      <h1 className="display cover-title mt-2 text-[clamp(28px,2.6vw,36px)] font-semibold leading-[1.05] tracking-[-0.02em]">{p.title}</h1>
      {p.subtitle && <p className="cover-subtitle mt-3 text-sm text-ink-2">{p.subtitle}</p>}
    </>
  );
  const hero =
    layout === 'header' ? (
      <div className="cover-hero" data-cover-layout="header">
        {p.cover && <MediaImage src={p.cover} alt="" fit="cover" className="cover-hero-img" />}
        <div className="cover-hero-text">{titles}</div>
      </div>
    ) : null;
  const head = (
    <div className="cover-head-inner" data-cover-layout={layout}>
      {layout === 'banner' && p.cover && (
        <div className="cover-banner">
          <MediaImage src={p.cover} alt="" fit="cover" />
        </div>
      )}
      {layout !== 'header' && titles}
      {band}
      {p.children}
    </div>
  );
  if (p.slot === 'hero') return hero;
  if (p.slot === 'head') return head;
  return (
    <>
      {hero}
      {head}
    </>
  );
}
