# v2 plan C — custom charts, infographic tiles, image widget, images in text and timeline, cover

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three new widget kinds in the report grid (custom chart from any chart metrics or typed data, infographic tiles, image), images inside analysis cards and timeline events, and the cover banner.

**Architecture:** New `Component` values `custom_chart_v1 | infographic_v1 | image_v1` with special slugs `custom_chart | infographic | image`; their inputs live in `WidgetCustom`; `composeReport` builds their `WidgetValue` from references to catalog values already in the store (chart keys such as `spend_by_date`, number keys such as `spend`, table keys such as `campaigns`) or from typed data; `ensureWidgetValues` learns to fetch those references. Rendering goes through `WidgetCard`; new chart types live in the lazy chart chunk; tiles are plain SVG/HTML.

**Tech Stack:** TypeScript, zod, Recharts 2.15 (area/stacked/donut), node:test + tsx, Playwright smoke.

**Spec:** `docs/superpowers/specs/2026-10-21-v2-features-design.md` §6–§8 (depends on plan B Tasks 1–3 for media and Task 8 for the theme).

## Global Constraints

- No git: each task ends with `npx tsc --noEmit` clean and `npm test` green.
- Never touch `E:\Claude\ruler-reports`.
- The editor is WYSIWYG: `WidgetCard` renders every new kind identically in `grid.tsx` (editor), `LayoutSection` (public) and print.
- New components get entries in **every** registry: `Component` (engine/types), `DEFAULT_SIZE`/`MIN_SIZE` (layout/types), `widgetSchema.component` enum and `customSchema` (compose), `COMP_LABEL`/`SPECIAL_COMPONENT`/`SPECIAL_KEY`/`kindOf` (report-editor), `componentOfValue`/`sizeOfValue` (compose), `reportToCsv` (export), `data-kind` CSS (globals: `data-kind='chart'` rules apply to custom charts — `kindOf(custom_chart_v1) === 'chart'`, `infographic_v1 → 'tile'`, `image_v1 → 'image'`).
- Sizes: custom chart 6×4 (min 3×3), infographic 3×2 (min 2×2), image 6×4 (min 2×2).
- Public report First Load JS stays around 106 kB: `infographic.tsx` and the image widget are server-rendered; only the new chart types join the lazy chart chunk.

## Review Focus

- Series refs whose dates do not line up (one account's daily series shorter than another's, or a weekly re-bucket): the merged chart must align by label and fill gaps with `null`, never shift columns — pinned by Task 2's misaligned-labels test.
- Typed data pasted from a spreadsheet with European decimals (`1.234,5`) and blank cells: the parser must use the project's decimal setting and treat blanks as `null` — pinned by Task 7's paste test.
- A progress tile with target 0 or a negative value: show "—" instead of Infinity/NaN — pinned by Task 3's tests.
- An image widget whose media was deleted: placeholder with the file name, print included — pinned by Task 4's test.
- A ranking tile on a table ref whose chosen column no longer exists (template changed): fall back to the first numeric column and say so in the settings panel — pinned by Task 3's test.

---

### Task 1: Registries for the three components

**Files:**
- Modify: `src/lib/engine/types.ts` (`Component` union; `ImageValue { type: 'image'; url: string; alt: string; caption?: string; fit: 'cover' | 'contain' }`; `TileValue { type: 'tile'; kind: 'progress' | 'ranking' | 'stat' | 'compare'; value?: number | null; target?: number | null; comparison?: NumberValue['comparison']; items?: { label: string; value: number | null }[]; icon?: string; format: Format; note?: string }`; add both to `WidgetValue`), `src/lib/layout/types.ts` (`SPECIAL_SLUGS` + `custom_chart`, `infographic`, `image`; `WidgetCustom` fields from the spec §6; `ChartType` + `'area' | 'stacked' | 'donut'`; sizes), `src/lib/layout/compose.ts` (`customSchema` fields, `widgetSchema.component` enum, `SPECIAL_COMPONENT`, `componentOfValue`), `src/components/report-editor.tsx` (`COMP_LABEL`, `SPECIAL_COMPONENT`, `SPECIAL_KEY`, `kindOf`, `Payload.kind === 'special'` slugs), `src/lib/services/export.ts` (`image` → row with kind `image`, label = alt, value = url; `tile` → kind `tile`, label = kind, value, previous = target ?? comparison value, plus one row per `items[]`)
- Test: `tests/layout.test.ts` (extend `normalizeLayout` test) and `tests/pure.test.ts` (extend the CSV test)

