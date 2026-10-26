// Pure helpers for the report's look (spec §5): palettes, theme edits, and the CSS variables renderers set from a theme.
// Safe for the client editor and the server.
import type { CSSProperties } from 'react';
import type { PaletteName, ReportLayout, ReportTheme } from './types';

/** Series colours. "brand" is the accent followed by hues that stay apart for colour-blind readers (docs/DESIGN.md › Tokens). */
const HUES = ['#0e9f8e', '#d97a1d', '#7c5ce6', '#b8321f', '#557086', '#11784a', '#8a6d3b'];
/** The chart palette when a report has no theme (the same list charts.tsx starts from). */
export const DEFAULT_PALETTE = ['#1a36e6', ...HUES];
export const PALETTES: Record<Exclude<PaletteName, 'brand'>, string[]> = {
  vivid: ['#2563eb', '#f43f5e', '#f59e0b', '#10b981', '#8b5cf6', '#06b6d4', '#84cc16', '#ec4899'],
  calm: ['#3b5b8c', '#6d8fb3', '#2f6f6a', '#6aa39d', '#b08968', '#9fb8d1', '#d4b483', '#8a5a44'],
  mono: ['#101418', '#3a414a', '#636d7c', '#8c95a3', '#b4bbc5', '#4b5563', '#cfd4dc', '#1f2937'],
};

export function paletteFor(name: PaletteName | undefined, accent: string): string[] {
  if (!name || name === 'brand') return [accent, ...HUES];
  return PALETTES[name];
}

/** Drops empty keys; undefined when nothing is left, so a report without a look stores no theme at all. */
export function cleanTheme(t: ReportTheme | undefined): ReportTheme | undefined {
  if (!t) return undefined;
  const out: ReportTheme = {};
  if (t.accent) out.accent = t.accent;
  if (t.palette && t.palette !== 'brand') out.palette = t.palette;
  if (t.cover) out.cover = t.cover;
  if (t.coverLayout && t.coverLayout !== 'banner') out.coverLayout = t.coverLayout;
  if (t.coverText) out.coverText = t.coverText;
  if (t.showPeriod === false) out.showPeriod = false;
  if (t.blocks) {
    const blocks: Record<string, { color?: string }> = {};
    for (const [id, b] of Object.entries(t.blocks)) if (b?.color) blocks[id] = { color: b.color };
    if (Object.keys(blocks).length) out.blocks = blocks;
  }
  return Object.keys(out).length ? out : undefined;
}

/** A new layout with one block's colour set (hex) or cleared (null). */
export function withBlockColor(layout: ReportLayout, blockId: string, color: string | null): ReportLayout {
  const blocks = { ...(layout.theme?.blocks ?? {}) };
  if (color) blocks[blockId] = { color };
  else delete blocks[blockId];
  const theme = cleanTheme({ ...(layout.theme ?? {}), blocks });
  const { theme: _old, ...rest } = layout;
  void _old;
  return theme ? { ...rest, theme } : rest;
}

// ───────────── colour maths ─────────────
const INK = '#101418';
const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
};
const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0')).join('');
const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
/** WCAG relative luminance. */
export function luminance(color: string): number {
  const [r, g, b] = rgb(color);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
/** WCAG contrast ratio of a colour against white. */
export const contrastOnWhite = (color: string) => 1.05 / (luminance(color) + 0.05);
/** Linear mix in sRGB: t = 0 → a, t = 1 → b. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  return hex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

/** A block's colour: its own, else the platform's; colours under 3:1 on white are mixed with 45 % ink so hairlines and badges stay visible. */
export function blockColorOf(theme: ReportTheme | undefined, blockId: string, platformColor: string): string {
  const own = theme?.blocks?.[blockId]?.color;
  const c = (own ?? platformColor).toLowerCase();
  return contrastOnWhite(c) < 3 ? mix(c, INK, 0.45) : c;
}

export function blockVars(theme: ReportTheme | undefined, blockId: string, platformColor: string): CSSProperties {
  return { '--block': blockColorOf(theme, blockId, platformColor) } as CSSProperties;
}

/** The report root's variables: the theme accent, else the client's colour. */
export function themeVars(theme: ReportTheme | undefined, clientColor: string): CSSProperties {
  const accent = theme?.accent ?? clientColor;
  return { '--brand': accent, '--brand-soft': accent + '1a', ...(theme?.coverText ? { '--cover-text': theme.coverText } : {}) } as CSSProperties;
}
