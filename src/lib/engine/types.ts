// Shared contracts for the widget engine. Mirrors the shapes Reportei exposes (docs/EVIDENCE.md §3).
import type { CampaignScope } from './campaigns';
import type { Tone } from '@/lib/ai/tones';

export type Component = 'number_v1' | 'chart_v1' | 'datatable_v1' | 'funnel_v1' | 'container_v1' | 'analysis_v1' | 'empty_v1' | 'calculated_v1' | 'custom_chart_v1' | 'infographic_v1' | 'image_v1';
export type Format = 'number' | 'currency' | 'percent' | 'decimal' | 'duration' | 'text';
export type DiffType = 'positive_good' | 'positive_bad' | 'neutral';

export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD inclusive
}

/** How a widget turns primitive daily series into a displayed value. */
export type Calc =
  | { kind: 'sum'; prim: string }
  | { kind: 'avg'; prim: string } // mean of daily values
  | { kind: 'latest'; prim: string } // last day in range (stock metrics: followers, subscribers)
  | { kind: 'ratio'; num: string; den: string; mult?: number; complement?: boolean } // aggregate(num)/aggregate(den)*mult (complement: 100 - value)
  | { kind: 'delta'; prim: string } // latest - first (net follower growth)
  | { kind: 'series'; prims: string[]; labels?: string[] } // time series by date
  | { kind: 'breakdown'; dimension: string; prims: string[]; columns: string[]; limit?: number; sortBy?: string; labels?: string[] }
  | { kind: 'chart_breakdown'; dimension: string; prims: string[]; labels?: string[]; order?: string[] } // categorical chart
  | { kind: 'funnel'; steps: { label: string; prim: string }[] }
  | { kind: 'custom'; formula: string };

export interface WidgetSpec {
  key: string; // "spend" → reference_key "<prefix>:spend"
  component: Component;
  title: string;
  description: string;
  format: Format;
  diff: DiffType;
  calc: Calc;
  filter?: { dimension: string; value: string };
  canAggregate?: boolean;
  tags?: Partial<WidgetTags>;
  group?: string; // UI grouping in the picker
}

export interface WidgetTags {
  cost: 'paid' | 'organic' | 'organic + paid';
  calculation: 'Passed through the network' | 'Estimated by the network' | 'calculated';
  history: 'retroactive' | 'from connection';
  value: 'full value' | 'partial value';
}

/** The catalog entry returned by GET /metrics (Reportei-compatible). */
export interface WidgetDefinition {
  id: string;
  reference_key: string;
  component: Component;
  metrics: string[];
  dimensions?: ({ field: string; operator: string; value: string[] } | string)[];
  type?: string;
  calculated?: boolean;
  references: {
    title: string;
    description: string;
    diff_type: DiffType;
    formatting_function: Format;
    can_be_aggregated: boolean;
    tags: WidgetTags;
    group?: string;
  };
}

// ---------- values ----------
export interface NumberValue {
  type: 'number';
  value: number | null;
  comparison?: { value: number | null; change_pct: number | null; absolute: number | null };
}
export interface ChartValue {
  type: 'chart';
  labels: string[];
  series: number[][];
  seriesLabels?: string[];
  /** how each series re-aggregates when the editor re-buckets a daily series (sum for counts, avg for ratios, last for stock metrics) */
  agg?: ('sum' | 'avg' | 'last')[];
  comparison?: { series: number[][] };
}
export interface TableValue {
  type: 'table';
  columns: string[];
  columnLabels: string[];
  columnFormats: Format[];
  rows: (string | number | null)[][];
  total_rows: number;
}
export interface FunnelValue {
  type: 'funnel';
  steps: { label: string; value: number | null; comparison?: { value: number | null; change_pct: number | null } }[];
}
export interface ErrorValue {
  type: 'error';
  code: 'no_data_in_period' | 'expired_token' | 'invalid_metrics_combination' | 'provider_error' | 'pending' | 'no_campaigns';
  message: string;
}
/** Analysis / free-text card placed in the report grid (sanitised HTML). */
export interface TextValue {
  type: 'text';
  html: string;
}
/** Infographic tile (spec §6): a progress ring, a ranked list, a big number with an icon, or a two-value comparison. */
export interface TileValue {
  type: 'tile';
  kind: 'progress' | 'ranking' | 'stat' | 'compare';
  value?: number | null;
  target?: number | null;
  comparison?: NumberValue['comparison'];
  items?: { label: string; value: number | null }[];
  icon?: string;
  format: Format;
  note?: string;
}
/** An uploaded image placed in the grid (spec §6). */
export interface ImageValue {
  type: 'image';
  url: string;
  alt: string;
  caption?: string;
  fit: 'cover' | 'contain';
}
/** Campaign table (spec v3 §2.3): one row per campaign with the chosen metrics; `values[i]` matches `metrics[i]`. */
export interface ContainerValue {
  type: 'container';
  metrics: { key: string; label: string; format: Format }[];
  rows: { id: string; name: string; status: 'active' | 'paused' | 'other'; values: (number | null)[]; comparison?: (number | null)[] }[];
  truncated: number;
}
export type WidgetValue = NumberValue | ChartValue | TableValue | FunnelValue | ErrorValue | TextValue | TileValue | ImageValue | ContainerValue;

