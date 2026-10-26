'use client';

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { compact, formatValue, type FormatOpts } from '@/lib/util/format';
import type { Format } from '@/lib/engine/types';

// Series palette (docs/DESIGN.md › Tokens): accent first, then hues that stay apart for colour-blind readers; every one ≥ 3:1 on white.
const PALETTE = ['#1a36e6', '#0e9f8e', '#d97a1d', '#7c5ce6', '#b8321f', '#557086', '#11784a', '#8a6d3b'];
const COMPARE = '#c3c9d2';
const GRID = '#eceeea';
const TICK = { fontSize: 11, fill: '#636d7c' };

interface Props {
  labels: string[];
  series: number[][];
  seriesLabels: string[];
  format: Format;
  opts: FormatOpts;
  comparison?: number[][];
  color?: string;
  /** fill the parent (grid cell) instead of a fixed 220px */
  fill?: boolean;
  /** editor override: line (default for time series), bar, stacked bars or area */
  kind?: 'line' | 'bar' | 'pie' | 'area' | 'stacked';
  /** series colours (the report's palette); defaults to the built-in one */
  palette?: string[];
}

const shortDate = (l: string) => (/^\d{4}-\d{2}-\d{2}$/.test(l) ? `${l.slice(8, 10)}/${l.slice(5, 7)}` : l);
const box = (fill?: boolean) => (fill ? { width: '100%', height: '100%', minHeight: 120 } : { width: '100%', height: 220 });

export function TimeChart({ labels, series, seriesLabels, format, opts, comparison, color, fill, kind, palette }: Props) {
  const pal = palette ?? PALETTE;
  const data = labels.map((l, i) => {
    const row: Record<string, number | string> = { label: l };
    series.forEach((s, si) => (row[`s${si}`] = s[i]));
    comparison?.forEach((s, si) => (row[`c${si}`] = s[i]));
    return row;
  });
  const multi = series.length > 1;
  const brand = color ?? pal[0];
  // Recharts resolves axes by looking at direct children, so they are passed as an array, never inside a Fragment
  const axes = [
    <CartesianGrid key="g" stroke={GRID} vertical={false} />,
    <XAxis key="x" dataKey="label" tickFormatter={shortDate} tick={TICK} tickLine={{ stroke: GRID }} axisLine={{ stroke: '#cfd4ce' }} minTickGap={24} tickMargin={6} />,
    <YAxis key="y" tickFormatter={(v) => compact(v)} tick={TICK} tickLine={false} axisLine={false} width={44} />,
    <Tooltip key="t" formatter={(v: number) => formatValue(v, format, opts)} labelFormatter={(l) => String(l)} cursor={{ stroke: '#cfd4ce' }} />,
  ];
  return (
    <div style={box(fill)}>
      <ResponsiveContainer>
        {kind === 'bar' || kind === 'stacked' ? (
          <BarChart data={data} margin={{ top: 8, right: 18, bottom: 0, left: -8 }}>
            {axes}
            {multi && <Legend wrapperStyle={{ fontSize: 12 }} />}
            {comparison && !multi && <Bar dataKey="c0" name="Previous period" fill={COMPARE} radius={[3, 3, 0, 0]} />}
            {series.map((_, i) => (
              <Bar key={i} dataKey={`s${i}`} name={seriesLabels[i]} stackId={kind === 'stacked' ? 's' : undefined} fill={multi ? pal[i % pal.length] : brand} radius={kind === 'stacked' && i < series.length - 1 ? 0 : [3, 3, 0, 0]} />
            ))}
          </BarChart>
        ) : kind === 'area' && multi ? (
          <AreaChart data={data} margin={{ top: 8, right: 18, bottom: 0, left: -8 }}>
            {axes}
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {series.map((_, i) => (
              <Area key={i} type="monotone" dataKey={`s${i}`} name={seriesLabels[i]} stroke={pal[i % pal.length]} fill={pal[i % pal.length]} fillOpacity={0.12} strokeWidth={2} />
            ))}
          </AreaChart>
        ) : multi ? (
          <LineChart data={data} margin={{ top: 8, right: 18, bottom: 0, left: -8 }}>
            {axes}
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {series.map((_, i) => (
              <Line key={i} type="monotone" dataKey={`s${i}`} name={seriesLabels[i]} stroke={pal[i % pal.length]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        ) : (
          <AreaChart data={data} margin={{ top: 8, right: 18, bottom: 0, left: -8 }}>
            <defs>
              <linearGradient id="g0" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={brand} stopOpacity={0.14} />
                <stop offset="100%" stopColor={brand} stopOpacity={0} />
              </linearGradient>
            </defs>
            {axes}
            {comparison && <Line type="monotone" dataKey="c0" name="Previous period" stroke={COMPARE} strokeDasharray="3 4" dot={false} strokeWidth={1.5} />}
            <Area type="monotone" dataKey="s0" name={seriesLabels[0]} stroke={brand} strokeWidth={2} fill="url(#g0)" />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryChart({ labels, series, seriesLabels, format, opts, pie, donut, stacked, fill, palette }: Props & { pie?: boolean; donut?: boolean; stacked?: boolean }) {
  const pal = palette ?? PALETTE;
  const data = labels.map((l, i) => {
    const row: Record<string, number | string> = { label: l };
    series.forEach((s, si) => (row[`s${si}`] = s[i]));
    return row;
  });
  if (pie && series.length === 1 && labels.length <= 12) {
    return (
      <div style={box(fill)}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="s0" nameKey="label" innerRadius={donut ? '58%' : '45%'} outerRadius="75%" paddingAngle={2}>
              {data.map((_, i) => (
                <Cell key={i} fill={pal[i % pal.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => formatValue(v, format, opts)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }
  // long category names are angled; on a narrow chart Recharts then drops the labels that would collide (angle-aware since 2.15),
  // and the chart keeps its left margin so the first angled label is not clipped
  const angled = labels.length > 4 && Math.max(...labels.map((l) => l.length)) > 8;
  return (
    <div style={box(fill)}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: angled ? 12 : -8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={TICK} tickLine={{ stroke: GRID }} axisLine={{ stroke: '#cfd4ce' }} interval="preserveStartEnd" minTickGap={8} tickMargin={6} {...(angled ? { angle: -28, textAnchor: 'end' as const, height: 56, tickFormatter: (l: string) => (l.length > 14 ? `${l.slice(0, 13)}…` : l) } : {})} />
          <YAxis tickFormatter={(v) => compact(v)} tick={TICK} tickLine={false} axisLine={false} width={48} />
          <Tooltip formatter={(v: number) => formatValue(v, format, opts)} cursor={{ fill: 'rgba(16,20,24,0.04)' }} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((_, i) => (
            <Bar key={i} dataKey={`s${i}`} name={seriesLabels[i]} stackId={stacked ? 's' : undefined} fill={pal[i % pal.length]} radius={stacked && i < series.length - 1 ? 0 : [3, 3, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Sparkline({ values, color = '#636d7c' }: { values: number[]; color?: string }) {
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div style={{ width: 90, height: 28 }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.6} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
