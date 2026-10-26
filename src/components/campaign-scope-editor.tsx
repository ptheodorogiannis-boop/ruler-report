'use client';

// Campaign scope control (spec v3 §2.2): all / pick (checklist with search) / rule (name contains / does not contain).
// Used on the integrations tab (form field), in the editor's block gear and in the report wizard (onChange).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@/components/i18n-provider';
import { X } from 'lucide-react';
import type { Campaign } from '@/lib/engine/types';
import { scopeLabel, type CampaignRule, type CampaignScope } from '@/lib/engine/campaigns';

const STATUS_DOT: Record<Campaign['status'], string> = { active: 'bg-emerald-500', paused: 'bg-amber-400', other: 'bg-slate-300' };

export function CampaignScopeEditor({
  value,
  campaigns,
  load,
  name = 'scope',
  onChange,
}: {
  value?: CampaignScope;
  /** preloaded list; null = the load failed on the server */
  campaigns?: Campaign[] | null;
  /** lazy loader (a server action) when the list is not preloaded */
  load?: () => Promise<Campaign[]>;
  /** hidden input name carrying the JSON scope; null = no hidden input (onChange only) */
  name?: string | null;
  onChange?: (s: CampaignScope) => void;
}) {
  const t = useT();
  const [scope, setScope] = useState<CampaignScope>(value ?? { mode: 'all' });
  const [list, setList] = useState<Campaign[] | null>(campaigns ?? null);
  const [error, setError] = useState<string | null>(campaigns === null ? 'Could not load campaigns' : null);
  const [q, setQ] = useState('');
  // one load per mounted editor: `load` is usually an inline arrow, so depending on it would re-fetch on every parent render (review I4)
  const loading = useRef(false);
  useEffect(() => {
    if (campaigns || !load || loading.current) return;
    loading.current = true;
    let alive = true;
    load()
      .then((l) => alive && setList(l))
      .catch(() => alive && setError('Could not load campaigns'));
    return () => {
      alive = false;
      loading.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const set = (s: CampaignScope) => {
    setScope(s);
    onChange?.(s);
  };
  const ids = scope.mode === 'pick' ? scope.ids : [];
  const rules: CampaignRule[] = scope.mode === 'rule' ? scope.rules : [{ op: 'contains', text: '' }];
  const shown = useMemo(() => (list ?? []).filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase())), [list, q]);
  const field = name ?? 'scope';
  return (
    <div className="space-y-3" data-campaign-scope>
      {name && <input type="hidden" name={name} value={JSON.stringify(scope)} />}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('campaigns.title')}>
        {(['all', 'pick', 'rule'] as const).map((m) => (
          <label key={m} className={`btn cursor-pointer ${scope.mode === m ? 'btn-primary' : ''}`}>
            <input
              type="radio"
              className="sr-only"
              name={`${field}-mode`}
              value={m}
              checked={scope.mode === m}
              onChange={() => set(m === 'all' ? { mode: 'all' } : m === 'pick' ? { mode: 'pick', ids } : { mode: 'rule', rules })}
            />
            {m === 'all' ? 'All campaigns' : m === 'pick' ? t('campaigns.pick') : t('campaigns.byRule')}
          </label>
        ))}
      </div>
      {scope.mode === 'pick' && (
        <div className="space-y-2">
          {error && <div className="text-xs text-red-600">{error}. Use a name rule instead, or try again later.</div>}
          {!error && !list && <div className="text-xs text-ink-3">{t('campaigns.loading')}</div>}
          {list && list.length > 6 && <input className="input" placeholder={t('campaigns.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('campaigns.search')} />}
          {list && (
            <ul className="max-h-64 divide-y divide-[var(--line)] overflow-auto rounded-lg border border-[var(--line)]">
              {shown.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={ids.includes(c.id)}
                      onChange={(e) => set({ mode: 'pick', ids: e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id) })}
                    />
                    <span className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT[c.status]}`} title={c.status} aria-hidden="true" />
                    <span className="truncate">{c.name}</span>
                    <span className="ml-auto text-[11px] text-ink-3">{c.status}</span>
                  </label>
                </li>
              ))}
              {list.length === 0 && <li className="px-3 py-2 text-xs text-ink-3">{t('campaigns.noneForAccount')}</li>}
            </ul>
          )}
        </div>
      )}
      {scope.mode === 'rule' && (
        <div className="space-y-2">
          {rules.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-ink-3">{t('common.name')}</span>
              <select className="input w-44" value={r.op} aria-label={t('campaigns.rule')} onChange={(e) => set({ mode: 'rule', rules: rules.map((x, j) => (j === i ? { ...x, op: e.target.value as CampaignRule['op'] } : x)) })}>
                <option value={t('campaigns.contains')}>{t('campaigns.contains')}</option>
                <option value="not_contains">{t('campaigns.notContains')}</option>
              </select>
              <input className="input" value={r.text} placeholder="text" aria-label={t('campaigns.ruleText')} onChange={(e) => set({ mode: 'rule', rules: rules.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
              {rules.length > 1 && (
                <button type="button" className="text-slate-400 hover:text-red-500" aria-label={t('campaigns.removeRule')} onClick={() => set({ mode: 'rule', rules: rules.filter((_, j) => j !== i) })}>
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
          {rules.length < 10 && (
            <button type="button" className="btn" onClick={() => set({ mode: 'rule', rules: [...rules, { op: 'contains', text: '' }] })}>
              {t('campaigns.addRule')}
            </button>
          )}
        </div>
      )}
      <div className="text-xs text-ink-3" data-scope-label>
        {list ? scopeLabel(scope, list) : scope.mode === 'pick' ? `${ids.length} picked` : scopeLabel(scope, [])}
      </div>
    </div>
  );
}
