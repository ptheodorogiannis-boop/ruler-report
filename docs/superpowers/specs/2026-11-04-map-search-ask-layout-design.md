# Map widget, search, client Ask and the Quantix layout (2026-11-04)

Branch `v4`. Approved in chat on 2026-11-04 (all four recommended options). Builds on the Ruler glass pass
(docs/DESIGN.md › Ruler glass pass): tokens, tones (glass, smoke, solid, inset) and the report accent stay as they are.

## Goal

Make the client-facing report more interactive and easier to read, and make the agency faster at finding things:

1. **Map widget**: a client clicks a country and sees that country's visits, conversions, spend or revenue.
2. **Search**: no more scrolling through long account lists; one search for the whole app.
3. **Client Ask**: on the shared link, a client asks a question in plain words ("how many forms did I get?") and gets a
   short plain-word answer from Claude, using only that report's numbers. The agency sees what clients ask.
4. **Quantix layout** on the client link, live dashboards and the editor preview: grey headline tiles, dark tables
   and bar charts with one highlighted bar, actions in the header.

Success: a client can answer "where do my visitors come from" and "how many leads did I get" without help; the agency
finds any account or report in two keystrokes; the client link reads like the Quantix references while staying Ruler.

## Out of scope

Filtering the whole report by country; app screens other than search (overview, projects, settings keep their
layout); streamed answers; sparklines on stat cards (the caliper stays: unslop and Hallmark both rule sparklines on
stat cards out, and the caliper is the report's signature).

---

## 1. Map widget (`map_v1`)

### Data

- No new connector work. Every "by country" catalog widget (`chart_breakdown` with `dimension: 'country'`, e.g.
  `ga4:sessions_by_country`, `fb_ads:spend_by_country`, `woo:revenue_by_country`, `gsc:clicks_by_country`) already
  resolves to a `ChartValue`: `labels` = countries, `series[i]` = one series per primitive, `comparison.series` = the
  previous period.
- The widget stores its metrics in `custom`:
  - `mapShade`: one ref `{ integrationId, key }`, the metric that colours the countries.
  - `mapPanel`: up to 6 refs `{ integrationId, key }` shown in the panel (default: the shade metric alone).
  - Refs are picked from the report's sources, only among widgets whose dimension is `country` (the same ref picker
    as the comparison container, filtered).
- The engine fetches each ref like a normal widget (`need(integrationId, key)`), so snapshots, live dashboards, the
  layout fingerprint and the data store work unchanged. `compose.ts` builds a new value:

```ts
interface MapValue {
  type: 'map';
  shade: { label: string; format: Format; currency?: string; platform: string; slug: string };
  countries: { code: string; name: string; values: (number | null)[]; previous: (number | null)[] }[]; // ISO 3166-1 alpha-2
  metrics: { label: string; format: Format; currency?: string; platform: string; slug: string; error?: string }[]; // panel columns; values[i] matches metrics[i]; values[0] is the shade metric
  unmatched: { label: string; values: (number | null)[] }[]; // rows whose country could not be resolved ("Other", "(not set)")
}
```

### Country matching (`src/lib/geo/countries.ts`)

- One table of ISO alpha-2 ↔ ISO numeric (the map's ids) ↔ English names, plus the aliases connectors return
  (GA4 English names such as "United States", "Türkiye", "Czechia"; Meta alpha-2 codes such as "GR"; WooCommerce
  alpha-2; Search Console alpha-3 such as "grc").
- `toCountryCode(label): string | null`. Unknown labels go to `unmatched` and are listed under the map, never dropped.
- Display names come from `Intl.DisplayNames([locale], { type: 'region' })`, so the panel reads "Ελλάδα" on a Greek link.

### Map shapes (`public/geo/world-110m.json`)

- Generated once by `scripts/build-world-map.mjs` from Natural Earth 110m (public domain, via the `world-atlas`
  topojson) with `d3-geo` in a scratch folder: each country's SVG path in an equal-area-looking projection (Equal
  Earth), its bounding box and its numeric id. Committed as static JSON (target ≤ 120 KB, served compressed). No
  runtime dependency; the script documents how to regenerate.
- The client component fetches the file only when a map widget is on the page, so other reports pay nothing.

### Drawing (`src/components/map-card.tsx`, client)

- An SVG of the countries. Countries with data are filled in five steps of the block colour (`--block`, the report
  accent by default): quantile steps over the shade values, lightest to strongest, mixed with the card ground with
  `color-mix`, so the accent leads and nothing glows. Countries without data are the quiet grey `--paper`; borders
  are hairlines.
