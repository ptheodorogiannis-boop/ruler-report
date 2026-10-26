// Per-report layout for the in-report editor (Reportei's block → widgets → layout {x,y,w,h} + custom model,
// docs/REPORTEI-DEEP-DIVE.md §3.3–3.4). Stored as JSON on Report.layout. Pure types only — safe for the client.
import type { Component, DateRange, Format } from '@/lib/engine/types';
import type { IconName } from './icon-names';
import type { CampaignScope } from '@/lib/engine/campaigns';

export const GRID_COLS = 12;
export const GRID_ROW_HEIGHT = 64; // px
export const GRID_GAP = 12; // px

export type GroupBy = 'day' | 'week' | 'month' | 'quarter';
export type ChartType = 'line' | 'bar' | 'pie' | 'area' | 'stacked' | 'donut';
export type TileKind = 'progress' | 'ranking' | 'stat' | 'compare';
export interface MetricRef {
  integrationId: number;
  key: string;
}
export type SortDir = 'asc' | 'desc';

/** Editor-only widget sources that are not backed by an integration. */
export const SPECIAL_SLUGS = ['custom', 'manual', 'analysis', 'calculated', 'custom_chart', 'infographic', 'image', 'container'] as const;
export type SpecialSlug = (typeof SPECIAL_SLUGS)[number];
export const isSpecialSlug = (s: string): s is SpecialSlug => (SPECIAL_SLUGS as readonly string[]).includes(s);
/** Campaign table defaults (spec v3 §2.3); here (pure) so the editor panel never imports the engine. */
export const DEFAULT_CONTAINER_METRICS = ['spend', 'impressions', 'clicks', 'cpc', 'conversions'];
export const MAX_CONTAINER_ROWS = 50;

export interface WidgetCustom {
  // every widget
  title?: string;
  description?: string;
  hidden?: boolean;
  // number_v1
  highlight?: boolean;
  showComparison?: boolean; // previous value (default true)
  showVariation?: boolean; // change % (default true)
  showAbsolute?: boolean; // absolute difference (default false)
  positiveBad?: boolean; // invert the colour meaning
  period?: DateRange; // custom period for this widget only
  /** campaign table (spec v3 §2.3): metric keys of the block's platform, status column, campaigns hidden by the author */
  metrics?: string[];
  showStatus?: boolean;
  hiddenCampaigns?: string[];
  // chart_v1
  chartType?: ChartType;
  groupBy?: GroupBy;
  // datatable_v1
  hiddenColumns?: string[];
  columnOrder?: string[];
  sortBy?: string;
  sortDir?: SortDir;
  rows?: number;
  // empty_v1 (manual metric)
  value?: number | null;
  previous?: number | null;
  format?: Format;
  decimals?: number;
  // analysis_v1
  html?: string;
  // calculated_v1
  formula?: string;
  // custom_chart_v1: series from chart metrics of any account, or typed data (spec §6)
  series?: { integrationId: number; key: string; label?: string; color?: string }[];
  manual?: { labels: string[]; series: { label: string; values: (number | null)[] }[] };
  // infographic_v1
  kind?: TileKind;
  ref?: MetricRef; // a number metric
  ref2?: MetricRef; // compare: the second number
  target?: number;
  items?: { label: string; value: number }[]; // typed data for ranking / compare
  tableRef?: MetricRef & { column?: string; rows?: number }; // ranking from a table metric
  icon?: string; // a name from the tile icon set
  // image_v1
  url?: string;
  fit?: 'cover' | 'contain';
  caption?: string;
  alt?: string;
}

export interface LayoutWidget {
  id: string;
  slug: string; // integration slug, or a special slug
  key: string; // catalog key ("spend"), blended id ("cm_3"), or "number" | "text" | "formula" for specials
  component: Component;
  integrationId: number; // 0 for specials / blended
  x: number;
  y: number;
  w: number;
  h: number;
  custom?: WidgetCustom;
}

export interface LayoutBlock {
  id: string;
  title: string;
  integrationId: number; // 0 = custom block (mixes sources)
  slug: string; // integration slug or 'custom'
  widgets: LayoutWidget[];
  /** ads blocks: overrides the account's default campaign scope (spec v3 §2.2) */
  campaigns?: CampaignScope;
  /** block header options (spec v3 §4.3) */
  icon?: IconName;
  subtitle?: string;
  /** hides the title row on the client link and in print; the editor shows it dimmed */
  hideHeader?: boolean;
}

/** The report's look (spec §5): accent colour, chart palette, cover image and a colour per block. All optional. */
export interface ReportTheme {
  accent?: string; // #rrggbb; defaults to the client's brand colour
  palette?: PaletteName;
  cover?: string; // /api/media/<id> or https://…
  blocks?: Record<string, { color?: string }>; // blockId → #rrggbb, defaults to the platform colour
  /** cover layout (spec v3 §4.2): banner above the title (default), full-width header, or no cover column */
  coverLayout?: 'banner' | 'header' | 'none';
  /** #rrggbb colour of the eyebrow and title on the cover; the ink by default */
  coverText?: string;
  /** false hides the period band on the cover */
  showPeriod?: boolean;
}
export const PALETTE_NAMES = ['brand', 'vivid', 'calm', 'mono'] as const;
export type PaletteName = (typeof PALETTE_NAMES)[number];
export const HEX = /^#[0-9a-f]{6}$/i;

export interface ReportLayout {
  version: 1;
  blocks: LayoutBlock[];
  theme?: ReportTheme;
}

/** Default grid sizes per component, as observed in Reportei (KPI 3×2, chart 6×4, table 12×6 …). */
export const DEFAULT_SIZE: Record<Component, { w: number; h: number }> = {
  number_v1: { w: 3, h: 2 },
  chart_v1: { w: 6, h: 4 },
  datatable_v1: { w: 12, h: 6 },
  funnel_v1: { w: 12, h: 5 },
  container_v1: { w: 12, h: 4 },
  analysis_v1: { w: 12, h: 3 },
  empty_v1: { w: 3, h: 2 },
  calculated_v1: { w: 3, h: 2 },
  custom_chart_v1: { w: 6, h: 4 },
  infographic_v1: { w: 3, h: 2 },
  image_v1: { w: 6, h: 4 },
};
export const MIN_SIZE: Record<Component, { w: number; h: number }> = {
  number_v1: { w: 2, h: 2 },
  chart_v1: { w: 3, h: 3 },
  datatable_v1: { w: 4, h: 3 },
  funnel_v1: { w: 4, h: 3 },
  container_v1: { w: 6, h: 3 },
  analysis_v1: { w: 3, h: 1 },
  empty_v1: { w: 2, h: 2 },
  calculated_v1: { w: 2, h: 2 },
  custom_chart_v1: { w: 3, h: 3 },
  infographic_v1: { w: 2, h: 2 },
  image_v1: { w: 2, h: 2 },
};

export interface SourceInfo {
  id: number;
  slug: string;
  name: string;
}