**Interfaces (used by every later task):**
- `WidgetCustom` additions: `series?: { integrationId: number; key: string; label?: string; color?: string }[]`; `manual?: { labels: string[]; series: { label: string; values: (number | null)[] }[] }`; `kind?: 'progress' | 'ranking' | 'stat' | 'compare'`; `ref?: { integrationId: number; key: string }`; `ref2?: { integrationId: number; key: string }` (compare); `target?: number`; `items?: { label: string; value: number }[]`; `tableRef?: { integrationId: number; key: string; column?: string; rows?: number }`; `icon?: string` (one of `ICONS` in Task 5); `url?: string`; `fit?: 'cover' | 'contain'`; `caption?: string`; `alt?: string`.
- Special keys: `custom_chart → 'chart'`, `infographic → 'tile'`, `image → 'image'` (so `valueKey()` returns `null` for them: extend its slug check).

- [ ] **Step 1: Failing tests** — `normalizeLayout` accepts a `custom_chart_v1` widget with `custom.series` and `chartType: 'donut'`, an `infographic_v1` with `kind: 'progress', ref, target: 100`, an `image_v1` with `url: '/api/media/x', fit: 'cover'`; rejects `kind: 'pie'`, `url: 'javascript:x'`, `items` longer than 50. CSV: a `tile` value with items produces one row per item; an `image` value produces one row with the url.
- [ ] **Step 2: Run, fail.** - [ ] **Step 3: Add every registry entry** listed in Files (no rendering yet; `WidgetCard` falls through to `ErrorCard` for the new types until Task 5).
- [ ] **Step 4: `npm test` green, `tsc` clean.**

---

### Task 2: Compose a custom chart from references and typed data

**Files:**
- Create: `src/lib/layout/custom-chart.ts` (pure)
- Modify: `src/lib/layout/compose.ts` (`renderWidget`: `w.slug === 'custom_chart'` → `customChartValue(w, idx)`)
- Test: `tests/layout.test.ts`

**Interfaces:**
- `export function customChartValue(w: LayoutWidget, idx: Map<string, RenderedBlock>): ChartValue | ErrorValue` — manual data → `ChartValue` straight from `custom.manual` (`agg` all `'sum'`); refs → for each `series[i]`, `idx.get(storeKey(integrationId, key, custom.period))` must be a `ChartValue`; take its first series (or all of them when the chart has several and the ref has no `label`), label = `series[i].label ?? sourceLabel`, merge on the union of labels in date order (ISO dates sort; other labels keep first-seen order), missing points `null`; `comparison` merged the same way when every ref has one; no refs resolved → `{ type: 'error', code: 'pending', message: 'Loading…' }`; a ref that is not a chart → `invalid_metrics_combination` with message `"<key>" is not a chart metric`.
- `export function mergeSeries(parts: { labels: string[]; values: (number | null)[] }[]): { labels: string[]; series: (number | null)[][] }`.

- [ ] **Step 1: Failing tests** — `mergeSeries([{ labels: ['2026-09-01','2026-09-02'], values: [1,2] }, { labels: ['2026-09-02','2026-09-03'], values: [5,6] }])` → labels `['2026-09-01','2026-09-02','2026-09-03']`, series `[[1,2,null],[null,5,6]]`; `customChartValue` with two refs in the store (reuse `fakeData()` + two chart blocks added to `widgets`) → a 2-series chart with the right labels; a ref to a number metric → the error with the message above; manual data → chart with `agg: ['sum']`.
- [ ] **Step 2–4 as usual.**

---

### Task 3: Compose infographic tiles

**Files:**
- Create: `src/lib/layout/tiles.ts` (pure)
- Modify: `src/lib/layout/compose.ts` (`w.slug === 'infographic'` → `tileValue(w, idx)`)
- Test: `tests/layout.test.ts`

**Interfaces:**
- `export function tileValue(w: LayoutWidget, idx: Map<string, RenderedBlock>): TileValue | ErrorValue`:
  - `progress`: `value` from `ref` (NumberValue) or `custom.value`; `target` from `custom.target`; `note` = `"${pct}% of target"` when `target > 0`, otherwise `'—'`; negative value → `0 %`.
  - `stat`: `value` + `comparison` from the ref; `icon` from `custom.icon`.
  - `compare`: `items = [{ label: ref label, value }, { label: ref2 label, value }]`; with `custom.items` (two typed entries) when no refs.
  - `ranking`: from `tableRef` → the table's rows sorted desc by `column` (or the first numeric column when `column` is missing or gone; `note = 'Column not found, showing <name>'`), top `rows ?? 5`, `items = [{ label: row[0], value }]`; or `custom.items` sorted desc.
  - Every kind: `format` = ref's format or `custom.format ?? 'number'`; unresolved ref → `pending`.

