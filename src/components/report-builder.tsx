'use client';

import { useMemo, useState, useTransition } from 'react';
import { useT } from '@/components/i18n-provider';
import { PlatformIcon } from '@/components/platform-icon';
import { useRouter } from 'next/navigation';
import { createReportAction, listCampaignsAction } from '@/app/actions/app';
import { CampaignScopeEditor } from './campaign-scope-editor';
import type { CampaignScope } from '@/lib/engine/campaigns';
import { PRESET_LABEL, presetRange, previousPeriod, previousYear, type Preset } from '@/lib/util/dates';

export interface BuilderIntegration {
  id: number;
  label: string;
  platform: string;
  slug: string;
  color: string;
  category: string;
  /** ads accounts get a campaign step (spec v3 §2.3) */
  isAds?: boolean;
  campaigns?: CampaignScope;
}
export interface BuilderTemplate {
  id: number;
  title: string;
  description: string;
  isDefault: boolean;
}

const REPORT_PRESETS: Preset[] = ['previous_month', 'this_month', 'last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_quarter', 'year_to_date', 'custom'];
const DASH_PRESETS: Preset[] = ['last_7d', 'last_14d', 'last_30d', 'last_90d', 'this_month', 'previous_month', 'this_quarter', 'year_to_date'];

export function ReportBuilder({ project, templates, integrations, kind }: { project: { id: number; name: string; timezone: string }; templates: BuilderTemplate[]; integrations: BuilderIntegration[]; kind: 'report' | 'dashboard' }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>(kind === 'report' ? 'previous_month' : 'last_30d');
  const initial = presetRange(preset, project.timezone);
  const [from, setFrom] = useState(initial.start);
  const [to, setTo] = useState(initial.end);
  const [cmpMode, setCmpMode] = useState<'previous' | 'year' | 'none' | 'custom'>('previous');
  const [cFrom, setCFrom] = useState('');
  const [cTo, setCTo] = useState('');
  const [templateId, setTemplateId] = useState(templates.find((t) => t.isDefault)?.id ?? templates[0]?.id);
  const [selected, setSelected] = useState<number[]>(integrations.map((i) => i.id));
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState(t('wizard.defaultSubtitle'));
  const [withAi, setWithAi] = useState(true);
  const [scopes, setScopes] = useState<Record<number, CampaignScope>>(() => Object.fromEntries(integrations.filter((i) => i.campaigns).map((i) => [i.id, i.campaigns!])));
  const adsSelected = integrations.filter((i) => i.isAds && selected.includes(i.id));

  const range = useMemo(() => (preset === 'custom' ? { start: from, end: to } : presetRange(preset, project.timezone)), [preset, from, to, project.timezone]);
  const comp = useMemo(() => {
    if (cmpMode === 'none') return null;
    if (cmpMode === 'previous') return previousPeriod(range);
    if (cmpMode === 'year') return previousYear(range);
    return cFrom && cTo ? { start: cFrom, end: cTo } : null;
  }, [cmpMode, range, cFrom, cTo]);

  const tpl = templates.find((t) => t.id === templateId);
  const autoTitle = kind === 'report' ? `${project.name} | ${range.start} → ${range.end}` : `${project.name} | Live dashboard`;

  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  function submit() {
    setError(null);
    if (!templateId) return setError(t('wizard.pickTemplate'));
    if (!selected.length) return setError(t('wizard.selectIntegration'));
    start(async () => {
      const r = await createReportAction({
        projectId: project.id,
        kind,
        title: title || autoTitle,
        subtitle,
        start: kind === 'report' || preset === 'custom' ? range.start : undefined,
        end: kind === 'report' || preset === 'custom' ? range.end : undefined,
        comparisonStart: kind === 'report' ? comp?.start : undefined,
        comparisonEnd: kind === 'report' ? comp?.end : undefined,
        preset: kind === 'dashboard' ? preset : undefined,
        templateId,
        integrationIds: selected,
        withAi: kind === 'report' ? withAi : false,
        campaigns: Object.fromEntries(adsSelected.map((i) => [i.id, scopes[i.id] ?? { mode: 'all' as const }])),
      });
      if (!r.ok) return setError(r.error);
      router.push(`/${r.kind === 'report' ? 'reports' : 'dashboards'}/${r.id}`);
    });
  }

  const byCat = integrations.reduce<Record<string, BuilderIntegration[]>>((m, i) => ((m[i.category] ??= []).push(i), m), {});

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <div className="card space-y-4 p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label">{t('common.title')}</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={autoTitle} />
            </div>
            <div>
              <label className="label">{t('common.subtitle')}</label>
              <input className="input" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">{t('common.template')}</label>
            <select className="input" value={templateId} onChange={(e) => setTemplateId(Number(e.target.value))}>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                  {t.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
            {tpl?.description && <div className="mt-1 text-xs text-slate-500">{tpl.description}</div>}
          </div>
        </div>

        <div className="card space-y-4 p-5">
          <div className="text-sm font-semibold">{t('common.period')}</div>
          <div className="flex flex-wrap gap-1.5">
            {(kind === 'report' ? REPORT_PRESETS : DASH_PRESETS).map((p) => (
              <button key={p} type="button" onClick={() => setPreset(p)} className={preset === p ? 'btn-primary' : 'btn'}>
                {t(`presets.${p}`)}
              </button>
            ))}
          </div>
          {preset === 'custom' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">{t('wizard.from')}</label>
                <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <label className="label">{t('wizard.to')}</label>
                <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-600">
              {range.start} → {range.end}
              {kind === 'dashboard' && <span className="ml-2 text-xs text-slate-400">{t('wizard.rolling')}</span>}
            </div>
          )}
          {kind === 'report' && (
            <div className="space-y-2">
              <label className="label">{t('wizard.compareWith')}</label>
              <div className="flex flex-wrap gap-1.5">
                {([['previous', 'wizard.cmpPrevious'], ['year', 'wizard.cmpYear'], ['custom', 'wizard.cmpCustom'], ['none', 'wizard.cmpNone']] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setCmpMode(k)} className={cmpMode === k ? 'btn-primary' : 'btn'}>
                    {t(l)}
                  </button>
                ))}
              </div>
              {cmpMode === 'custom' && (
                <div className="grid grid-cols-2 gap-3">
                  <input type="date" className="input" value={cFrom} onChange={(e) => setCFrom(e.target.value)} />
                  <input type="date" className="input" value={cTo} onChange={(e) => setCTo(e.target.value)} />
                </div>
              )}
              {comp && cmpMode !== 'custom' && (
                <div className="text-xs text-slate-500">
                  {comp.start} → {comp.end}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-5">
        <div className="card p-5">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold">{t('nav.integrations')}</div>
            <div className="flex gap-2 text-xs">
              <button type="button" className="text-brand" onClick={() => setSelected(integrations.map((i) => i.id))}>
                {t('common.allLower')}
              </button>
              <button type="button" className="text-slate-400" onClick={() => setSelected([])}>
                {t('common.noneLower')}
              </button>
            </div>
          </div>
          {integrations.length === 0 && <div className="text-sm text-slate-500">{t('wizard.noIntegrations')}</div>}
          <div className="space-y-3">
            {Object.entries(byCat).map(([cat, list]) => (
              <div key={cat}>
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{cat}</div>
                {list.map((i) => (
                  <label key={i.id} className="flex items-center gap-2 py-0.5 text-sm">
                    <input type="checkbox" checked={selected.includes(i.id)} onChange={() => toggle(i.id)} />
                    <PlatformIcon slug={i.slug} size={16} />
                    <span className="truncate">{i.label}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
        {adsSelected.length > 0 && (
          <div className="card space-y-4 p-5" data-wizard-campaigns>
            <div>
              <div className="text-sm font-semibold">{t('campaigns.title')}</div>
              <div className="text-xs text-slate-500">Which campaigns of each ads account this {kind} shows. The account&apos;s default is preselected; the editor can still narrow a block later.</div>
            </div>
            {adsSelected.map((i) => (
              <div key={i.id} className="space-y-2 rounded-lg border border-[var(--line)] p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <PlatformIcon slug={i.slug} size={16} /> {i.label}
                </div>
                <CampaignScopeEditor value={scopes[i.id] ?? i.campaigns} load={() => listCampaignsAction(i.id)} name={null} onChange={(s) => setScopes((m) => ({ ...m, [i.id]: s }))} />
              </div>
            ))}
          </div>
        )}
        {kind === 'report' && (
          <label className="card flex items-start gap-2 p-4 text-sm">
            <input type="checkbox" className="mt-0.5" checked={withAi} onChange={(e) => setWithAi(e.target.checked)} />
            <span>
              <strong>{t('wizard.analysisCard')}</strong>
              <span className="block text-xs text-slate-500">{t('wizard.analysisHint')}</span>
            </span>
          </label>
        )}
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <button className="btn-primary w-full" disabled={pending} onClick={submit}>
          {pending ? 'Generating…' : kind === 'report' ? t('wizard.generateReport') : t('wizard.createDashboard')}
        </button>
      </div>
    </div>
  );
}
