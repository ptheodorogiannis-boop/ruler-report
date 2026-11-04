'use client';

// The report's period in the editor toolbar (docs/superpowers/specs/2026-11-04-editor-report-management-design.md §2): a preset
// or two dates, and what to compare with. Apply hands the choice to the page, which re-pulls the numbers.
import { useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { useT } from '@/components/i18n-provider';
import type { DateRange } from '@/lib/engine/types';
import { presetRange, type Preset } from '@/lib/util/dates';
import { inferComparison, type ComparisonChoice } from '@/lib/services/period-rules';

const PRESETS: Preset[] = ['previous_month', 'last_30d', 'this_month', 'this_quarter', 'last_90d', 'year_to_date'];
type Cmp = 'previous_period' | 'previous_year' | 'none' | 'custom';

export function PeriodControl({ range, comparison, timezone, onApply }: { range: DateRange; comparison: DateRange | null; timezone: string; onApply: (input: { start: string; end: string; comparison: ComparisonChoice }) => Promise<string | null> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<Preset>('custom');
  const [dates, setDates] = useState<DateRange>(range);
  const [cmp, setCmp] = useState<Cmp>(inferComparison(range, comparison));
  const [cmpDates, setCmpDates] = useState<DateRange>(comparison ?? range);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = (p: Preset) => {
    setPreset(p);
    if (p !== 'custom') setDates(presetRange(p, timezone));
  };
  const apply = async () => {
    setBusy(true);
    setError(null);
    const msg = await onApply({ start: dates.start, end: dates.end, comparison: cmp === 'custom' ? cmpDates : cmp });
    setBusy(false);
    if (msg) setError(msg);
    else setOpen(false);
  };

  return (
    <div className="relative">
      <button type="button" className={`btn ${open ? 'border-brand text-brand' : ''}`} onClick={() => setOpen((v) => !v)} aria-expanded={open} data-period>
        <CalendarRange size={14} /> <span className="num">{`${range.start} → ${range.end}`}</span>
      </button>
      {open && (
        <div className="card rmenu-pop absolute left-0 top-full z-40 mt-1 w-80 space-y-3 p-3" data-period-panel>
          <div>
            <label className="label" htmlFor="period-preset">
              {t('editor.period')}
            </label>
            <select id="period-preset" className="input" value={preset} onChange={(e) => pick(e.target.value as Preset)} data-period-preset>
              {PRESETS.map((p) => (
                <option key={p} value={p}>
                  {t(`presets.${p}`)}
                </option>
              ))}
              <option value="custom">{t('editor.cmpCustom')}</option>
            </select>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input type="date" className="input" value={dates.start} onChange={(e) => (setPreset('custom'), setDates((d) => ({ ...d, start: e.target.value })))} aria-label={t('editor.compareFrom')} />
              <input type="date" className="input" value={dates.end} onChange={(e) => (setPreset('custom'), setDates((d) => ({ ...d, end: e.target.value })))} aria-label={t('editor.compareTo')} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="period-compare">
              {t('editor.compareWith')}
            </label>
            <select id="period-compare" className="input" value={cmp} onChange={(e) => setCmp(e.target.value as Cmp)} data-period-compare>
              <option value="previous_period">{t('editor.cmpPrevious')}</option>
              <option value="previous_year">{t('editor.cmpYear')}</option>
              <option value="none">{t('editor.cmpNone')}</option>
              <option value="custom">{t('editor.cmpCustom')}</option>
            </select>
            {cmp === 'custom' && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input type="date" className="input" value={cmpDates.start} onChange={(e) => setCmpDates((d) => ({ ...d, start: e.target.value }))} aria-label={t('editor.compareFrom')} />
                <input type="date" className="input" value={cmpDates.end} onChange={(e) => setCmpDates((d) => ({ ...d, end: e.target.value }))} aria-label={t('editor.compareTo')} />
              </div>
            )}
          </div>
          {error && <div className="text-xs text-red-600" role="alert">{error}</div>}
          <div className="flex items-center justify-end gap-2">
            {busy && <span className="text-xs text-ink-3">{t('editor.updatingNumbers')}</span>}
            <button type="button" className="btn" onClick={() => setOpen(false)} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn-primary" onClick={apply} disabled={busy} data-period-apply>
              {t('common.apply')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
