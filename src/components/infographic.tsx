// Infographic tiles (spec §6): a progress ring, a ranked list, a big number with an icon, a two-value comparison.
// Server-rendered, plain SVG and HTML: no client JavaScript, same markup in the editor, the client link and print.
import clsx from 'clsx';
import { tr } from '@/lib/i18n/request';
import { Activity, Award, BarChart3, Briefcase, Calendar, Clock, Euro, Eye, Flag, Globe, Heart, Mail, MapPin, Megaphone, MessageCircle, MousePointer, Phone, PieChart, ShoppingCart, Star, Target, TrendingUp, Users, Zap } from 'lucide-react';
import type { TileValue } from '@/lib/engine/types';
import { formatValue } from '@/lib/util/format';
import { Delta, type CardProps } from './widgets';

type IconComponent = React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
/** The icons a stat tile can carry (settings panel shows the same list). */
export const ICONS: Record<string, IconComponent> = {
  'trending-up': TrendingUp,
  users: Users,
  euro: Euro,
  target: Target,
  phone: Phone,
  mail: Mail,
  cart: ShoppingCart,
  eye: Eye,
  'mouse-pointer': MousePointer,
  heart: Heart,
  'message-circle': MessageCircle,
  calendar: Calendar,
  'map-pin': MapPin,
  star: Star,
  award: Award,
  zap: Zap,
  'bar-chart': BarChart3,
  'pie-chart': PieChart,
  activity: Activity,
  globe: Globe,
  megaphone: Megaphone,
  briefcase: Briefcase,
  clock: Clock,
  flag: Flag,
};
export { ICON_NAMES } from '@/lib/layout/icon-names';
export type { IconName } from '@/lib/layout/icon-names';

const R = 36;
const C = 2 * Math.PI * R;

export function Ring({ pct, label }: { pct: number; label: string }) {
  return (
    <svg className="ring" viewBox="0 0 88 88" width="88" height="88" aria-hidden="true">
      <circle className="ring-track" cx="44" cy="44" r={R} />
      <circle className="ring-value" cx="44" cy="44" r={R} strokeDasharray={C.toFixed(2)} strokeDashoffset={(C * (1 - pct / 100)).toFixed(2)} />
      <text className="ring-label" x="44" y="44" textAnchor="middle" dominantBaseline="central">
        {label}
      </text>
    </svg>
  );
}

export function TileCard({ b, fmt, grid }: CardProps) {
  const w = b.widget;
  const v = w.value as TileValue;
  const o = { currency: w.currency, ...fmt };
  const f = (n: number | null | undefined) => formatValue(n, v.format, o);
  const items = v.items ?? [];
  const max = Math.max(...items.map((i) => i.value ?? 0), 0);
  const Icon = v.icon ? ICONS[v.icon] : undefined;

  let body: React.ReactNode;
  if (v.kind === 'progress') {
    const pct = v.target && v.target > 0 && v.value != null ? Math.min(100, Math.max(0, (v.value / v.target) * 100)) : 0;
    body = (
      <div className="flex items-center gap-4">
        <Ring pct={pct} label={`${Math.round(pct)}%`} />
        <div className="min-w-0">
          <div className="kpi-value">{f(v.value)}</div>
          <div className="mt-1 text-xs text-ink-3">
            {v.note ?? '—'}
            {v.target != null && v.target > 0 ? ` · target ${f(v.target)}` : ''}
          </div>
        </div>
      </div>
    );
  } else if (v.kind === 'ranking') {
    body = (
      <ol className="tile-list">
        {items.map((it, i) => (
          <li key={i} className="tile-row">
            <span className="tile-row-label truncate">{it.label}</span>
            <span className="tile-bar" aria-hidden="true">
              <i style={{ width: `${max > 0 ? Math.max(2, ((it.value ?? 0) / max) * 100) : 0}%` }} />
            </span>
            <span className="num tile-row-value">{f(it.value)}</span>
          </li>
        ))}
        {items.length === 0 && <li className="text-xs text-ink-3">{tr('public.nothingToRank')}</li>}
      </ol>
    );
    if (v.note) {
      body = (
        <div>
          {body}
          <div className="mt-2 text-xs text-ink-3">{v.note}</div>
        </div>
      );
    }
  } else if (v.kind === 'compare') {
    const [a, c] = items;
    const diff = a && c && a.value != null && c.value != null && a.value !== 0 ? Math.round(((c.value - a.value) / Math.abs(a.value)) * 100) : null;
    body = (
      <div>
        <div className="tile-list">
          {items.slice(0, 2).map((it, i) => (
            <div key={i} className="tile-row">
              <span className="tile-row-label truncate">{it.label}</span>
              <span className="tile-bar" aria-hidden="true">
                <i style={{ width: `${max > 0 ? Math.max(2, ((it.value ?? 0) / max) * 100) : 0}%` }} />
              </span>
              <span className="num tile-row-value">{f(it.value)}</span>
            </div>
          ))}
        </div>
        {diff != null && a && c && (
          <div className="mt-2 text-xs text-ink-3">
            {c.label} is {Math.abs(diff)}% {diff >= 0 ? 'higher' : 'lower'} than {a.label}
          </div>
        )}
      </div>
    );
  } else {
    body = (
      <div className="flex items-center gap-3">
        {Icon && (
          <span className="tile-icon" data-icon={v.icon} aria-hidden="true">
            <Icon size={20} strokeWidth={1.75} />
          </span>
        )}
        <div className="min-w-0">
          <div className="kpi-value">{f(v.value)}</div>
          {v.comparison && (
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <Delta pct={v.comparison.change_pct} diff={w.diff_type} />
              <span className="num text-xs text-ink-3">vs {f(v.comparison.value)}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('tile', `tile-${v.kind}`, 'card p-4', grid && 'flex h-full flex-col justify-center overflow-hidden')} title={w.description}>
      <div className="mb-2 flex items-center gap-1 text-xs font-medium text-ink-2">
        <span className="truncate">{w.label}</span>
      </div>
      {body}
    </div>
  );
}
