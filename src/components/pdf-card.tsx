// The PDF widget's card (pdf_v1): title, the pages drawn in place (src/components/pdf-embed.tsx), a caption and a link to
// download the original. On screen the pages scroll inside the tile like a previewer; in print every chosen page is shown.
import clsx from 'clsx';
import { Download } from 'lucide-react';
import type { PdfValue } from '@/lib/engine/types';
import { tr } from '@/lib/i18n/request';
import { PdfEmbed } from './pdf-embed';
import type { CardProps } from './widgets';

export function PdfCard({ b, grid }: CardProps) {
  const w = b.widget;
  const v = w.value as PdfValue;
  const title = w.label;
  return (
    <div className={clsx('card pdf-card flex flex-col p-4', grid && 'h-full overflow-hidden')} title={w.description}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="truncate text-sm font-semibold">{title}</div>
        <a href={v.url} download className="no-print inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-ink-2 hover:text-ink">
          <Download size={14} strokeWidth={1.5} aria-hidden="true" />
          {tr('public.pdfDownload')}
        </a>
      </div>
      <div className={clsx('pdf-scroll', grid && 'min-h-0 flex-1')}>
        <PdfEmbed url={v.url} pages={v.pages} title={title} labels={{ loading: tr('public.pdfLoading'), error: tr('public.pdfError'), pageOf: tr('public.pdfPageOf') }} />
      </div>
      {v.caption && <div className="mt-3 text-xs text-ink-3">{v.caption}</div>}
    </div>
  );
}
