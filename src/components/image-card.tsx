// An image in the report grid (spec §6): a creative, a screenshot, an infographic made elsewhere. The media
// component draws a quiet placeholder when the file is missing, so a deleted upload never breaks the page.
import clsx from 'clsx';
import type { ImageValue } from '@/lib/engine/types';
import { MediaImage } from './media-image';
import type { CardProps } from './widgets';

export function ImageCard({ b, grid }: CardProps) {
  const v = b.widget.value as ImageValue;
  return (
    <figure className={clsx('imgcard card overflow-hidden', grid && 'flex h-full flex-col')} title={b.widget.description}>
      <div className={clsx('imgcard-media', grid && 'min-h-0 flex-1')}>
        <MediaImage src={v.url} alt={v.alt} fit={v.fit} />
      </div>
      {v.caption && <figcaption className="px-3 py-2 text-[11px] text-ink-3">{v.caption}</figcaption>}
    </figure>
  );
}
