'use client';

import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';

/** The <img> half of MediaImage: swaps to the placeholder when the file cannot be loaded (deleted media, dead URL). */
export function MediaImageClient({ src, alt, className, fit, lazy, fallback }: { src: string; alt: string; className?: string; fit: 'cover' | 'contain'; lazy?: boolean; fallback: string }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // the 404 can land before hydration, when no onError is attached yet: check the element's state on mount
  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, [src]);
  if (failed)
    return (
      <span className={clsx('media-ph', className)} role="img" aria-label={alt || fallback}>
        {fallback}
      </span>
    );
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} src={src} alt={alt} className={clsx('media-img', className)} style={{ objectFit: fit }} loading={lazy ? 'lazy' : undefined} decoding="async" onError={() => setFailed(true)} />;
}
