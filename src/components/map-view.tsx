'use client';

// The interactive part of the map widget (map_v1, docs/superpowers/specs/2026-11-04-map-search-ask-layout-design.md §1):
// the world drawn from public/geo/world-110m.json (fetched once, only on pages with a map), countries with data in five
// steps of the block colour, callouts on the top three, and a panel with the picked country's numbers. Every country with
// data is a button (Enter or Space picks it, Escape clears); the ranked list under it is rendered by the server card.
import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus, X } from 'lucide-react';
import type { MapValue } from '@/lib/engine/types';
import { countryName, numericOf } from '@/lib/geo/countries';
import { formatValue, type FormatOpts } from '@/lib/util/format';

interface Shapes {
  width: number;
  height: number;
  countries: { id: string; d: string; box: [number, number, number, number] }[];
}
let shapes: Promise<Shapes> | null = null;
const loadShapes = () => (shapes ??= fetch('/geo/world-110m.json').then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))));

export interface MapLabels {
  clear: string;
  top: string;
  pick: string;
  loading: string;
  error: string;
}

/** The view box: the countries with data, padded 8 %, at least 160 × 80, at most the world, always 2 : 1. */
function viewOf(boxes: [number, number, number, number][], W: number, H: number): [number, number, number, number] {
  if (!boxes.length) return [0, 0, W, H];
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const b of boxes) [x0, y0, x1, y1] = [Math.min(x0, b[0]), Math.min(y0, b[1]), Math.max(x1, b[2]), Math.max(y1, b[3])];
  let w = Math.max(160, (x1 - x0) * 1.16);
  let h = Math.max(80, (y1 - y0) * 1.16);
  if (w / h > 2) h = w / 2;
  else w = h * 2;
  w = Math.min(W, w);
  h = Math.min(H, h);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return [Math.min(Math.max(0, cx - w / 2), W - w), Math.min(Math.max(0, cy - h / 2), H - h), w, h];
}

const stepOf = (v: number | null, steps: number[]) => (v == null ? null : steps.filter((t) => v > t).length);
const pct = (cur: number | null, prev: number | null) => (cur == null || prev == null || prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100);

export default function MapView({ value, locale, fmt, labels }: { value: MapValue; locale: string; fmt: FormatOpts; labels: MapLabels }) {
  const [world, setWorld] = useState<Shapes | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    loadShapes().then(setWorld, () => setFailed(true));
  }, []);
  useEffect(() => {
    if (!picked) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPicked(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picked]);

  const byNumeric = useMemo(() => new Map(value.countries.map((c) => [numericOf(c.code) ?? '', c])), [value.countries]);
  const fmtOf = (i: number) => ({ ...fmt, currency: value.metrics[i]?.currency ?? fmt.currency });
  const show = (v: number | null, i: number) => (v == null ? '' : formatValue(v, value.metrics[i]?.format ?? 'number', fmtOf(i)));
  const nameOf = (code: string) => countryName(code, locale);

  if (failed) return <div className="map-empty text-sm text-ink-3">{labels.error}</div>;
  if (!world) return <div className="map-stage map-loading" aria-busy="true" aria-label={labels.loading} />;

  const withData = world.countries.filter((s) => byNumeric.get(s.id)?.values[0] != null);
  const [vx, vy, vw, vh] = viewOf(
    withData.map((s) => s.box),
    world.width,
    world.height,
  );
  const top = value.countries.slice(0, 3);
  const current = value.countries.find((c) => c.code === picked) ?? value.countries[0];
  const pick = (code: string) => setPicked((p) => (p === code ? null : code));

  return (
    <div className="map-view">
      <div className="map-stage">
        <svg className="map-svg" viewBox={`${vx} ${vy} ${vw} ${vh}`} preserveAspectRatio="xMidYMid meet" role="group" aria-label={value.shade.label}>
          {world.countries.map((s) => {
            const c = byNumeric.get(s.id);
            const v = c?.values[0] ?? null;
            if (!c || v == null) return <path key={s.id} d={s.d} className="map-shape" aria-hidden="true" />;
            const label = `${nameOf(c.code)}: ${show(v, 0)}`;
            return (
              <path
                key={s.id}
                d={s.d}
                className="map-shape map-country"
                data-step={stepOf(v, value.steps) ?? 0}
                role="button"
                tabIndex={0}
                aria-pressed={picked === c.code}
                aria-label={label}
                onClick={() => pick(c.code)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    pick(c.code);
                  }
                }}
              >
                <title>{label}</title>
              </path>
            );
          })}
        </svg>
        {top.map((c) => {
          const s = world.countries.find((x) => x.id === numericOf(c.code));
          if (!s) return null;
          const left = (((s.box[0] + s.box[2]) / 2 - vx) / vw) * 100;
          // above the country, so the label never hides it (the callout's bottom edge sits on the country's top)
          const topPct = ((s.box[1] - vy) / vh) * 100;
          if (left < 0 || left > 100 || topPct < 0 || topPct > 100) return null;
          return (
            <span key={c.code} className="map-callout" style={{ left: `${left}%`, top: `${topPct}%` }} aria-hidden="true">
              {nameOf(c.code)} <span className="num">{show(c.values[0], 0)}</span>
            </span>
          );
        })}
      </div>
      {current && (
        <div className="map-panel tone-smoke" aria-live="polite">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs text-ink-2">{picked ? labels.pick : labels.top}</div>
              <div className="map-panel-name">{nameOf(current.code)}</div>
            </div>
            {picked && (
              <button type="button" className="icon-btn h-8 w-8" onClick={() => setPicked(null)} aria-label={labels.clear}>
                <X size={14} strokeWidth={1.5} />
              </button>
            )}
          </div>
          <dl className="map-panel-rows">
            {value.metrics.map((m, i) => {
              const ch = pct(current.values[i], current.previous[i]);
              const Icon = ch == null || ch === 0 ? Minus : ch > 0 ? ArrowUpRight : ArrowDownRight;
              return (
                <div key={i} className="map-panel-row">
                  <dt className="text-xs text-ink-2">
                    {m.label}
                    {m.platform && <span className="text-ink-3"> · {m.platform}</span>}
                  </dt>
                  <dd className="flex items-baseline justify-between gap-2">
                    <span className="num map-panel-value">{m.error ? <span className="text-xs text-ink-3">{m.error}</span> : current.values[i] == null ? '' : show(current.values[i], i)}</span>
                    {ch != null && (
                      <span className="num inline-flex items-center gap-0.5 text-xs text-ink-2">
                        <Icon size={13} strokeWidth={2} aria-hidden="true" />
                        {Math.abs(ch).toFixed(1)}%
                      </span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}
    </div>
  );
}
