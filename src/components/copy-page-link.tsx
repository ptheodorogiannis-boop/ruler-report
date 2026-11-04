'use client';

// The round "Copy link" button in a client link's header (docs/superpowers/specs/2026-11-04-map-search-ask-layout-design.md
// §4): copies the page's address without its query (period, language), so the link it hands on is the plain one.
import { useState } from 'react';
import { Check, Link2 } from 'lucide-react';

export function CopyPageLink({ label, done }: { label: string; done: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={copied ? done : label}
      title={copied ? done : label}
      onClick={async () => {
        const url = `${location.origin}${location.pathname}`;
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          const ta = document.createElement('textarea');
          ta.value = url;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check size={18} strokeWidth={1.5} aria-hidden="true" /> : <Link2 size={18} strokeWidth={1.5} aria-hidden="true" />}
    </button>
  );
}