- [ ] **Step 1: Failing tests** — progress with target 0 → `note === '—'`; progress 25/100 → `'25% of target'`; ranking on the `fakeData` table (add a table block with 3 rows to the fixture) by a missing column → first numeric column + the note; compare from two number refs; stat carries `comparison`.
- [ ] **Step 2–4 as usual.**

---

### Task 4: Compose the image widget and fetch references in `ensureWidgetValues`

**Files:**
- Modify: `src/lib/layout/compose.ts` (`w.slug === 'image'` → `{ type: 'image', url, alt: custom.alt ?? custom.title ?? 'Image', caption, fit: custom.fit ?? 'contain' }`; empty url → `invalid_metrics_combination` "Choose an image"), `src/lib/engine/report.ts › ensureWidgetValues` (for `custom_chart`: `need(s.integrationId, s.key, custom.period)` per `series[]`; for `infographic`: `need` for `ref`, `ref2`, `tableRef`; skip `image`), `src/lib/layout/compose.ts › valueKey` (returns `null` for the three new slugs)
- Test: `tests/layout.test.ts` (service test: a layout with a custom chart referencing `spend_by_date` of the Meta account resolves it into `data.widgets`; after removing the widget the key is pruned)

- [ ] **Step 1: Failing tests** — image compose (url present / missing); service: after `saveLayout` with a `custom_chart` widget `{ series: [{ integrationId: fb.id, key: 'spend_by_date' }] }`, `Object.keys(saved.data.widgets)` includes `${fb.id}:spend_by_date` and the composed widget is a chart with ≥ 28 labels; removing it prunes the key.
- [ ] **Step 2–4 as usual.**

---

### Task 5: Rendering — chart types, tiles, image

**Files:**
- Modify: `src/components/charts.tsx` (`TimeChart`/`CategoryChart` `kind` accepts `'area' | 'stacked' | 'donut'`: area = `AreaChart` with one `Area` per series (stacked when `kind === 'stacked'` via `stackId="s"` on `Bar`s for categorical or `Area`s for time), donut = `PieChart` with `innerRadius="58%"`; keep the current defaults), `src/components/charts-lazy.tsx` (unchanged exports), `src/components/widgets.tsx` (`WidgetCard`: `'tile'` → `TileCard`, `'image'` → `ImageCard`; `ChartCard` handles `custom_chart_v1` through the existing `isTime` test on labels)
- Create: `src/components/infographic.tsx` (server): `TileCard({ b, fmt, grid })` renders by `kind` — progress: SVG ring (r 36, stroke 8, `--block` colour, percentage in the centre, note under), ranking: rows with label, proportional bar, value, stat: `kpi-value` number + icon + caption + delta, compare: two bars + two values + difference; `export const ICONS: Record<string, JSX.Element>` — 24 lucide icons by name (`trending-up, users, euro, target, phone, mail, cart, eye, mouse-pointer, heart, message-circle, calendar, map-pin, star, award, zap, bar-chart, pie-chart, activity, globe, megaphone, briefcase, clock, flag`)
- Create: `src/components/image-card.tsx` (server): `ImageCard({ b, grid })` → card with `MediaImage` (plan B Task 3) sized to the cell (`object-fit` from `fit`), caption under in `text-ink-3` 11 px; the public and print views identical
- Modify: `src/app/globals.css` (`.tile*`, `.ring`, `.imgcard` rules; `data-kind='tile'|'image'` phone rules: tiles half width like KPIs, images full width)
- Test: `tests/v2-tiles.test.ts` (pure render: `renderToStaticMarkup(<TileCard …progress 25/100 />)` contains `25%`; ranking renders 3 rows in desc order; stat shows the icon's `data-icon` name; `ImageCard` with a url renders `<img`, without renders `media-ph`)

- [ ] **Step 1: Failing tests** as listed. - [ ] **Step 2: Run, fail.** - [ ] **Step 3: Implement.** - [ ] **Step 4: Tests, `tsc`, `npm test`.** Browser pane on 3104: the public report of a report that has the three widgets (add them in Task 7) renders them; `NEXT_DIST_DIR=.next-v2 npx next build` → `/r/[token]` ≤ 110 kB.

---

### Task 6: Add-metrics drawer — the "Build" group

**Files:**
- Modify: `src/components/report-editor.tsx › AddMetricsPanel` (`specials` gets `custom_chart` "Custom chart — any chart metrics from any account, or typed data", `infographic` "Infographic tile — progress ring, ranking, big number, comparison", `image` "Image — a creative, screenshot or infographic you made elsewhere"; `addWidget` default `custom` per slug: chart `{ title: 'Custom chart', chartType: 'line', series: [] }`, tile `{ title: 'Progress', kind: 'progress', target: 100 }`, image `{ title: 'Image', fit: 'contain' }`)
- Test: Playwright smoke in `tests/v2-editor.test.ts` (skip without `NAV_BASE`): open `/reports/1`, click "Add metrics" on the first block, click "Custom chart" → a new `.ritem[data-kind="chart"]` exists; same for tile and image.

- [ ] **Step 1–4 as usual** (the smoke test fails until the entries exist; after Step 3 it passes against 3104).

---

### Task 7: Settings panels for the three kinds

**Files:**
- Create: `src/components/widget-settings/custom-chart.tsx` (series picker: account select → list of that account's chart widgets from the catalog (`getCatalog(slug, config)` filtered to `component === 'chart_v1'`, titles shown), add/remove, per-series label and colour; a "Typed data" tab with a small grid editor (labels column + one column per series, "Paste from spreadsheet" textarea that parses TSV/CSV using the project's decimal setting via `parseNumber` from `src/lib/util/format` or the csv parser in `src/lib/util/csv`), chart type buttons incl. area/stacked/donut, group-by), `src/components/widget-settings/tile.tsx` (kind buttons; per kind: ref picker (account → number metric list), target, icon picker grid from `ICONS`, typed items table, table ref picker with column select), `src/components/widget-settings/image.tsx` (`MediaPicker`, fit, caption, alt)
- Modify: `src/components/report-editor.tsx › WidgetSettings` (dispatch by slug to the three panels)
- Test: `tests/v2-editor.test.ts` (extend the smoke: set a series on the custom chart via the UI, save, reload, the chart renders with a `.recharts-wrapper svg`), plus a pure test for the paste parser: `parseTyped("Label\tA\nx\t1.234,5\ny\t\n", 'dot_comma')` → labels `['x','y']`, series `[{ label: 'A', values: [1234.5, null] }]`.

