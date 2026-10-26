'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useT } from '@/components/i18n-provider';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import { saveTemplateAction } from '@/app/actions/app';
import type { TemplateSection } from '@/lib/engine/types';

interface SlugOption {
  slug: string;
  name: string;
  category: string;
}
interface MetricDef {
  reference_key: string;
  component: string;
  references: { title: string; group?: string };
}

const COMP_LABEL: Record<string, string> = { number_v1: 'KPI', chart_v1: 'Chart', datatable_v1: 'Table', funnel_v1: 'Funnel', container_v1: 'Container' };

export function TemplateEditor({ initial, slugs, readOnly }: { initial: { id?: number; title: string; description: string; kind: 'report' | 'dashboard'; sections: TemplateSection[] }; slugs: SlugOption[]; readOnly?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [sections, setSections] = useState<TemplateSection[]>(initial.sections.length ? initial.sections : [{ id: 's1', title: 'Section 1', widgets: [] }]);
  const [active, setActive] = useState(0);
  const [slug, setSlug] = useState(slugs[0]?.slug ?? '');
  const [search, setSearch] = useState('');
  const [metrics, setMetrics] = useState<MetricDef[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v2/metrics?integration_slug=${slug}&per_page=100&search=${encodeURIComponent(search)}`, { signal: ctrl.signal });
        const j = await res.json();
        setMetrics(j.data ?? []);
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [slug, search]);

  const sec = sections[active];
  const grouped = useMemo(() => {
    const m = new Map<string, MetricDef[]>();
    for (const d of metrics) m.set(d.references.group ?? 'Other', [...(m.get(d.references.group ?? 'Other') ?? []), d]);
    return [...m];
  }, [metrics]);

  const update = (fn: (s: TemplateSection[]) => TemplateSection[]) => setSections((s) => fn(structuredClone(s)));
  const add = (d: MetricDef) => {
    if (readOnly) return;
    const key = d.reference_key.split(':').slice(1).join(':');
    update((s) => {
      if (!s[active].widgets.some((w) => w.slug === slug && w.key === key)) s[active].widgets.push({ slug, key });
      return s;
    });
  };
  const addAllInGroup = (list: MetricDef[]) => list.forEach(add);
  const slugName = (s: string) => slugs.find((x) => x.slug === s)?.name ?? s;

  const save = () =>
    start(async () => {
      setError(null);
      const r = await saveTemplateAction({ id: initial.id, title, description, kind: initial.kind, sections });
      if (!r.ok) return setError(r.error);
      router.push(`/templates/${r.id}`);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="card grid gap-3 p-4 md:grid-cols-2">
        <div>
          <label className="label">{t('templates.name')}</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} disabled={readOnly} />
        </div>
        <div>
          <label className="label">{t('common.description')}</label>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} disabled={readOnly} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          {sections.map((s, i) => (
            <div key={i} onClick={() => setActive(i)} className={`card cursor-pointer p-3 ${i === active ? 'border-brand ring-2 ring-[var(--brand-soft)]' : ''}`}>
              <div className="flex items-center gap-2">
                <input className="input font-semibold" value={s.title} disabled={readOnly} onChange={(e) => update((x) => ((x[i].title = e.target.value), x))} onClick={(e) => e.stopPropagation()} />
                {!readOnly && (
                  <>
                    <button className="btn px-2" disabled={i === 0} onClick={(e) => (e.stopPropagation(), update((x) => (([x[i - 1], x[i]] = [x[i], x[i - 1]]), x)), setActive(i - 1))}>
                      <ArrowUp size={14} />
                    </button>
                    <button className="btn px-2" disabled={i === sections.length - 1} onClick={(e) => (e.stopPropagation(), update((x) => (([x[i + 1], x[i]] = [x[i], x[i + 1]]), x)), setActive(i + 1))}>
                      <ArrowDown size={14} />
                    </button>
                    <button
                      className="btn-danger px-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (sections.length === 1) return;
                        update((x) => (x.splice(i, 1), x));
                        setActive(Math.max(0, i - 1));
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {s.widgets.length === 0 && <span className="text-xs text-slate-400">{t('templates.empty')}</span>}
                {s.widgets.map((w, wi) => (
                  <span key={wi} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                    <span className="font-semibold text-slate-500">{slugName(w.slug)}</span> {w.key}
                    {!readOnly && (
                      <button onClick={(e) => (e.stopPropagation(), update((x) => (x[i].widgets.splice(wi, 1), x)))} className="text-slate-400 hover:text-red-500">
                        <X size={11} />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {!readOnly && (
            <button className="btn w-full" onClick={() => (update((s) => (s.push({ id: `s${s.length + 1}`, title: `Section ${s.length + 1}`, widgets: [] }), s)), setActive(sections.length))}>
              <Plus size={14} /> {t('templates.addSection')}
            </button>
          )}
        </div>

        <div className="card sticky top-4 max-h-[75vh] space-y-3 overflow-y-auto p-4">
          <div className="text-sm font-semibold">Add to “{sec?.title}”</div>
          <div className="grid grid-cols-2 gap-2">
            <select className="input" value={slug} onChange={(e) => setSlug(e.target.value)}>
              {Object.entries(slugs.reduce<Record<string, SlugOption[]>>((m, s) => ((m[s.category] ??= []).push(s), m), {})).map(([cat, list]) => (
                <optgroup key={cat} label={cat}>
                  {list.map((s) => (
                    <option key={s.slug} value={s.slug}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <input className="input" placeholder={t('editor.searchMetrics')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="text-xs text-slate-400">Widgets apply to every connected {slugName(slug)} account in the report. Custom-data platforms expose widgets based on detected columns.</div>
          {loading && <div className="text-xs text-slate-400">{t('common.loading')}</div>}
          {grouped.map(([g, list]) => (
            <div key={g}>
              <div className="mb-1 flex items-center justify-between">
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{g}</div>
                {!readOnly && (
                  <button className="text-[11px] text-brand" onClick={() => addAllInGroup(list)}>
                    {t('templates.addAll')}
                  </button>
                )}
              </div>
              <div className="space-y-0.5">
                {list.map((d) => {
                  const key = d.reference_key.split(':').slice(1).join(':');
                  const has = sec?.widgets.some((w) => w.slug === slug && w.key === key);
                  return (
                    <button key={d.reference_key} disabled={readOnly || has} onClick={() => add(d)} className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-slate-50 disabled:opacity-40">
                      <span className="truncate">{d.references.title}</span>
                      <span className="ml-2 shrink-0 rounded bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-500">{COMP_LABEL[d.component] ?? d.component}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {!readOnly && (
        <button className="btn-primary" disabled={pending} onClick={save}>
          {pending ? t('common.saving') : t('templates.save')}
        </button>
      )}
    </div>
  );
}
