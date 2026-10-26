'use client';

// Small controls shared by the v2 widget settings panels (spec §6): the metric catalog of an account, selects.
import { useEffect, useState } from 'react';
import { useT } from '@/components/i18n-provider';
import type { Component, Format } from '@/lib/engine/types';
import type { SourceInfo } from '@/lib/layout/types';
import { getIntegrationDef } from '@/lib/catalog/integrations';

export interface CatalogMetric {
  key: string;
  title: string;
  component: Component;
  group?: string;
}
const cache = new Map<number, Promise<CatalogMetric[]>>();

/** The catalog of one connected account, fetched once per account and kept for the page. */
export function useCatalog(source: SourceInfo | null, filter?: (m: CatalogMetric) => boolean): { metrics: CatalogMetric[]; loading: boolean } {
  const [metrics, setMetrics] = useState<CatalogMetric[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!source) {
      setMetrics([]);
      return;
    }
    let p = cache.get(source.id);
    if (!p) {
      p = fetch(`/api/v2/metrics?integration_slug=${encodeURIComponent(source.slug)}&integration_id=${source.id}&per_page=200`, { credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j) => (j.data ?? []).map((d: { reference_key: string; component: Component; references: { title: string; group?: string } }) => ({ key: d.reference_key.split(':').slice(1).join(':'), title: d.references.title, component: d.component, group: d.references.group })))
        .catch(() => [] as CatalogMetric[]);
      cache.set(source.id, p);
    }
    let alive = true;
    setLoading(true);
    p.then((list) => {
      if (!alive) return;
      setMetrics(filter ? list.filter(filter) : list);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.id]);
  return { metrics, loading };
}

export const sourceLabel = (s: SourceInfo) => `${getIntegrationDef(s.slug)?.name ?? s.slug} · ${s.name}`;

export function SourceSelect({ sources, value, onChange, placeholder = 'Account…' }: { sources: SourceInfo[]; value: number | null; onChange: (id: number | null) => void; placeholder?: string }) {
  const t = useT();
  return (
    <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} aria-label={t('editor.account')}>
      <option value="">{placeholder}</option>
      {sources.map((s) => (
        <option key={s.id} value={s.id}>
          {sourceLabel(s)}
        </option>
      ))}
    </select>
  );
}

export function MetricSelect({ metrics, value, onChange, placeholder = 'Metric…', loading }: { metrics: CatalogMetric[]; value: string | null; onChange: (key: string | null) => void; placeholder?: string; loading?: boolean }) {
  const t = useT();
  return (
    <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} aria-label={t('goals.metric')} disabled={loading}>
      <option value="">{loading ? 'Loading…' : placeholder}</option>
      {metrics.map((m) => (
        <option key={m.key} value={m.key}>
          {m.title}
        </option>
      ))}
    </select>
  );
}

const FORMATS: Format[] = ['number', 'currency', 'percent', 'decimal', 'duration'];
export function FormatPick({ value, onChange }: { value: Format; onChange: (f: Format) => void }) {
  const t = useT();
  return (
    <div>
      <label className="label">{t('common.format')}</label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value as Format)}>
        {FORMATS.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <div>
      {label && <div className="label">{label}</div>}
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button key={o.value} type="button" className={`btn flex-1 py-1 ${value === o.value ? 'border-brand text-brand' : ''}`} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
