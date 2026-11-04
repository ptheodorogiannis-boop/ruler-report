'use client';

// An uploaded PDF drawn inside the report (pdf_v1, docs/DESIGN.md › Ruler glass pass): pdf.js loads only when a PDF
// widget is on the page (a dynamic import, so the client link's bundle does not grow), each chosen page becomes a canvas
// at the card's width, and the element says when it is done (data-pdf-ready) so the server PDF waits for it.
import { useEffect, useRef, useState } from 'react';

type PdfJs = typeof import('pdfjs-dist');
let loader: Promise<PdfJs> | null = null;
function loadPdfJs(): Promise<PdfJs> {
  if (!loader)
    loader = import('pdfjs-dist').then((m) => {
      m.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      return m;
    });
  return loader;
}

const MAX_PAGES = 50;

export function PdfEmbed({ url, pages, title, labels }: { url: string; pages?: number[]; title: string; labels: { loading: string; error: string; pageOf: string } }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const key = pages?.join(',') ?? '';
  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | null = null;
    setState('loading');
    (async () => {
      try {
        const pdfjs = await loadPdfJs();
        const task = pdfjs.getDocument({ url, withCredentials: true });
        destroy = () => void task.destroy();
        const doc = await task.promise;
        if (cancelled || !host.current) return;
        const list = (pages ?? Array.from({ length: doc.numPages }, (_, i) => i + 1)).filter((p) => p >= 1 && p <= doc.numPages).slice(0, MAX_PAGES);
        const box = host.current;
        box.replaceChildren();
        const width = Math.max(240, box.clientWidth);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        for (const n of list) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * dpr });
          const figure = document.createElement('figure');
          figure.className = 'pdf-page';
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
          canvas.setAttribute('role', 'img');
          canvas.setAttribute('aria-label', labels.pageOf.replace('{page}', String(n)).replace('{total}', String(doc.numPages)) + ` · ${title}`);
          figure.append(canvas);
          box.append(figure);
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          await page.render({ canvas, canvasContext: ctx, viewport } as Parameters<typeof page.render>[0]).promise;
        }
        if (!cancelled) setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
      destroy?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, key]);
  return (
    <div className="pdf-embed" data-pdf-embed data-pdf-ready={state === 'loading' ? '0' : '1'}>
      {state !== 'ready' && <div className={state === 'error' ? 'pdf-note pdf-note-error' : 'pdf-note'}>{state === 'error' ? labels.error : labels.loading}</div>}
      <div ref={host} className="pdf-pages" />
    </div>
  );
}
