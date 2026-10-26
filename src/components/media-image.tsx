// An image that never shows a broken-image icon (docs/superpowers/specs/2026-10-21-v2-features-design.md §2): no source,
// or a source that fails to load, renders a quiet placeholder carrying the file name. Server-safe; the error swap is a
// small client component.
import clsx from 'clsx';
import { MediaImageClient } from './media-image-client';

export function placeholderLabel(src: string | null | undefined): string {
  if (!src) return 'No image';
  const last = src.split('?')[0].split('/').pop() || 'Image';
  try {
    return decodeURIComponent(last);
  } catch {
    return last; // a bare % or a half escape: show the name as it is
  }
}

export function MediaPlaceholder({ label, className }: { label: string; className?: string }) {
  return (
    <span className={clsx('media-ph', className)} role="img" aria-label={label}>
      {label}
    </span>
  );
}

export function MediaImage({ src, alt, className, fit = 'contain', lazy = false }: { src: string | null | undefined; alt: string; className?: string; fit?: 'cover' | 'contain'; /** defer loading (long lists only): report images stay eager so print and PDF include them */ lazy?: boolean }) {
  if (!src) return <MediaPlaceholder label="No image" className={className} />;
  return <MediaImageClient src={src} alt={alt} className={className} fit={fit} lazy={lazy} fallback={placeholderLabel(src)} />;
}
