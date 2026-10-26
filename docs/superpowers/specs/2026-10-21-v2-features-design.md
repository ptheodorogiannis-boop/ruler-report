# Ruler Reports v2 — design spec

Date: 2026-10-21. Status: for review. Scope: the v2 copy of Ruler Reports (this folder, `E:\Claude\ruler-reports-v2`).

## Purpose

Ruler Agency runs client reporting in Ruler Reports. The demo at `E:\Claude\ruler-reports` stays live on its tunnel and is never
changed again; v2 is where the product grows. v2 must let an agency user:

1. tell clients apart at a glance (client logos, platform marks),
2. make a report look like the client's (accent colour per report, colour per channel block),
3. go beyond the fixed widget set (custom charts from any metrics or typed data, infographic tiles, imported images),
4. and use a navigation that never cuts items off or draws in the wrong place.

A Reportei parity audit and a user-review audit (running in the background) produce a separate, prioritised list reviewed
with the user before anything from it is built. It is **out of scope for this spec**.

## Constraints

- Stack as is: Next.js 15 app router, React 19, Prisma + SQLite, Tailwind, Recharts (lazy), `motion` only in the shell. No git.
- Design tokens and structure of docs/DESIGN.md stay (paper/ink/line/brand, ruler band, caliper KPIs, dossier report).
- The editor stays WYSIWYG: anything the public report shows is what the editor shows.
- Performance stays: public report route around 106 kB First Load JS; new chart kinds load lazily with the existing chart chunk.
- No native image libraries (`sharp`); no SVG uploads (script risk); files on disk, not blobs in SQLite.
- Tests: `npm test` (node:test against a throw-away SQLite) must stay green; new logic gets unit tests next to the existing ones.

## 0. The copy and its setup

- Folder `E:\Claude\ruler-reports-v2`, copied with the demo database and `node_modules`, without build output.
- Dev server on port **3104** (`.env` `APP_URL=http://localhost:3104`, `package.json` dev/start scripts, launch config
  `ruler-reports-v2` in `E:\Claude\.claude\launch.json`). Production later on 3105 with its own `.preview-url` and tunnel.
- Schema changes are applied with `prisma db push` to the v2 `prisma/dev.db` only.
- Uploads live in `data/uploads/` (git-ignored, a Docker volume in `docker-compose.yml`).

## 1. Navigation: plain top nav, no scroll ruler

**Problem.** The slide-rule nav measures the active item with JavaScript (marker lags, lands wrong after navigation or font
load), hides items behind fade masks on narrow windows, and the fixed scroll ruler covers content and shows stale marks.

**Design.**
- `src/components/top-nav.tsx` (server component, no client JS): the three groups rendered as `<nav><ul>` of links with
  `aria-current="page"` on the active item. Layout: `display: flex; flex-wrap: wrap` with the group separator as today; the
  active item gets a 3 px ink underline drawn by CSS (`.is-active::after`); the small tick marks under items stay as
  decoration (`::before` on each item). Below 768 px the rail keeps its two-row layout (pass 5c) and the nav row wraps too.
  Hover: text colour only. No ghost, no marker, no measurement, no masks, no horizontal scroll.
- `ScrollRuler` is removed: the component file, `.sruler*` CSS, and the 56 px left padding of `.frame-main` at ≥1024 px
  returns to 40 px (symmetric).
- `slide-nav.tsx`, `scroll-ruler.tsx` and their CSS are deleted; docs/DESIGN.md gets a short "v2: navigation" note.

**Testing.** The text-collision scan at 1440/1280/1024/768/390 reports no overlaps on overview, reports, a project and the
editor; every nav item is visible (bounding box inside the viewport) at every width; keyboard focus order follows the DOM.

## 2. Media service (foundation for logos, images, infographics)

**Data.** Prisma model `Media { id String @id (cuid), companyId Int, projectId Int?, name String, mime String, size Int,
width Int?, height Int?, createdAt DateTime }`; file at `data/uploads/<companyId>/<id>.<ext>`.

**Routes** (`src/app/api/media/…`, outside the public API v2 namespace):
- `POST /api/media` — multipart `file` (+ optional `projectId`); requires a signed-in user with write rights; accepts
  `image/png`, `image/jpeg`, `image/webp`, `image/gif`; max 5 MB; width/height come from the client (the picker reads
  `naturalWidth/Height` before uploading) and are stored as given. Returns `{ id, url, width, height }` with
  `url = /api/media/<id>`.
- `GET /api/media/[id]` — streams the file with its mime, `Cache-Control: public, max-age=31536000, immutable`. Public by
  unguessable id (same model as share tokens) so client links can show the images without a session.
