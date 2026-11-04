'use client';
// The account the Add metrics drawer lists metrics from (docs/superpowers/specs/2026-11-04-ads-previews-sources-matomo-design.md §2):
// every connected account of the report, each with its platform icon, paid media first, then social, analytics and the rest,
// by platform and name inside a kind. A metric picked from another account than the block's keeps that account, and its
// widget shows the platform icon before its title. The list exists only while open, so the drawer's metric list stays the
// only list of options on the page.
import clsx from 'clsx';
import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useT } from '@/components/i18n-provider';
import { PlatformIcon } from '@/components/platform-icon';
import { getIntegrationDef, type Category } from '@/lib/catalog/integrations';
import type { SourceInfo } from '@/lib/layout/types';

const ORDER: Category[] = ['ads', 'social', 'analytics', 'seo', 'ecommerce', 'crm', 'email', 'calls', 'local', 'custom'];
const rank = (slug: string) => {
  const c = getIntegrationDef(slug)?.category;
  const i = c ? ORDER.indexOf(c) : -1;
  return i < 0 ? ORDER.length : i;
};
const platformName = (slug: string) => getIntegrationDef(slug)?.name ?? slug;

export function sortSources<T extends SourceInfo>(sources: T[]): T[] {
  return [...sources].sort((a, b) => rank(a.slug) - rank(b.slug) || platformName(a.slug).localeCompare(platformName(b.slug)) || a.name.localeCompare(b.name));
}

function SourceLine({ s }: { s: SourceInfo }) {
  return (
    <>
      <PlatformIcon slug={s.slug} size={16} />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{platformName(s.slug)}</span> <span className="text-ink-3">{s.name}</span>
      </span>
    </>
  );
}

export function SourceSelect({ sources, value, onChange }: { sources: SourceInfo[]; value: number; onChange: (id: number) => void }) {
  const t = useT();
  const id = useId();
  const list = useMemo(() => sortSources(sources), [sources]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listbox = useRef<HTMLUListElement>(null);
  const current = list.find((s) => s.id === value);

  useEffect(() => {
    if (!open) return;
    listbox.current?.focus({ preventScroll: true });
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  useEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, id]);

  const show = () => {
    setActive(Math.max(0, list.findIndex((s) => s.id === value)));
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const pick = (i: number) => {
    const s = list[i];
    if (s && s.id !== value) onChange(s.id);
    close();
  };
  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, Math.min(list.length - 1, a + (e.key === 'ArrowDown' ? 1 : -1))));
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setActive(e.key === 'Home' ? 0 : list.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div ref={root} className="relative" data-source-select>
      <span id={`${id}-label`} className="mb-1 block text-xs font-medium text-ink-3">
        {t('editor.source')}
      </span>
      <button
        ref={button}
        type="button"
        className="input flex items-center gap-2 text-left"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            show();
          }
        }}
      >
        <span id={`${id}-value`} className="flex min-w-0 flex-1 items-center gap-2">
          {current ? <SourceLine s={current} /> : <span className="text-ink-3">{t('editor.pickSource')}</span>}
        </span>
        <ChevronDown size={16} className="shrink-0 text-ink-3" aria-hidden="true" />
      </button>
      {open && (
        <ul
          ref={listbox}
          id={`${id}-list`}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={`${id}-label`}
          aria-activedescendant={list.length ? `${id}-${active}` : undefined}
          onKeyDown={onListKey}
          className="overlay absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto p-1 focus:outline-none"
        >
          {list.map((s, i) => (
            <li
              key={s.id}
              id={`${id}-${i}`}
              role="option"
              aria-selected={s.id === value}
              data-source={s.id}
              className={clsx('flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm', i === active && 'bg-[var(--paper)]')}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(i)}
            >
              <SourceLine s={s} />
              {s.id === value && <Check size={14} className="shrink-0 text-brand" aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