- [ ] **Step 1: Failing paste-parser test** (`export function parseTyped(text: string, decimal: 'comma_dot' | 'dot_comma'): WidgetCustom['manual']` in `custom-chart.tsx`'s sibling `src/lib/layout/typed-data.ts`). - [ ] **Step 2: Run, fail.** - [ ] **Step 3: Implement the parser and the three panels.** - [ ] **Step 4: Tests, `tsc`, `npm test`, smoke on 3104.**

---

### Task 8: Images in analysis cards

**Files:**
- Modify: `src/lib/util/sanitize.ts` (`img` allowed with `src` matching `^/api/media/[a-z0-9]+$` or `^https://`, attributes `alt width height`), `src/components/analysis-panel.tsx` (an "Insert image" button beside the language select, opens `MediaPicker`, inserts `<img src="…" alt="…">` at the textarea caret), `src/app/globals.css` (`.analysis img { max-width: 100%; height: auto; border-radius: 10px; margin: 12px 0; }`)
- Test: `tests/pure.test.ts` (extend the sanitizer test: keeps `<img src="/api/media/abc" alt="a">`, strips `<img src="http://x/y.png">`, strips `onerror`)

- [ ] **Step 1–4 as usual.** Browser pane: insert an image in a card, save, the public report shows it.

---

### Task 9: Timeline event image

**Files:**
- Modify: `prisma/schema.prisma` (`TimelineEvent.image String?`), `src/app/actions/app.ts › addTimelineAction` (reads `image`, same URL rule as the project logo), `src/app/projects/[id]/page.tsx` (picker in the milestone form via a hidden `image` input; thumbnail 96 px in the list), `src/components/public-report.tsx` (cover timeline: `MediaImage` 96 px under the text when set), the automation/timeline API in `src/lib/api/routes.ts` if it serialises events (add `image`)
- Test: `tests/services.test.ts` or `tests/api.test.ts` (whichever covers timeline today: create an event with `image` and read it back)

- [ ] **Step 1–4 as usual.**

---

### Task 10: Cover banner and client mark on the public cover

**Files:**
- Modify: `src/components/public-report.tsx` (order: banner when `data.theme?.cover` (`MediaImage`, `.cover-banner`), then `ClientMark` 48, eyebrow, title…), `src/app/globals.css` (`.cover-banner { aspect-ratio: 16/9; border-radius: 12px; overflow: hidden; margin-bottom: 16px }` and `@media print { .cover-banner { aspect-ratio: 32/9 } }`)
- Test: Playwright on 3104 (skip without `NAV_BASE`): a report whose theme has a cover shows `.cover-banner img`; without, no `.cover-banner`; the overlap scan at 1440/390 on that report stays at 0; login CLS probe unchanged (0).

- [ ] **Step 1–4 as usual.** Finish with `docs/DESIGN.md` "v2 — report look and custom widgets" paragraph: what was added, the registries to update when adding a component, and the measured `/r/[token]` First Load JS from `NEXT_DIST_DIR=.next-v2 npx next build`.
