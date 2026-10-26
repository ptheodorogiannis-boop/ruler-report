# Ruler Reports v3 programme — design spec

Date: 2026-10-22. Status: for review. Scope: `E:\Claude\ruler-reports-v2` (the working copy; the demo at `E:\Claude\ruler-reports`
stays untouched). Builds on the v2 spec (`2026-10-21-v2-features-design.md`): media service, client marks, Look, custom widgets.

## Purpose

Two audits were run against the demo: a Reportei parity audit (`docs/audits/parity.md`, 59.5/100 before v2, 74 missing rows)
and a mining of 277 Reportei user reviews (`docs/audits/reviews.md`). The user chose four bundles from them, all in one programme,
built in this order:

1. **Trust** — tell the agency before an integration breaks, let them fix it in one click, and explain to clients why numbers
   differ from the platform (review complaints A1/A2); campaign containers and campaign selection (parity must-have #1,
   rows #19, #22, #28).
2. **Delivery** — daily and weekday-position schedules, hold a report with broken sources, goal alerts by e-mail, a shareable
   goals page, a client-side period picker with auto-refresh on shared dashboards, convert and duplicate (rows #12–18, #26–27).
3. **Output** — server-side PDF with page breaks (#9), a cover editor (#10), custom-block icon and header toggle (#6),
   per-block AI analysis with tones (#2, #11).
4. **Greek** — the agency UI, the client-facing chrome and e-mails in Greek (review B6, row #21), with Greek labels for the
   most used metrics.

Each bundle is one or two implementation plans (D–H below) and ships on its own.

## Constraints

- Stack as is: Next.js 15 app router, React 19, Prisma + SQLite (`prisma db push` on `prisma/dev.db`), Tailwind, Recharts via
  the lazy chart chunk, node:test + tsx, Playwright for browser tests. No git: each task ends with `npx tsc --noEmit` clean and
  `npm test` green; the ledger under `.superpowers/sdd/<plan>/progress.md` records every ruling.
- The editor stays WYSIWYG: everything the public page shows is what the editor shows (`WidgetCard` renders every kind).
- Public report First Load JS stays around 106 kB (`NEXT_DIST_DIR=.next-v2 npx next build`, route `/r/[token]`). New client
  components on public pages are small and plain (a form, a refresh timer, a dictionary subset); charts stay in the lazy chunk.
- Every new widget component updates every registry listed in docs/DESIGN.md "v2 — report look and custom widgets".
- Images stay on disk (`data/uploads`); no `sharp`; URLs follow `isMediaOrHttps`.
- Docker: the runtime image may grow by about 400 MB for Chromium (PDF). Nothing else new in the image.
- Security as before: tenant scoping by `companyId`/`projectScope`, write actions behind `canWrite`, admin ones behind
  `canAdmin`, public pages only through tokens (and the unlock cookie when a password is set).
- Dev server for verification: port 3104 (launch config `ruler-reports-v2`); demo sign-in admin@demo.local / demo1234.

## 0. Programme shape and order

| Plan | Section | Ships | Depends on |
|---|---|---|---|
| D | §1 integration health, reconnect, data notes | health chips + alerts + reconnect + report retry + "About these numbers" | — |
| E | §2 campaign containers | campaign scope on accounts/blocks, container widget, wizard step | — |
| F | §3 delivery | daily/weekday schedules, hold on failure, goal e-mails, /g/[token], client period picker, auto-refresh, convert/duplicate | — |
| G | §4 output | PDF route + Docker, cover editor, block icon/header, per-block AI | F's `attachPdf` field (added in F, used in G) |
| H | §5 Greek | i18n layer, dictionaries, locale settings, metric labels, review list | all UI from D–G exists before strings are extracted |

Order: D → E → F → G → H. H goes last so it translates the final set of strings once.

## 1. Integration health, reconnect and data notes (plan D)

**Problem.** A token expires or a connector starts failing and nobody knows until a client report arrives with holes
(review A1: "nobody warns you", "reintegrate periodically"). When numbers differ from the platform the client asks which is
right (A2) and the report says nothing.

### 1.1 Health check

- Schema (`Integration`): `health String @default("unknown") // ok | failing | expiring | unknown`, `healthCheckedAt DateTime?`,
  `healthError String?`, `tokenExpiresAt DateTime?`, `healthAlertAt DateTime?`, `healthAlertKind String? // failing | expiring7 | expiring1`.
- `src/lib/services/health.ts`:
  - `checkIntegration(i: Integration): Promise<HealthResult>` — `{ demo: true }` credentials → `ok`; otherwise
    `connectorFor(i).validate?.({ integration })`; a throw → `failing` with the message (first 300 chars). `tokenExpiresAt`
    comes from the decrypted credentials' `expiresAt` (Meta long-lived user tokens: 60 days; Google refresh tokens: none);
    `expiring` when it is within 7 days and the check passed.
  - `alertFor(prev: HealthSnapshot, next: HealthResult, now: Date): Alert | null` — pure. `failing` when the status turns
    failing, or stays failing and the last `failing` alert is older than 7 days; `expiring7` once when ≤ 7 days remain;
    `expiring1` once when ≤ 1 day remains; `recovered` when failing/expiring → ok (in-app only). Dedupe by
    `healthAlertKind` + `healthAlertAt`.
  - `checkAll(now = new Date(), limit = 50)` — active integrations whose `healthCheckedAt` is null or older than 20 hours,
    oldest first, sequential, each in its own try/catch; writes the snapshot, sends alerts, returns `{ checked, alerts }`.
- Cron: `/api/cron/tick` also calls `checkAll()`; `npm run tick` too. The integration page's "Check now" button runs
  `checkIntegration` for one row (server action, write right).
- Alerts: `notify()` (bell) for the company with a link to the reconnect URL; `sendEmail()` to users of the company with
  role `owner` or `admin` (`healthEmailHtml`: what failed, since when, the reconnect link); webhook event `integration_failing`
  (added to `WEBHOOK_EVENTS`). Recovery: bell only.
- UI: on the project's Integrations tab each row shows a chip: `Connected`, `Expires in N days`, `Failing since <date>` with
  the error on hover, plus `Reconnect` (OAuth providers) or `Replace credentials` (token/paste connectors). `/overview`'s
  "Needs attention" count includes `expiring` and `failing`. `/notifications` links go to the reconnect URL.

### 1.2 Reconnect without losing the integration

- `OAuthState` (`src/lib/oauth/state.ts`) gains `integrationId?: number`. The connect page `projects/[id]/connect/[slug]`
  accepts `?reconnect=<integrationId>` and passes it into the state; the callback/pick step, when `integrationId` is set,
  calls `connectIntegration({ …, replaceId })`.
- `connectIntegration` with `replaceId`: the picked `sourceId` must equal the existing row's `sourceId`, otherwise the page
  says "Pick the same account (act_123…) to reconnect, or add a new integration" and nothing changes. On success it updates
  `credentials`, `config` (merged), `name` only if empty, `health = ok`, `lastError = null`, `healthError = null`.
- Token/paste connectors: the integration row's "Replace credentials" opens the same form the connect page uses, posting
  with `replaceId`.
- Reports keep their `integrationIds`; nothing else changes.

### 1.3 Report failure state with retry (parity #39)

- `SourceStatusList` (report page and public page) shows, per failing source, the error, a `Reconnect` link (signed-in
  users with write right only) and a `Retry` button (signed-in). `retrySourceAction(reportId, integrationId)` regenerates
  the data of that integration only: `generateReportData` for the report's template sections filtered to that integration,
  merged into `Report.data` (`sections` of that integration replaced, `widgets` store entries of that integration refreshed,
  `sources[]` entry updated). Public viewers see the error text and the data-note footer only.

### 1.4 "About these numbers" (data notes)

- `src/lib/catalog/data-notes.ts`: `DATA_NOTES: Record<string, DataNote>` keyed by integration slug for the live families
  (facebook_ads, instagram, facebook_page, google_analytics_4, google_search_console, woocommerce, google_sheets, csv,
  rest/ingest) with `{ attribution?, timezone, delay?, sampling?, counting? }` sentences; `dataNote(slug, config): string[]`
  returns the applicable sentences (e.g. Meta: "Conversions use the account's attribution window (7-day click, 1-day view);
  the Ads Manager may show another window." · "Dates follow the ad account's time zone." · "Figures for the last 72 hours
  are still being updated by Meta."). Unknown slug → the generic note only ("Numbers come from the platform's API at
  generation time and can differ from its interface because of attribution windows, time zones and late conversions.").
- Rendering: each block header on the public page gets an `i` control (`<details>`/`<summary>`, no JS) titled "About these
  numbers" listing the sentences; in print the control is replaced by numbered footnotes under the cover's "Sources" list
  (`.print-only`). The report footer carries the generic sentence and the generation time ("Data fetched 22/10/2026 09:14").
- Company setting `showDataNotes Boolean @default(true)` (Settings › Reports); off hides the controls and footnotes.

**Testing.** `tests/v3-health.test.ts`: `alertFor` transitions and dedupe (table of cases), `checkIntegration` with a demo
row (ok), a connector whose `validate` throws (failing + message), credentials with `expiresAt` in 3 days (expiring);
`checkAll` writes snapshots and sends one e-mail per alert (Outbox rows when SMTP is unset); reconnect with a different
`sourceId` refused and with the same one updating in place (`connectIntegration` with `replaceId`); `retrySourceAction`
replaces only that integration's sections; `dataNote` per slug; render test of the public block header with the control
and of the print footnotes. Browser (NAV_BASE): the integrations tab shows chips; a failing demo integration (health forced
through the DB) shows Reconnect.

## 2. Campaign containers and campaign selection (plan E)

**Problem.** Ads clients want their campaigns side by side, and often only some of them (parity #1, #19, #22, #28; review B2
"per-campaign dashboards"). Today a block is one account, whole.

### 2.1 Connector support

- `Connector` (`src/lib/engine/types.ts`) gains `listCampaigns?(ctx): Promise<Campaign[]>` with
  `Campaign { id: string; name: string; status: 'active' | 'paused' | 'other'; objective?: string }`, and the `filter`
  argument of `daily` becomes `{ dimension: string; value: string | string[] }` (an array means "in").
- Meta (`src/lib/connectors/meta.ts`): `listCampaigns` → `GET /act_<id>/campaigns?fields=id,name,status,objective&limit=200`
  (paged); `daily` with `filter.dimension === 'campaign'` adds
  `filtering=[{"field":"campaign.id","operator":"IN","value":[…]}]` and keeps `level=account`; `breakdown('campaign')`
  returns rows keyed by `campaign_id` with `label = campaign_name` (today it keys by name).
- Demo (`src/lib/connectors/demo.ts`): `demoCampaigns(seed)` → six campaigns per ads account with fixed names
  ("Brand search", "Prospecting – video", "Retargeting – catalog", "Spring launch", "Always-on – leads", "Promo weekend"),
  statuses active/active/active/paused/active/other, and `demoWeights` splitting every primitive across them, so a filtered
  `daily` sums exactly the chosen campaigns.
- Other ads slugs run on the demo connector until their live connector exists (Google Ads, TikTok, LinkedIn: not in scope).
- `FetchSession.dkey` includes the sorted id list, so one (account, range, scope) is fetched once.

### 2.2 Campaign scope

- `src/lib/engine/campaigns.ts`: `CampaignScope = { mode: 'all' | 'pick' | 'rule'; ids?: string[]; rules?: { op: 'contains' | 'not_contains'; text: string }[] }`;
  `applyScope(campaigns: Campaign[], scope): Campaign[]` — pure, rules are case-insensitive and combined with AND; `pick`
  keeps the listed ids in the listed order; `all` returns the input. `scopeIds(scope, campaigns)` → `string[] | undefined`
  (undefined = no filter).
- Where a scope lives: `Integration.config.campaigns` (the account's default, set on the integration row with a picker that
  calls `listCampaigns`), `LayoutBlock.campaigns?: CampaignScope` (overrides the default for that block), and the frozen
  `Report.data.sources[i].campaigns` + `campaignNames` (what was used at generation, shown in the data note: "Campaigns:
  Brand search, Spring launch").
- Generation and `ensureWidgetValues`: every widget of an ads block whose scope is not `all` resolves `daily` with
  `{ dimension: 'campaign', value: ids }` (ids from `applyScope` over `listCampaigns` at generation; `rule` scopes are
  re-evaluated each generation). Breakdown widgets (tables by campaign, by age…) filter their rows by the same ids.

### 2.3 Container widget

- Slug `container`, component `container_v1`, size 12×4 (min 6×3), `data-kind="container"`. Settings:
  `custom.metrics: string[]` (keys of number widgets of the block's platform; default `spend, impressions, clicks, cpc,
  conversions` where the catalog has them), `custom.rows` (max campaigns, default 10, 1–50), `custom.sortBy` (a metric key,
  default the first), `custom.showStatus: boolean` (default true), `custom.hidden: string[]` (campaign ids hidden by the
  author). The block's scope applies first.
- Value `ContainerValue { type: 'container'; metrics: { key; label; format }[]; rows: { id; name; status; values: (number | null)[]; comparison?: (number | null)[] }[] }`.
  `resolveContainer` uses `session.getBreakdown(i, 'campaign', prims, range)` (+ comparison range); virtual metrics (cpc,
  ctr, cpm, cost per conversion, roas) come from `planFetches`' virtual formulas evaluated per row.
- `ContainerCard`: a table-like card (campaign name with status dot, one column per metric, delta under each value when a
  comparison exists), rows sorted by `sortBy` desc, "+N more" when truncated; print: rows don't break across pages.
- Editor: the add drawer's Customizable tab gets "Campaign table"; the block header gear gets "Campaigns" (All / Pick / Rule)
  for ads blocks, with the picker listing the account's campaigns (status badge, search) and the rule editor; `SettingsPanel`
  dispatches to `ContainerSettings` (metric multi-select from the catalog, rows, sort, status, hidden list).
- Registries: `Component` union, `SPECIAL_SLUGS`, sizes, `customSchema` (`metrics`, `rows`, `sortBy`, `showStatus`, `hidden`),
  `SPECIAL_COMPONENT`, `componentOfValue('container')`, `valueKey` (store key `${integrationId}:container:${hash(metrics,
  scope)}`), `renderWidget`, `ensureWidgetValues`, `export.ts` (one CSV row per campaign), `routes.ts` serialisation,
  `WidgetCard`, `COMP_LABEL`/`SPECIAL_KEY`/`SPECIAL_DEFAULT`/`kindOf('container') = 'container'`, CSS (`data-kind='container'`:
  full width and sideways scroll on phones, like read-only tables).
- Wizard: `ReportBuilder` gets a "Campaigns" step after the integrations step, one control per ads account (All / Pick /
  Rule, default = the account's scope); the chosen scopes are written to the seeded layout blocks and used for generation.
  The API (`POST /reports`) accepts `campaigns: { [integrationId]: CampaignScope }`.

**Testing.** `tests/v3-campaigns.test.ts`: `applyScope` (pick order, rules AND, case), Meta param builder (`filtering` JSON,
`campaign` breakdown keyed by id), `demoCampaigns` deterministic and the filtered demo `daily` summing exactly the chosen
campaigns; `resolveContainer` on demo data (rows, virtual metrics, comparison, sort, truncation); compose registries
(`componentOfValue`, `valueKey`, sizes); generation with a `rule` scope changes the sources' `campaignNames`; CSV export
rows. Browser: the wizard shows the campaign control for the demo Meta account; the editor adds a Campaign table whose rows
render on the client link; the block gear sets a Pick scope and the block's KPIs change.

## 3. Delivery and control (plan F)

### 3.1 Schedules

- `Automation`: `frequency` adds `daily`; `weekdaysOnly Boolean @default(false)` (daily only); `monthlyRule String
  @default("day") // day | first:<0-6> | last:<0-6>` (monthly by weekday position, parity #46).
- `nextRunAfter` honours them: daily at `hour` in the project time zone, skipping Saturday/Sunday when `weekdaysOnly`;
  `first:1` = first Monday of the month, `last:5` = last Friday. `periodForRun('daily', day)` = yesterday.
- Form on the project page and the API (`frequency`, `weekdays_only`, `monthly_rule`) expose them.

### 3.2 Hold on failure and failure alerts (parity #13)

- `Automation.holdOnFailure Boolean @default(true)`; `AutomationRun.status` adds `held`.
- `runAutomation`: after `createReport`, if any `data.sources[].data_status === 'error'`:
  - `holdOnFailure` on → client channels are not sent; `notify()` + e-mail to owners/admins ("Report held: Meta Ads failed
    — reconnect, then send"), run status `held`, `nextRunAt` advances as usual. The automation row shows "Held" with
    `Send now` (`sendHeldRunAction(runId)`: sends the stored report through the channels and marks the run `ok`).
  - off → sends as today and e-mails the agency the failure list.
- `Automation.attachPdf Boolean @default(false)` is added here (used by §4.1).

### 3.3 Goal alerts by e-mail (parity #15)

- `Goal.alertEmails Json? // string[]`. `evaluateGoals` sends `goalEmailHtml` for `met`, `missed` and `off track` to those
  addresses in addition to the bell and the webhook (same dedupe keys as today). The goal form gets an "Alert e-mails" field.

### 3.4 Shareable goals page (parity #16)

- `Project.goalsToken String? @unique`, `Project.goalsPassword String?` (hash, same scheme as `Report.password`).
- Goals tab: "Share control" creates the token (admin), shows the link, optional password, "Stop sharing" clears it.
- Route `/g/[token]`: public, server-rendered, the project's goals with progress (reuse `GoalProgress`, the `Ring` from
  `infographic.tsx`), situation chips, period and projection, the client mark and theme-less chrome; `?embed=1` hides the
  header; password → the same unlock flow as `/r`. 404 when no token matches.

### 3.5 Client period picker and auto-refresh on shared dashboards (parity #17, #18)

- `Report.clientPresets Json? // Preset[]` (dashboards only; null = locked). The dashboard settings (report page › Sharing)
  list the presets the client may switch to.
- `/d/[token]?preset=<Preset>&compare=0|1`: validated against `clientPresets` (anything else → the saved preset);
  `liveDashboardData(report, { preset, compare })` computes the range from it; the cache key already carries the range and
  gains the `compare` flag.
- UI: a `<form method="get">` in the dossier head with a `<select name="preset">` and a comparison checkbox (no JS; a tiny
  client enhancement submits on change). `AutoRefresh` client component: when the preset is rolling, every 120 s while the
  tab is visible, `router.refresh()`; a "Live · updated 12:04" label in the head.

### 3.6 Convert and duplicate (parity #26, #27)

- `src/lib/services/reports.ts`: `duplicateReport(id)` → new row "Copy of <title>", same project, layout, theme, data,
  analysis, integrationIds, preset, new `shareToken`, no password, `viewCount 0`; `convertReport(id, kind)`:
  report → dashboard keeps the layout/theme, sets `preset` to `last_30d` (comparison kept) and clears `data` so the live
  path generates; dashboard → report freezes the current live data (`liveDashboardData` → `data`), `startDate/endDate` =
  today's preset range, `preset = custom`.
- Report page "…" menu: Duplicate, Convert to dashboard / Convert to report (write right); API `POST /reports/:id/duplicate`,
  `POST /reports/:id/convert { kind }`.

**Testing.** `tests/v3-delivery.test.ts`: `nextRunAfter` (daily, weekdaysOnly over a weekend, first Monday, last Friday,
DST change in Europe/Athens), `periodForRun('daily')`; `runAutomation` with a forced failing source → run `held`, no client
e-mail, one agency e-mail (Outbox), `sendHeldRunAction` sends; goal e-mail on `met`; `/g/[token]` render (goals, 404,
password unlock); `/d/[token]` preset validation and cache key per range; `duplicateReport` and `convertReport` both ways
(fields, tokens, frozen data). Browser: the dashboard link switches period through the form; the "…" menu duplicates a
report and the copy opens.

## 4. Output: PDF, cover editor, block icon, per-block AI (plan G)

### 4.1 Server-side PDF (parity #9, review B4)

- Dependencies: `playwright` moves from devDependencies to dependencies; Docker runtime stage switches to
  `mcr.microsoft.com/playwright:v1.64.1-noble` (Chromium + fonts included; Node 22). `.env.example` gains
  `PDF_ENABLED=auto // auto | off`.
- `src/lib/services/pdf.ts`: `pdfAvailable()` (Chromium executable resolvable and `PDF_ENABLED !== 'off'`, cached);
  `renderPdf({ token, layout: 'flow' | 'pages', lang?, unlock? }): Promise<Buffer>` — a lazily launched shared browser,
  closed after 5 minutes idle, at most 2 concurrent renders (the rest queue), page `${APP_URL}/r/<token>?print=1&layout=…`
  with the unlock cookie forwarded, `page.pdf({ format: 'A4', printBackground: true, margin: { top: '12mm', right: '10mm',
  bottom: '14mm', left: '10mm' }, preferCSSPageSize: false })`, 60 s timeout.
- Route `GET /api/pdf/[token]?layout=flow|pages`: resolves the row by `shareToken` (reports and dashboards alike; a
  dashboard renders its `/d` page), enforces the password through the same unlock cookie as `/r`, returns `application/pdf`,
  `Content-Disposition: attachment; filename="<title>.pdf"`, 503 with a JSON message when `pdfAvailable()` is false.
- Public page: when available, the print button becomes a menu "Download PDF › Continuous / One block per page" + "Browser
  print"; otherwise the button stays as today. `?layout=pages` adds `.print-section + .print-section { break-before: page }`;
  `?print=1` hides the header and controls like `.no-print` does.
- Automations: `attachPdf` (from §3.2) attaches `<title>.pdf` to the e-mail (`sendEmail` gains `attachments`), skipped with
  a note in the run detail when the PDF is unavailable or larger than 15 MB.

### 4.2 Cover editor (parity #10)

- `ReportTheme` gains `coverLayout?: 'banner' | 'header' | 'none'` (default `banner`), `coverText?: string` (`#rrggbb`,
  colour of the eyebrow and title on the cover; default ink), `showPeriod?: boolean` (default true).
- Public page: `header` = the cover image spans the full width above both columns (`.cover-hero`, 21/9, 32/9 in print) with
  the client mark, eyebrow and title overlaid on a dark gradient; `none` = no cover column, the document starts with the
  title row and the sources/timeline move to a footer section. `showPeriod` off hides the ruler band and its labels.
- Look panel: a "Cover" group (layout radios, title colour input with "Use ink", "Show period" switch). The editor preview
  mirrors all three.
- Schema: `themeSchema` extends; `cleanTheme` drops defaults.

### 4.3 Custom-block icon, subtitle and header toggle (parity #6)

- `LayoutBlock` gains `icon?: IconName` (the 24-icon set of `infographic.tsx`), `subtitle?: string` (≤ 120 chars),
  `hideHeader?: boolean`. Block header renders the icon in `var(--block)` before the title and the subtitle under it;
  `hideHeader` hides the title row on the public page and in print (the editor shows it dimmed with a "hidden" tag).
- Block gear in the editor: icon grid (reuse the tile panel's), subtitle input, "Show header" switch. `layoutSchema` extends.

### 4.4 Per-block AI analysis with tones (parity #2, #11)

- `AnalysisCard` gains `blockId?: string` and `tone?: Tone`; `Tone = 'general' | 'performance' | 'worst' | 'opportunities' | 'executive'`.
- `src/lib/ai/insights.ts`: `analyseBlock(data, blockId, { tone, language, projectName, notes })` builds facts only from the
  section whose id is `blockId` (`extractFacts` gains a section filter) and a tone instruction (`TONE_PROMPTS`: performance
  = efficiency metrics first, worst = the metric that fell most and why, opportunities = three actions, executive = five
  sentences max); the heuristic fallback produces a tone-shaped card without an API key. `analyse()` (whole report) is
  unchanged.
- UI: each block header gets "Analyse ▾" (tones) in the editor; the card is inserted right after the block on the public
  page and in the editor (`AnalysisCard.blockId` decides placement; cards without `blockId` stay at the top as today) and is
  editable like any card. The AnalysisPanel lists cards with their block name. "Analyse all blocks" on the toolbar runs the
  general tone for every block. Automations keep the single general card (`attachAnalysis`).

**Testing.** `tests/v3-output.test.ts`: `pdfAvailable` honours `PDF_ENABLED=off`; the route returns 503 then, and, with
NAV_BASE and Chromium present, a PDF (`%PDF` header, > 10 KB, `pages` layout larger than `flow`), 401 without the unlock
cookie on a password report; `themeSchema` accepts the cover fields and rejects a bad colour; public render for the three
cover layouts (`.cover-hero`, no aside, period hidden); block icon/subtitle/hidden header render (public vs editor);
`analyseBlock` facts scoped to the block and tone prompts differing; a block card placed after its block in the public
markup. The Docker build is checked by reading the Dockerfile in the review, not by building here.

## 5. Greek (plan H)

**Scope (user's choice):** agency UI, client-facing chrome of public reports/dashboards/goals pages, e-mails and the PDF
chrome, chosen per company with a per-user override; metric names stay as the platforms name them, with Greek labels for
the ~60 most used metrics. Not translated: catalog descriptions, API docs, MCP, AI output (already language-aware).

### 5.1 Dictionary layer

- `src/lib/i18n/en.ts`, `el.ts`: flat `Record<string, string>` with namespaced keys (`nav.overview`, `report.sources`,
  `email.held.subject`…), `{name}`-style interpolation; `src/lib/i18n/index.ts`: `LOCALES = ['en', 'el']`,
  `t(locale, key, vars?)` falling back to `en` then to the key; `getLocale()` (server): `User.locale` → `Company.locale` →
  `Accept-Language` starting with `el` → `en`; `localeForPublic(project, searchParams)`: `?lang=el|en` → `Project.locale`.
- Client components: `<I18nProvider locale dict>` in the shell with the namespaces the page needs (`dictFor(locale,
  ['nav', 'editor', …])`); `useT()` returns `t` bound to them. Public pages ship only `public.*` (≤ 8 kB).
- Schema: `User.locale String?`, `Company.locale String @default("en")`. Settings: company default; the account menu gets
  EN/EL.
- Dates and numbers: `formatDisplayDate` unchanged (project format); month and weekday names, "Last 7 days"-style labels and
  relative times through `Intl.DateTimeFormat(locale)` / the dictionaries; numbers already follow the project's decimal
  setting.
- Metric labels: `src/lib/catalog/labels.el.ts` — `reference_key → label` for the 60 most used metrics across Meta Ads,
  Instagram, Facebook Page, GA4, Search Console, WooCommerce (spend, impressions, clicks, CTR, CPC, CPM, conversions, cost
  per conversion, ROAS, reach, frequency, sessions, users, new users, engagement rate, bounce rate, orders, revenue, AOV…);
  `metricLabel(w, locale)` used by every card title and the drawer; unknown keys keep the English title.
- Coverage list (every string in): rail and nav, login/signup/404, overview, projects (all tabs and forms), reports index and
  wizard, editor toolbar/drawer/Look/settings panels, dashboards, automations, goals, templates, settings, notifications,
  public report/dashboard/goals chrome (cover labels, Sources, Timeline, deltas, "Powered by", data notes), e-mails (report
  ready, held, health, goals), PDF chrome.
- Quality: the Greek strings are my draft. `docs/i18n-review.md` lists every key with EN and EL and a glossary (report =
  αναφορά, dashboard = πίνακας, goal = στόχος, automation = αυτοματισμός, milestone = ορόσημο, integration = σύνδεση,
  campaign = καμπάνια, conversions = μετατροπές, spend = δαπάνη) for a native reviewer; strings changed after review are
  edited in `el.ts` only.
- `scripts/i18n-check.mjs` (and a test): every key in `en` exists in `el` and vice versa; every `t('…')` key found in `src`
  exists in `en`.

**Testing.** `tests/v3-i18n.test.ts`: `t()` interpolation and fallbacks, `getLocale` precedence, `localeForPublic`,
dictionary parity, `metricLabel` fallback; render tests of the login page, the top nav and the public cover in Greek (no
English chrome strings left: assert on a list of English words). Browser: switch the account menu to EL and read the overview;
`/r/<token>?lang=el` shows Greek chrome and English metric names where no label exists.

## Error handling

- Health: a connector that times out counts as failing with "Timed out after 15 s"; checks never throw out of the tick.
  E-mail failures land in the Outbox as today.
- Reconnect with the wrong account is refused with the account id in the message; nothing is written.
- Campaigns: `listCampaigns` failure → the picker shows "Could not load campaigns" and keeps the saved scope; a `pick` scope
  whose ids no longer exist → those ids are ignored and the data note says "2 selected campaigns no longer exist".
- Hold on failure: a held run that is sent manually after reconnecting uses the stored report (no regeneration); the
  "Retry" of §1.3 regenerates first when the user wants fresh numbers.
- PDF: Chromium missing → 503 and no button; render timeout → 504 with "The PDF took too long; try the continuous layout";
  automations note the reason in the run detail and still send the link.
- Public dashboard: an invalid `preset` falls back to the saved one silently; the comparison checkbox is ignored for presets
  without a comparison.
- i18n: a missing key renders the English string (never the key) in production and logs once per key in development.

## Non-goals

Live connectors beyond today's eight (Google Ads, TikTok, LinkedIn stay on demo data); WhatsApp Cloud API direct; official
Zapier/Make/n8n apps; Studio prompt/edit; cross-project chat AI; multi-company membership; translating catalog
descriptions or API docs; PowerPoint export; retention beyond what SQLite already keeps.

## Order of work and plan boundaries

Plans D, E, F, G, H in that order, each with the usual review and fix pass. D and F touch different files and could run in
parallel if wanted; E depends on nothing in D except shared test fixtures; G needs F's `attachPdf`; H goes last.