- `DELETE /api/media/[id]` — owner/editor of the company; deletes the row and the file. Widgets or HTML that still point at
  it show the image widget's "missing image" state (a dashed placeholder with the file name).

**Picker.** `src/components/media-picker.tsx` (client): a button that opens a small panel with drag-and-drop / file input,
upload progress, the company's recent media as thumbnails (newest first, 24 at a time), and an "External URL" field for
logos hosted elsewhere. It returns `{ url, width, height }` to its caller. Errors (too large, wrong type, network) show
inline in the panel; nothing is saved until the upload succeeds.

**Sanitizer.** `sanitizeHtml` allows `<img>` with `src` that starts with `/api/media/` or `https://`, plus `alt`, `width`,
`height`; anything else on the tag is dropped.

**Tests.** Unit: mime/size validation, the sanitizer rule, path building (no traversal: ids are cuids, extension from a
whitelist). Integration (node:test with the test DB): upload → GET streams the same bytes → DELETE removes file and row;
unauthenticated upload is 401; a client-role user cannot upload.

## 3. Client logos

- `Project.logo` (exists, unused) holds a URL: a media URL from the picker or an external URL.
- Project settings form (the project page's settings tab) gains a logo field using the picker, with preview and "remove".
- `src/components/client-mark.tsx` (server): `<ClientMark project size>` renders the logo (`object-fit: contain`, in a
  rounded tile with a hairline) or, without a logo, a monogram: the first letter of the client's name in the brand colour on
  its soft tint (same construction as `BrandMark`). Sizes 24 / 32 / 48.
- Placements: projects list (row/card), overview board client cell (before the name), reports index rows and the hover
  cover, the report page title eyebrow, the public report and dashboard cover (above the eyebrow, 48 px), the public header
  keeps the agency logo. Alt text is the client's name.

**Tests.** `ClientMark` snapshot-free unit test (monogram letter and colour; logo path); the public report HTML contains the
client mark; the overlap scan stays clean.

## 4. Platform icons

- Dependency `simple-icons` (CC0 brand marks, SVG paths). `src/lib/catalog/platform-icons.ts` maps every integration slug to
  an icon slug (facebook, instagram, youtube, linkedin, tiktok, pinterest, threads, x, meta (ads), googleads, googleanalytics,
  googlesearchconsole, googlemybusiness, woocommerce, shopify, mailchimp, hubspot, klaviyo, googlesheets, …) and to a
  fallback glyph per category (table for csv/custom, phone for calls).
- `src/components/platform-icon.tsx` (server): `<PlatformIcon slug size tone>`; `tone="brand"` fills with the integration's
  colour, `tone="ink"` uses current colour. Inline `<svg>` with the path, `aria-hidden`, the name carried by surrounding text.
- Placements: `PlatformBadge` (block headers, editor and public), public cover sources list, integrations page and
  connect/pick pages, the add-metrics drawer source list, the report builder source picker. The coloured dot is replaced
  everywhere; the dot stays only where there is no icon.

**Tests.** Every slug in `INTEGRATIONS` resolves to an icon or a declared fallback (unit test over the catalog). Bundle:
icons are inline SVG in server components, so no client JS is added.

## 5. Colours per report and per channel ("Look")

**Data.** `ReportLayout.theme?: { accent?: string; palette?: 'brand' | 'vivid' | 'calm' | 'mono'; cover?: string;
blocks?: Record<blockId, { color?: string }> }` validated by zod (hex colours, known palette names, cover is a media or https
URL). No schema change; dashboards share it (same layout model).

**Editor.** A "Look" drawer next to "Settings": accent colour (colour input, "use client colour" reset), palette preset with a
swatch strip preview, cover image (picker, optional). Each block header menu gets "Block colour" (colour input, "use
platform colour" reset).

**Render.** The report root sets `--brand` / `--brand-soft` from the theme accent when present (public, dashboard, editor);
each section sets `--block` from its block colour, defaulting to the platform colour; the badge dot/icon, KPI highlight
border and the chart's primary series use `--block`; multi-series charts use the palette preset (four fixed lists in
`charts.tsx`, "brand" derived from the accent). CSV export is unaffected.

**Tests.** zod accepts/rejects themes; `composeReport` carries `theme` through; a public report with a theme renders the
variables (string assertion on the HTML).

## 6. Custom charts, infographic tiles and the image widget

New `Component` values `custom_chart_v1`, `infographic_v1`, `image_v1` (engine types, zod, `DEFAULT_SIZE` 6×4 / 3×2 / 6×4,
`MIN_SIZE`, `COMP_LABEL`, `kindOf`, `data-kind`, CSV export).

**WidgetCustom additions.**
- custom chart: `series?: { integrationId: number; key: string; label?: string; color?: string }[]`;
  `manual?: { labels: string[]; series: { label: string; values: number[] }[] }`; `chartType` extended to
  `'line' | 'area' | 'bar' | 'stacked' | 'pie' | 'donut'`; `groupBy` as today.
- infographic: `kind: 'progress' | 'ranking' | 'stat' | 'compare'`; `ref?: { integrationId; key }` (a number metric),
  `target?: number`, `items?: { label: string; value: number }[]` (typed data), `tableRef?: { integrationId; key; rows: number }`
  (ranking from a table metric), `icon?: string` (a name from a 24-icon lucide subset), `format?: Format`.
- image: `mediaId`/`url`, `fit: 'cover' | 'contain'`, `caption?: string`, `alt?: string`.

**Resolution (compose + service).** Series refs resolve the metric's daily series for the report range and comparison.
`src/lib/engine/report.ts` already derives `*_by_date` charts from each connector's daily data; it gets
`resolveSeries(integrationId, keys, range, comparison)` that returns a `ChartValue` per key through the same archetype
aggregation (sum/avg/last), stored under `storeKey(integrationId, 'series:' + key)`. `saveLayout` resolves and prunes those
keys exactly like editor-added widgets. Manual data needs no resolution. A ref whose series cannot be produced (metric has
no daily form) renders the pending/error card with a clear message in the settings panel ("this metric has no daily series;
use the KPI instead").

**Rendering.** `custom_chart_v1` → `ChartCard` with the new chart types (area, stacked, donut added to `charts.tsx`, still in
the lazy chunk). `infographic_v1` → `src/components/infographic.tsx`: progress ring (SVG arc, value/target, percentage),
ranking (label + proportional bar, top N), stat (big number, icon, caption, delta if the ref has a comparison), compare (two
values, two bars, difference). `image_v1` → `<img>` from `/api/media/<id>` in a card with caption; "missing image" state.
All three render identically in the editor, the public report and print.

**Editor.** The add-metrics drawer gets a "Build" group: Custom chart, Infographic, Image. Settings panels: series picker
(account → metric list, add/remove, colour per series) or a typed-data table (labels row, one column per series, paste from a
spreadsheet supported), chart type and group-by; infographic kind, ref/typed inputs, target, icon; image picker, fit, caption.

**Tests.** Unit: compose of each new component from the store (series, manual, infographic kinds, missing ref → pending);
zod schema; CSV rows for each kind; `resolveSeries` on the demo connector. Playwright smoke on the dev server: add each
widget to a block in the editor, save, open the client link, the widget is there.

## 7. Images in analysis cards and timeline events

- Analysis editor (`analysis-panel.tsx`): an "Insert image" button opens the picker and inserts `<img src alt>` at the
  caret (or appends). The sanitizer rule from §2 keeps it; the public report's `.analysis img` style: max-width 100 %,
  rounded, 12 px top/bottom margin.
- `TimelineEvent.image String?` (URL); the timeline form gains the picker; the cover timeline on the public report shows a
  96 px thumbnail under the event text; the internal timeline list shows it too.

## 8. Report cover image and client mark (public)

The cover column shows, in order: client mark (48 px), eyebrow, title, subtitle, period band; when `theme.cover` is set, a
banner image (16:9, `object-fit: cover`, rounded) sits above the client mark. Print keeps the banner at half height.

## Error handling

- Uploads: size/type rejected before the request leaves the browser and again on the server; server errors show in the
  picker; nothing partial is saved (file write then row insert; on insert failure the file is removed).
- Missing media (deleted or external URL down): widgets and marks show a neutral placeholder, never a broken image icon;
  `onError` swaps to the placeholder on the client.
- Unresolvable series refs: pending card with the reason; the report still renders.
- Theme values are validated; an invalid theme is ignored, not fatal.

## Non-goals

Video, PDF uploads, image cropping/resizing on the server, SVG uploads, per-widget fonts, drag-reorder of blocks (still
arrows), anything from the audits.

## Order of work

0 setup → 1 navigation → 2 media service → 3 client logos → 4 platform icons → 5 colours → 6 custom charts, infographics,
image widget → 7 analysis and timeline images → 8 cover. Each step: tests green, `tsc` clean, checked on the 3104 dev
server, a line in docs/DESIGN.md. The audits' list is a separate spec afterwards.
