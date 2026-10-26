// The live dashboard head (spec v3 §3.5): "Live · updated HH:MM", the client's period picker when the agency allowed
// one, and a silent refresh every two minutes while the page is visible. Plain GET form, so it works without JS.
import { AutoRefresh } from '@/components/auto-refresh';
import { allowedPresets } from '@/lib/services/dashboards';
import { tr } from '@/lib/i18n/request';

export function DashboardControls({ report, preset, compare, updatedAt, timezone, embed, lang }: { report: { preset: string | null; clientPresets: unknown }; preset: string; compare: boolean; dateFormat?: string; updatedAt: string; timezone: string; embed?: boolean; /** the client's ?lang=, kept when a period is applied */ lang?: string }) {
  const presets = allowedPresets(report);
  const rolling = preset !== 'custom';
  let time = '';
  try {
    time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: timezone }).format(new Date(updatedAt));
  } catch {
    time = new Date(updatedAt).toISOString().slice(11, 16);
  }
  return (
    <div className="no-print mt-4 space-y-2" data-dashboard-controls>
      <div className="flex items-center gap-1.5 text-[11px] text-ink-3" data-live-label>
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" /> {tr('public.liveUpdated', { time })}
      </div>
      {presets.length > 1 && (
        <form method="get" className="flex flex-wrap items-center gap-2" data-period-picker>
          {embed && <input type="hidden" name="embed" value="1" />}
          {lang && <input type="hidden" name="lang" value={lang} />}
          <label className="sr-only" htmlFor="dash-preset">
            {tr('public.period')}
          </label>
          <select name="preset" id="dash-preset" defaultValue={preset} className="input w-44 text-sm">
            {presets.map((p) => (
              <option key={p} value={p}>
                {tr(`presets.${p}`)}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="compare" value="1" defaultChecked={compare} /> {tr('public.compare')}
          </label>
          <button className="btn text-sm">{tr('public.apply')}</button>
        </form>
      )}
      {rolling && <AutoRefresh seconds={120} />}
    </div>
  );
}