- The view zooms to the bounding box of the countries with data (padded, never closer than a region of ~2,000 km, never
  wider than the world), so a Greek client sees Europe and the Middle East, not the whole globe.
- The top three countries get a callout (country name and the shade value), like the Quantix supplier callouts.
- **Panel**: a smoke tile over the right side of the map (bottom sheet on phones). Empty state: the top country is
  pre-selected. It shows the country name, then one row per panel metric: value, change against the previous period
  (the existing `Delta`), the platform badge. A "Clear" control returns to the overview.
- **Interaction**: click or tap a country; every country with data is also a focusable element (`role="button"`,
  `aria-pressed`, `aria-label="Greece: 3,210 sessions"`), Enter/Space selects, Escape clears. Hover shows the value.
- **Under the map**: a ranked list of the countries (name, shade value, share of total) with the unmatched rows last.
  This list is the accessible fallback and what prints: in print the panel hides, the map stays static, the list stays.
- Sizes: default 12×7 grid cells, minimum 6×5; under 6 columns wide the panel moves under the map.

### Registries (docs/DESIGN.md › every new widget component)

`SPECIAL_SLUGS`, `SPECIAL_COMPONENT/KEY/DEFAULT`, `DEFAULT_SIZE`/`MIN_SIZE`, `customSchema` (`mapShade`, `mapPanel`),
`componentOfValue`, `renderWidget`, `compareNeeds`-style `mapNeeds` in `engine/report.ts`, `layoutFingerprint`,
`refs.ts`, `services/export.ts` (CSV: one row per country and metric), `api/routes.ts` serialiser, the editor drawer
("Map" under the special blocks), `COMP_LABEL`, the widget settings panel (`widget-settings/map.tsx`), i18n (en + el).

---

## 2. Search

### Lists

- A shared client component `ListFilter` (search input with the Lucide search icon, Escape clears, a count
  "4 of 37") that filters the rows inside it by text (`data-search` on each row: account name, id, network).
  Rows that do not match are hidden with `hidden`; a checked row that gets filtered out stays checked and submits.
- Used on: the single-platform connect and reconnect list (`connect/[slug]/pick`), the project's Integrations tab, and
  the global Integrations page. The "accounts found" picker keeps its own search (already there).

### App-wide (`Ctrl+K` / `⌘K`)

- A "Search" pill in the top bar (desktop) and a search icon button (phones), opening a dialog over the page.
- `GET /api/v2/search?q=` (session, 2+ characters, max 8 results per group) returns groups: **Clients** (projects),
  **Reports**, **Dashboards**, **Connected accounts** (integration name, account name, platform → the project's
  Integrations tab), **Connect** (catalog platforms → `/projects/<id>/connect/<slug>`; only when the dialog is opened on a
  page inside a project, which passes its id as `?project=`; elsewhere this group is left out).
- Scope follows `requirePrincipal`: `companyId` and `projectIds`; a client user gets only Reports and Dashboards of
  their projects. Text match is `containsText` (case-insensitive on Postgres and SQLite).
- Dialog: input on top, results grouped, arrow keys move, Enter opens, Escape closes; the last query is kept for the
  session. Debounced 150 ms; aborted when a newer query starts.

---

## 3. Client Ask on the shared link

### Data model (additive; safe on the shared Neon database)

- `Report.clientAsk Boolean @default(false)`.
- New model:

```prisma
model ClientQuestion {
  id        Int      @id @default(autoincrement())
  reportId  Int
  report    Report   @relation(fields: [reportId], references: [id], onDelete: Cascade)
  question  String
  answer    String
  locale    String
  ai        Boolean  @default(true)
  createdAt DateTime @default(now())
  @@index([reportId, createdAt])
}
```

### Agency side

- In the report's "Sharing & delivery" panel: a checkbox "Let the client ask questions about this report" (writers
  only). Disabled with the reason "Needs ANTHROPIC_API_KEY on the server" when the key is missing.
