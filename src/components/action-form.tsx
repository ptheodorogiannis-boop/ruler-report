'use client';

import { useActionState, useState } from 'react';
import { Check, Copy } from 'lucide-react';

type State = { error?: string | null; saved?: boolean; token?: string | null } | null | undefined;

export function ActionForm({
  action,
  children,
  submit,
  className = 'space-y-3',
  secondary,
  successText,
}: {
  action: (prev: any, fd: FormData) => Promise<any>;
  children: React.ReactNode;
  submit: string;
  className?: string;
  secondary?: React.ReactNode;
  successText?: string;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(action as any, null);
  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>}
      {state?.saved && successText && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{successText}</div>}
      {state?.token && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <div className="mb-1 font-semibold text-emerald-800">Copy your token now — it is shown only once</div>
          <code className="block break-all rounded bg-white px-2 py-1 text-xs">{state.token}</code>
        </div>
      )}
      <div className="flex items-center gap-2">
        <button className="btn-primary" disabled={pending}>
          {pending ? 'Saving…' : submit}
        </button>
        {secondary}
      </div>
    </form>
  );
}

export function ConfirmButton({ message, children, className = 'btn-danger' }: { message: string; children: React.ReactNode; className?: string }) {
  return (
    <button
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

export function CopyButton({ text, label = 'Copy link' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
      {done ? 'Copied' : label}
    </button>
  );
}

/** The print control of a client link: a PDF menu when the server can render one (spec v3 §4.1), else the browser's print. */
export function PrintButton({ pdf, labels }: { pdf?: { token: string; /** the client's current view (period, comparison, language): forwarded into the render */ query?: Record<string, string | undefined> }; labels?: { print?: string; download?: string; continuous?: string; pages?: string; browserPrint?: string } }) {
  if (!pdf) {
    return (
      <button type="button" className="btn no-print" onClick={() => window.print()}>
        {labels?.print ?? 'Print / PDF'}
      </button>
    );
  }
  const href = (layout: 'flow' | 'pages') => {
    const q = new URLSearchParams({ layout });
    for (const [k, v] of Object.entries(pdf.query ?? {})) if (v) q.set(k, v);
    return `/api/pdf/${pdf.token}?${q}`;
  };
  return (
    <details className="pdf-menu no-print">
      <summary className="btn">{labels?.download ?? 'Download PDF'}</summary>
      <div className="pdf-menu-list">
        <a href={href('flow')} download>
          {labels?.continuous ?? 'Continuous'}
        </a>
        <a href={href('pages')} download>
          {labels?.pages ?? 'One block per page'}
        </a>
        <button type="button" onClick={() => window.print()}>
          {labels?.browserPrint ?? 'Browser print'}
        </button>
      </div>
    </details>
  );
}
