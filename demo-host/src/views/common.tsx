// Small pieces the live views share: the app's page header (copied, because the app's shell module is server-only),
// a form that stays in the demo, the "not in the demo" card and a loading state.
import type { FormEvent, ReactNode } from 'react';
import { bus, type Locale } from '../bus';
import { demoT } from '../demo-strings';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="display text-[clamp(26px,3vw,34px)] font-semibold leading-tight tracking-[-0.015em]">{title}</h1>
        {subtitle && <div className="mt-1.5 text-sm text-ink-2">{subtitle}</div>}
      </div>
      <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}

/** A form whose submit stays in the demo: `onSubmit` does the demo's version of the action, else a "saved" toast. */
export function DemoForm({ locale, onSubmit, className, children }: { locale: Locale; onSubmit?: (fd: FormData) => void | Promise<void>; className?: string; children: ReactNode }) {
  const handle = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (onSubmit) await onSubmit(new FormData(e.currentTarget));
    else bus.toast(demoT(locale, 'savedInDemo'));
  };
  return (
    <form onSubmit={handle} className={className}>
      {children}
    </form>
  );
}

export function Missing({ locale }: { locale: Locale }) {
  return (
    <div className="card mx-auto my-10 flex max-w-md flex-col items-center gap-3 px-6 py-10 text-center" data-demo-missing>
      <div className="display text-lg font-semibold">{demoT(locale, 'notInDemo')}</div>
      <div className="text-sm text-ink-2">{demoT(locale, 'notInDemoHint')}</div>
      <button type="button" className="btn" onClick={() => bus.back()}>
        {demoT(locale, 'back')}
      </button>
    </div>
  );
}

export function Loading({ locale }: { locale: Locale }) {
  return (
    <div className="py-16 text-center text-sm text-ink-3" role="status" data-demo-loading>
      {demoT(locale, 'loading')}
    </div>
  );
}