- Below it, "Questions from the client": the last 20 questions with date, question and answer (folded), newest first.
- The existing in-app "Ask your data" box on the report page is unchanged (it is the agency's tool).

### Client side (`/r/<token>` and `/d/<token>`)

- Shown only when `clientAsk` is on, the link is enabled, the password (if any) is unlocked, and AI is configured.
- A glass tile under the cover: title "Ask about this report", three suggested question chips, an input
  (max 300 characters) and a send button; the answer appears under the input with a quiet note "Answered from this
  report's numbers".
- Suggested questions are built without AI from the report's metrics, from i18n templates in the link's language:
  a leads/forms/conversions metric → "How many leads did I get?"; a sessions/visits metric with a channel or country
  breakdown → "Which channel brought the most visits?"; always → "What changed most since the last period?". At most
  three; never a question the report cannot answer.

### Route `POST /api/public/ask/[token]`

1. Find the report by `shareToken`; 404 if missing or `shareEnabled` is false; 403 if `clientAsk` is false.
2. Password: same check as the PDF route (unlock cookie); 401 without it.
3. Body: `{ question: string }`, trimmed, 2 to 300 characters; 422 otherwise.
4. Limit: 30 questions per report per rolling 24 h (count of `ClientQuestion` rows); 429 with a localized message.
5. Answer with `askClient(data, projectName, question, locale)` in `ai/insights.ts`:
   - system prompt: answer a client of a marketing agency in plain words, 2 to 4 short sentences, no jargon (say
     "visits", not "sessions"; explain a rate in one clause), only from the metrics given, say plainly when the
     report does not contain the answer, never give advice beyond what the numbers show, reply in `locale`;
   - user content: client name, period and comparison period, the report's compact facts (existing `compactFacts`,
     plus country rows when a map is present). The question is passed as data inside a delimited block, after the
     facts, so instructions inside it are not treated as the system's.
   - `max_tokens` 400; model from `ANTHROPIC_MODEL` (default as today).
6. Store the `ClientQuestion` (also when the AI call fails: answer = the error message shown, `ai = false`) and
   return `{ answer }`.

Without `ANTHROPIC_API_KEY` the route returns 503 and the tile is not rendered.

---

## 4. Quantix layout (client link, dashboards, editor preview)

- **Header**: report title large (as now); on the right, Download PDF as the ink pill, Copy link as a round icon
  button, and on live dashboards Refresh as a round icon button (re-fetch now, bypassing the cache, existing route).
  The period band stays.
- **Headline tiles**: the KPI tiles of the first block render in the smoke tone (grey, white type), with the caliper
  in its light variant. Later blocks keep glass KPI tiles, so the first row reads as the overview, like Quantix.
- **Tables and bar charts**: rendered in the solid tone (dark), as in "Spend by category" and "Total invoice".
  Bars are dark neutral steps; the leading bar (the largest, or the current period on a time chart grouped by
  month) takes the block colour, like the one red bar in "Time by client". Line and area charts keep the light tile.
- **Map**: as specified in §1; when it is the first widget of a block it can span the full width with the KPI
  tiles of that block beside it (no overlap tricks; grid placement only).
- **Print**: smoke and solid tiles print as white with a hairline, type in ink; bars print in greys with the leading
  bar in the accent.
- A Look option "Contrast tiles: on / off" (default on) in the Look panel, so a report can return to the all-glass
  look; stored as `theme.tones: 'contrast' | 'glass'` (omitted when default).

---

## Testing

- Unit: `toCountryCode` (GA4 names, alpha-2, alpha-3, aliases, unknown → null); map value composition (shade,
  panel metrics, previous period, unmatched rows, a failing ref → `error`); quantile steps; search scope per role
  (owner, admin, client) and grouping; Ask route (404 disabled link, 403 switched off, 401 password, 422 length,
  429 after 30, stored row, AI stub via the existing `claude` hook); suggested questions per metric mix; theme
  `tones` cleaned and validated.
- Browser (mock server): editor adds a Map block and picks metrics; on the client link clicking Greece updates the
  panel and Escape clears; Ctrl+K finds an account and opens the project's Integrations tab; the pick list filter
  hides non-matching accounts and keeps checked ones; the Ask tile appears only when switched on and shows a stubbed
  answer; the client link at 390 has no horizontal overflow.
- Sweep: Hallmark `sloplint --scope app` 0 FAIL, screenshots at 1440 and 390, `/r/[token]` first load within the
  110 kB budget (the map loads on demand), the v4 preview check (map renders from live GA4 country data where an
  account is connected, Ask answers with the production key once set).

## Order of work

1. Country matching and the map value (pure, tested).
2. World shapes file and the map card; registries and editor settings.
3. List filter, then the app-wide search route and dialog.
4. Client Ask: schema, route, agency switch and log, client tile.
5. Quantix layout: header actions, tones, bars, print, Look option.
6. Sweep, docs (DESIGN.md, FEATURE_MATRIX.md, privacy page line on client questions), push v4.
