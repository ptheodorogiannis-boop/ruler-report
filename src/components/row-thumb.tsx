// A row's image in a table (docs/superpowers/specs/2026-11-04-ads-previews-sources-matomo-design.md §1): an ad creative or a
// post, 48×48, cropped to fill; the media placeholder when there is none. Eager, so print and the PDF include it.
import { MediaImage } from './media-image';

export function RowThumb({ src, alt }: { src: string | null | undefined; alt: string }) {
  return (
    <span className="row-thumb" data-row-thumb>
      <MediaImage src={src} alt={alt} fit="cover" />
    </span>
  );
}