// ---------- connectors ----------
export type DailyData = Record<string, Record<string, number>>; // date → prim → value
export interface BreakdownRow {
  key: string;
  label?: string;
  values: Record<string, number>;
}
/** A campaign of an ads account (spec v3 §2.1). */
export interface Campaign {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'other';
  objective?: string;
}
/** The campaign scope a value was fetched under (spec v3 §2.2), kept with the value so renderers can say so. */
export interface CampaignScopeInfo {
  scope: CampaignScope;
  names: string[];
  missing: number;
  /** the campaign list could not be read: a pick applied by id, names unknown */
  unresolved?: boolean;
}
/** A daily filter: one dimension value, or a list of values ("in") — campaigns use the list form. */
export interface DailyFilter {
  dimension: string;
  value: string | string[];
}

export interface ConnectorContext {
  integration: {
    id: number;
    slug: string;
    name: string;
    sourceId: string;
    config: Record<string, any>;
    credentials: Record<string, any> | null;
  };
}
export interface Connector {
  id: string;
  /** primitive values per day */
  /** `campaignIds` (spec v3 §2.2) narrows the call to those campaigns; `filter` is the widget's own slice and still applies */
  daily(ctx: ConnectorContext, prims: string[], range: DateRange, filter?: DailyFilter, campaignIds?: string[]): Promise<DailyData>;
  breakdown(
    ctx: ConnectorContext,
    dimension: string,
    prims: string[],
    range: DateRange,
    opts?: { limit?: number; sortBy?: string; campaignIds?: string[] }
  ): Promise<BreakdownRow[]>;
  /** period totals for non-additive primitives (reach, unique users) — summing daily values would overcount */
  totals?(ctx: ConnectorContext, prims: string[], range: DateRange, campaignIds?: string[]): Promise<Record<string, number>>;
  /** primitives this connector cannot provide; widgets that need them render a clear "not available" state */
  unsupported?: string[];
  /** optional connection test; throws with a human message */
  validate?(ctx: ConnectorContext): Promise<{ name?: string; config?: Record<string, any> } | void>;
  /** ads accounts: the campaigns a scope can pick from (spec v3 §2.1) */
  listCampaigns?(ctx: ConnectorContext): Promise<Campaign[]>;
}

// ---------- templates & reports ----------
export interface TemplateWidgetRef {
  slug: string; // integration slug the widget belongs to ('custom' = blended metric; 'manual' | 'analysis' | 'calculated' = editor-only widgets)
  key: string; // widget key inside the platform catalog
  /** written by "Save as template" from an edited report: per-widget settings and grid position (src/lib/layout/types.ts) */
  custom?: Record<string, unknown>;
  layout?: { x: number; y: number; w: number; h: number };
}
export interface TemplateSection {
  id: string;
  title: string;
  widgets: TemplateWidgetRef[];
  /** a layout block's campaign scope, carried into generation (spec v3 §2.2) */
  campaigns?: CampaignScope;
  /** block header options saved with a template (spec v3 §4.3) */
  icon?: string;
  subtitle?: string;
  hideHeader?: boolean;
}

export interface RenderedWidget {
  reference_key: string;
  key: string;
  label: string;
  description?: string;
  format: Format;
  diff_type: DiffType;
  currency?: string;
  value: WidgetValue;
}
export interface RenderedBlock {
  integrationId: number;
  platform: string; // display name
  slug: string;
  account_name: string;
  widget: RenderedWidget;
  /** set when the block comes from a report layout (src/lib/layout/compose.ts) */
  id?: string;
  layout?: { x: number; y: number; w: number; h: number };
  custom?: Record<string, unknown>;
  /** ads accounts: the campaign scope this value was fetched under */
  campaignScope?: CampaignScopeInfo;
}
export interface RenderedSection {
  id: string;
  title: string;
  blocks: RenderedBlock[];
  /** layout blocks: the account this block belongs to (integrationId 0 = custom block), so an empty block still shows its header */
  source?: { integrationId: number; slug: string; platform: string; account_name: string };
  /** layout blocks of ads accounts: the scope its widgets were fetched under (from the first scoped value) */
  campaignScope?: CampaignScopeInfo;
  /** block header options (spec v3 §4.3) */
  icon?: string;
  subtitle?: string;
  hideHeader?: boolean;
}
export interface SourceStatus {
  integrationId: number;
  source_id: string;
  platform: string;
  slug: string;
  account_name: string;
  currency: string;
  data_status: 'ok' | 'error' | 'no_data';
  error?: string;
  /** ads accounts: the account's default campaign scope as used at generation (frozen with the snapshot) */
  campaigns?: CampaignScope;
  campaignNames?: string[];
  missingCampaigns?: number;
  /** the campaign list could not be read when generating: a pick applied by id, names unknown */
  campaignsUnresolved?: boolean;
}
export interface ReportData {
  range: DateRange;
  comparison?: DateRange | null;
  sections: RenderedSection[];
  sources: SourceStatus[];
  generated_at: string;
  /** values resolved for the in-report editor (widgets added after generation, custom periods), keyed by "integrationId:key[@start..end]" */
  widgets?: Record<string, RenderedBlock>;
  /** the layout's look, carried by composeReport so renderers get it with the data (src/lib/layout/types.ts) */
  theme?: { accent?: string; palette?: 'brand' | 'vivid' | 'calm' | 'mono'; cover?: string; blocks?: Record<string, { color?: string }>; coverLayout?: 'banner' | 'header' | 'none'; coverText?: string; showPeriod?: boolean };
}

export interface AnalysisCard {
  id: string;
  title: string;
  html: string;
  author: 'human' | 'ai';
  updatedAt: string;
  /** per-block AI (spec v3 §4.4): the card sits right after this block; absent = the top of the report */
  blockId?: string;
  tone?: Tone;
}
