'use client';

// App-wide search (docs/superpowers/specs/2026-11-04-map-search-ask-layout-design.md §2): a "Search" pill in the top bar
// and Ctrl+K / ⌘K open a dialog over the page; results come from GET /api/v2/search, grouped (clients, reports,
// dashboards, connected accounts, and inside a project the platforms to connect). Arrow keys move, Enter opens,
// Escape closes. The last query is kept for the session.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import type { SearchGroup } from '@/lib/services/search';

export interface SearchLabels {
  open: string;
  placeholder: string;
  close: string;
  nothing: string;
  hint: string;
  groups: Record<SearchGroup['kind'], string>;
  /** "Connect {name}" */
  connectItem: string;
}

const KEY = 'rr-search-q';
const read = () => {
  try {
    return sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
};
const write = (q: string) => {
  try {
    sessionStorage.setItem(KEY, q);
  } catch {
    // private windows: the query is simply not kept
  }
};

export function SearchDialog({ labels }: { labels: SearchLabels }) {
  const router = useRouter();
  const pathname = usePathname();
  const projectId = /^\/projects\/(\d+)/.exec(pathname ?? '')?.[1];
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [groups, setGroups] = useState<SearchGroup[] | null>(null);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  const show = useCallback(() => {
    setQ(read());
    setOpen(true);
  }, []);
  const hide = useCallback(() => {
    setOpen(false);
    opener.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  // 150 ms after the last keystroke; a newer query aborts the older request
  useEffect(() => {
    if (!open) return;
    write(q);
    if (q.trim().length < 2) {
      setGroups(null);
      return;
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/v2/search?q=${encodeURIComponent(q.trim())}${projectId ? `&project=${projectId}` : ''}`, { signal: ctl.signal, credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((j: { data: SearchGroup[] }) => {
          setGroups(j.data ?? []);
          setActive(0);
        })
        .catch(() => null);
    }, 150);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [q, open, projectId]);

  const flat = useMemo(() => (groups ?? []).flatMap((g) => g.items.map((it) => ({ ...it, kind: g.kind }))), [groups]);
  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      hide();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (flat.length) setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + flat.length) % flat.length);
    } else if (e.key === 'Enter' && flat[active]) {
      e.preventDefault();
      go(flat[active].href);
    }
  };

  let n = -1;
  return (
    <>
      <button ref={opener} type="button" className="search-pill" onClick={show} aria-haspopup="dialog" aria-label={labels.open}>
        <Search size={18} strokeWidth={1.5} aria-hidden="true" />
        <span className="search-pill-label">{labels.open}</span>
        <kbd className="search-pill-key" aria-hidden="true">
          Ctrl K
        </kbd>
      </button>
      {open && (
        <div className="search-backdrop" onMouseDown={(e) => e.target === e.currentTarget && hide()}>
          <div className="search-dialog overlay" role="dialog" aria-modal="true" aria-label={labels.open} onKeyDown={onKeyDown}>
            <div className="search-field">
              <Search size={18} strokeWidth={1.5} className="text-ink-3" aria-hidden="true" />
              <input
                ref={input}
                type="search"
                role="combobox"
                aria-expanded={flat.length > 0}
                aria-controls="search-results"
                aria-activedescendant={flat[active] ? `search-r-${active}` : undefined}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={labels.placeholder}
                aria-label={labels.placeholder}
                autoComplete="off"
                className="search-input"
              />
              <button type="button" className="icon-btn h-8 w-8" onClick={hide} aria-label={labels.close}>
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>
            <div id="search-results" role="listbox" aria-label={labels.open} className="search-results">
              {q.trim().length < 2 && <p className="search-note">{labels.hint}</p>}
              {groups && groups.length === 0 && <p className="search-note">{labels.nothing}</p>}
              {groups?.map((g) => (
                <div key={g.kind} role="group" aria-label={labels.groups[g.kind]} className="search-group">
                  <div className="search-group-title">{labels.groups[g.kind]}</div>
                  {g.items.map((it) => {
                    n++;
                    const i = n;
                    return (
                      <a
                        key={it.href + i}
                        id={`search-r-${i}`}
                        role="option"
                        aria-selected={i === active}
                        href={it.href}
                        className="search-item"
                        onMouseEnter={() => setActive(i)}
                        onClick={(e) => {
                          e.preventDefault();
                          go(it.href);
                        }}
                      >
                        <span className="truncate">{g.kind === 'connect' ? labels.connectItem.replace('{name}', it.label) : it.label}</span>
                        {it.sub && <span className="search-item-sub truncate">{it.sub}</span>}
                      </a>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
