'use client';
// The "accounts found" picker (one consent, every network of the provider). Search filters in place; a hidden
// card that is ticked still submits, so searching never drops a selection.
import Link from 'next/link';
import { useActionState, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Search, X } from 'lucide-react';
import { cancelOAuthAction, finishBundleAction } from '@/app/actions/oauth';
import { useT } from '@/components/i18n-provider';

export interface PickerAccount {
  value: string;
  name: string;
  /** id, currency, status, the manager or Page it is reached through: already in the reader's language */
  detail: string[];
  inProject: boolean;
  /** a disabled or closed account: still selectable, muted and listed last */
  inactive?: boolean;
}
export interface PickerNetwork {
  slug: string;
  name: string;
  noun: string;
  /** the platform mark, rendered on the server */
  mark?: ReactNode;
  error: string | null;
  notGranted: boolean;
  accounts: PickerAccount[];
}

type State = { error?: string } | null;

export function AccountsPicker(props: {
  provider: 'google' | 'meta';
  providerName: string;
  account?: string | null;
  projectId: number;
  projectName: string;
  restartHref: string;
  networks: PickerNetwork[];
  expired?: boolean;
}) {
  const t = useT();
  const { provider, providerName, projectId, projectName, restartHref, networks } = props;
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [state, formAction, pending] = useActionState<State, FormData>(finishBundleAction as any, null);

  const needle = q.trim().toLowerCase();
  const visible = useMemo(() => {
    const out = new Map<string, Set<string>>();
    for (const n of networks) out.set(n.slug, new Set(n.accounts.filter((a) => !needle || `${a.name} ${a.detail.join(' ')}`.toLowerCase().includes(needle)).map((a) => a.value)));
    return out;
  }, [networks, needle]);
  const matches = [...visible.values()].reduce((s, v) => s + v.size, 0);

  const toggle = (v: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(v);
      else next.delete(v);
      return next;
    });
  const setGroup = (n: PickerNetwork, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const a of n.accounts) if (visible.get(n.slug)?.has(a.value)) (on ? next.add(a.value) : next.delete(a.value));
      return next;
    });

  if (props.expired) {
    return (
      <div className="mx-auto max-w-[640px] pt-6">
        <h1 className="display text-[28px] font-semibold leading-[1.1]">{t('connect.pickTitle', { project: projectName })}</h1>
        <p className="mt-3 text-sm text-ink-2">{t('connect.expired', { provider: providerName })}</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a href={restartHref} className="btn-primary">
            {t('connect.withProvider', { provider: providerName })}
          </a>
          <Link href={`/projects/${projectId}/connect`} className="btn">
            {t('connect.allIntegrations')}
          </Link>
        </div>
      </div>
    );
  }

  const count = picked.size;
  const total = networks.reduce((s, n) => s + n.accounts.length, 0);
  const declined = networks.filter((n) => n.notGranted).map((n) => n.name);

  return (
    <div className="mx-auto max-w-[720px] pt-2" data-accounts-picker={provider}>
      <header>
        <h1 className="display text-[28px] font-semibold leading-[1.1]">{t('connect.pickTitle', { project: projectName })}</h1>
        <p className="mt-3 max-w-[60ch] text-sm leading-6 text-ink-2">
          {props.account ? t('connect.pickLead', { provider: providerName, account: props.account }) : t('connect.pickLeadAnon', { provider: providerName })}
        </p>
        {declined.length > 0 && (
          <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-ink" data-declined>
            <AlertTriangle size={16} strokeWidth={1.75} className="mt-1 shrink-0 text-ink-2" aria-hidden="true" />
            <span>
              {t('connect.notGrantedLead', { provider: providerName, names: declined.join(', ') })}{' '}
              <a href={restartHref} className="link font-medium">
                {t('connect.signInAgain')}
              </a>
            </span>
          </p>
        )}
      </header>

      <form action={formAction} className="mt-6">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="provider" value={provider} />

        {total > 6 && (
          <div className="relative">
            <Search size={16} strokeWidth={1.75} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden="true" />
            <input type="text" role="searchbox" enterKeyHint="search" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')} placeholder={t('connect.searchAccounts')} aria-label={t('connect.searchAccounts')} className="input input-lg pl-9 pr-10" />
            {q && (
              <button type="button" onClick={() => setQ('')} className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-3 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus)]" aria-label={t('connect.clearSearch')}>
                <X size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        {needle && matches === 0 && <p className="mt-4 text-sm text-ink-2">{t('connect.noMatch', { q })}</p>}

        <div className="mt-6 space-y-8">
          {networks.map((n) => {
            const shown = visible.get(n.slug)!;
            if (needle && shown.size === 0) return null;
            const inProject = n.accounts.filter((a) => a.inProject).length;
            const allOn = shown.size > 0 && [...shown].every((v) => picked.has(v));
            const headId = `net-${n.slug}`;
            return (
              <section key={n.slug} aria-labelledby={headId} data-network={n.slug}>
                <div className="flex items-center gap-3">
                  {n.mark}
                  <div className="min-w-0 flex-1">
                    <h2 id={headId} className="text-[15px] font-semibold leading-5">
                      {n.name}
                    </h2>
                    <p className="num text-xs leading-4 text-ink-3">
                      {n.notGranted || n.error ? t('connect.notListed') : needle ? t('connect.accountsShown', { shown: shown.size, total: n.accounts.length }) : n.accounts.length === 1 ? t('connect.accountsOne') : t('connect.accountsMany', { count: n.accounts.length })}
                      {inProject > 0 && <>, {t('connect.inProjectCount', { count: inProject })}</>}
                    </p>
                  </div>
                  {shown.size > 1 && (
                    <button type="button" onClick={() => setGroup(n, !allOn)} className="rounded-md px-2 py-1 text-sm font-medium text-brand transition-colors hover:bg-[var(--brand-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus)]">
                      {allOn ? t('connect.selectNone') : t('connect.selectAll')}
                    </button>
                  )}
                </div>

                {n.notGranted ? (
                  <p className="mt-2 text-sm leading-6 text-ink-2">{t('connect.notGrantedShort')}</p>
                ) : n.error ? (
                  <p className="mt-2 flex items-start gap-2 text-sm leading-6 text-ink-2" data-network-error>
                    <AlertTriangle size={16} strokeWidth={1.75} className="mt-1 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 break-words">{t('connect.networkError', { error: n.error })}</span>
                  </p>
                ) : n.accounts.length === 0 ? (
                  <p className="mt-2 text-sm leading-6 text-ink-2">{t('connect.noneOnLogin')}</p>
                ) : (
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {n.accounts.map((a) => {
                      const on = picked.has(a.value);
                      return (
                        <li key={a.value} hidden={!shown.has(a.value)}>
                          <label
                            className={`flex h-full cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)] ${on ? 'border-brand bg-[var(--brand-soft)]' : 'border-[var(--line-strong)] bg-[var(--card)] hover:border-[var(--ink-3)]'} ${a.inactive && !on ? 'text-ink-2' : ''}`}
                            data-inactive={a.inactive ? '1' : undefined}
                          >
                            <input type="checkbox" name="pick" value={a.value} checked={on} onChange={(e) => toggle(a.value, e.target.checked)} className="sr-only" />
                            <span aria-hidden="true" className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${on ? 'border-brand bg-brand text-white' : 'border-[var(--line-strong)] bg-[var(--card)]'}`}>
                              {on && <Check size={12} strokeWidth={2.5} />}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium leading-5">{a.name}</span>
                              {a.detail.length > 0 && (
                                <span className="num mt-0.5 flex flex-wrap gap-x-3 text-xs leading-4 text-ink-3">
                                  {a.detail.map((part, i) => (
                                    <span key={i}>{part}</span>
                                  ))}
                                </span>
                              )}
                              {a.inProject && <span className="mt-1.5 block text-xs leading-4 text-ink-2">{t('connect.inProject')}</span>}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>

        {state?.error && (
          <p role="alert" className="mt-6 rounded-lg border border-[var(--down)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--down)]">
            {state.error}
          </p>
        )}

        <div className="sticky bottom-0 z-10 mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] bg-[var(--paper)] py-4">
          <p className="num text-sm text-ink-2" aria-live="polite">
            {count === 0 ? t('connect.selectedNone') : count === 1 ? t('connect.selectedOne') : t('connect.selectedMany', { count })}
          </p>
          <div className="flex items-center gap-2">
            <button formAction={cancelOAuthAction} formNoValidate className="btn">
              {t('connect.cancel')}
            </button>
            <button className="btn-primary" disabled={pending || count === 0}>
              {pending ? t('connect.adding') : count === 0 ? t('connect.addSelected') : count === 1 ? t('connect.addOne') : t('connect.addMany', { count })}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
