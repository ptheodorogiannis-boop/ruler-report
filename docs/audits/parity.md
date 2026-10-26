# Parity audit — Ruler Reports vs Reportei (2026-10-21, evening pass)

Method: `replica-diff` skill. Feature score from `replica/features.csv` with `parity.py` (must 3 · should 2 · could 1, partial = ½,
`skip` and extras left out). Code read in `E:\Claude\ruler-reports` (nothing edited). Browser evidence from the dev server on
`localhost:3101` signed in as the demo account: 50 page loads (10 routes × 1440 / 1280 / 1024 / 768 / 390) with a per-frame
sampler of the nav marker and the ruler. The dev server was stopped (by the user) at the end of that loop, so the second half
— hover, pointer-leave, keyboard focus, client-side click, ruler scroll alignment, sticky toolbar, reduced motion, 2× close-ups —
ran against `localhost:3102`, the production build of the same sources (started 17:08 after the last source edit at 17:06).
Nothing was created, saved, generated or deleted; no writing control was pressed. Evidence files: `probe.json`, `probe2.json`,
`shots/*.png` next to this file.

Effort scale used below: **S** < 1 day · **M** 1–3 days · **L** > 3 days (one engineer who knows the codebase).

---

## 1. Verdict

| | |
|---|---|
| **Parity** | **59.5 / 100** (feature score; unchanged since the in-report editor landed this morning) |
| Feature score | 59.5 — 123 rows counted, 2 skipped (plan gating, billing), 9 extras not scored |
| Must-haves | **23 of 33 done** → 10 missing or partial |
| Layout score | **not run** — `replica/screens/` (Reportei captures) is empty; the clone's screenshots for a later diff are in `shots/` (1440 and 390 for overview, projects, reports, report) |
| Open bugs | 0 × S1, 4 × S2, 8 × S3 (section 5) |
| **Verdict** | **Not shippable as a Reportei replacement** (10 must-haves open). Shippable as an internal reporting tool: generate → edit in place → share → automate → goals all work; the S2 bugs are shell polish, not data. |

### By area, weakest first

| Area | Score | Rows | What drags it |
|---|---|---|---|
| Overview | 42.9 | 4 | fixed KPI set, no pages/filters/polling |
| Theming & cover | 50.0 | 6 | no themes, no cover/footer editor, no block theme |
| AI | 50.0 | 9 | one analysis per report, no tones, no chat, Studio is a viewer |
| Integrations | 50.0 | 5 | 8 live connectors of 67 slugs, OAuth for Google/Meta only, no campaign selection |
| Automations | 52.5 | 11 | no daily, no WhatsApp direct, no failure alerts, no bulk |
| Dashboards | 54.5 | 5 | client cannot change the period, no real-time |
| Reports | 56.2 | 10 | no convert/duplicate, no expert templates, no campaign step |
| Control (goals) | 56.2 | 8 | alerts in-app/webhook only, not shareable |
| Timeline | 57.1 | 4 | no standalone link, no icons |
| Projects & account | 57.1 | 8 | English only, no archive/activity log/owner transfer |
| Templates | 60.0 | 3 | no Studio templates, no AI config |
| Report editor | 63.4 | 37 | campaign containers, table filters/dimension, chart extras, block theming |
| API & automation | 75.0 | 5 | no official Zapier/Make/n8n apps, static MCP tokens |
| Sharing & export | 85.3 | 8 | print-to-PDF only, no WhatsApp share button |

Must-haves done (23): catalog drag-in, grid move/resize, calculated metric, static snapshot + comparison, save as template,
delete, live dashboard, rolling presets, template management with usage counts, public link, password, scheduled
weekly/biweekly/monthly e-mail, goals with projection and alerts, milestones, cross-project KPI table, project settings,
team roles, REST v2 with tokens/pagination/rate limits, seven webhook events, and the rest of the editor basics.

---

## 2. Missing list, in build order (74 rows)

Order = `parity.py`: must → should → could; within a priority `no` before `partial`, then by area. "Reportei does" is from
`docs/REPORTEI-DEEP-DIVE.md`; "Ruler Reports today" names the file that would change.

### Must (10)

| # | Area | Feature | Reportei does | Ruler Reports today | Effort |
|---|---|---|---|---|---|
| 1 | Report editor | Campaign containers | `container_v1` inside an ads block holds per-campaign widgets; "Add campaigns", filter by rule or manual pick, hide a campaign (§3.3) | `container_v1` is only a type name (`src/lib/engine/types.ts`, `DEFAULT_SIZE` in `src/lib/layout/types.ts`); connectors have no campaign filter (`src/lib/connectors/meta.ts` returns campaign *tables* only); no UI | **L** |
| 2 | AI | Analysis per block | one AI card per integration at generation, "Add analysis" per block, tone variants, one free regenerate (§9) | one card list per report: `AnalysisPanel` (`src/components/analysis-panel.tsx`) over `Report.analysis`, text from `analyse()` in `src/lib/ai/insights.ts`; the grid `analysis` widget is text-only | **M** — "Generate for this block" → `analyse()` on the block's widgets → writes an `analysis` widget into the block |
| 3 | Integrations | Breadth of live integrations (~58) | every catalog entry pulls real data | 67 slugs in `src/lib/catalog/integrations.ts`; live: meta, ga4, gsc, woo, sheets, csv, rest, ingest (`src/lib/connectors/*`); 59 run on `connectors/demo.ts` | **L** (M per connector; order: Google Ads, Instagram, Facebook Page, Business Profile, YouTube, TikTok, LinkedIn, Shopify) |
| 4 | Integrations | One-click OAuth with account picker | every provider | Google + Meta only (`src/lib/oauth/*`, `src/app/api/oauth/*`, `projects/[id]/connect/[slug]/pick`); the other 50 paste tokens (`fields: TOKEN`) | **M** per provider family (TikTok, LinkedIn, Pinterest, Microsoft, Shopify, HubSpot) |
| 5 | Report editor | Analysis card with rich text, images, links | Quill editor: text, images, links, video, anywhere (§3.3) | `analysis` widget = plain `<textarea>` accepting simple HTML (`SettingsPanel` in `src/components/report-editor.tsx`); `sanitizeHtml` strips `img`/`iframe` (`src/lib/util/sanitize.ts`) | **M** (WYSIWYG S–M + uploads M, see 3.5) |
| 6 | Report editor | Custom block: colour, icon, header toggle | title, subtitle, border colour, icon (name/background/colour), show/hide header, own theme (§3.4) | `LayoutBlock { id, title, integrationId: 0, slug: 'custom' }` (`src/lib/layout/types.ts`); title only via `renameBlock`; header prints the "Custom block" eyebrow (`BlockHeader`, `src/components/widgets.tsx`) | **S–M** |
| 7 | Report editor | Table: add columns | custom columns from `available_metrics × available_dimensions`, hide, move (§3.3) | `hiddenColumns`, `columnOrder`, `sortBy`, `rows` in `WidgetCustom`, applied by `applyTableCustom()` (`src/lib/layout/compose.ts`); the column set is fixed by the connector | **M** (column list through `Connector.fetch`) |
| 8 | Reports | Wizard: expert templates | Reportei / Expert (community) / My templates (§5) | built-in (`src/lib/templates/defaults.ts`, `companyId null`) + own; `ReportBuilder` lists both (`src/components/report-builder.tsx`) | **S** (curated set) / **M** (gallery) |
| 9 | Sharing & export | PDF with page breaks | `PdfConfigurationModal`: full page or page breaks, server-rendered (§3.6) | `PrintButton` → `window.print()` + `@media print` (`globals.css`: `.card { break-inside: avoid }`) | **M** — `/api/v2/reports/:id/export.pdf` with Playwright/Chromium, `break-before` per block, cover page |
| 10 | Theming & cover | Cover editor | show/hide cover, title, subtitle, logo upload (round/square), background and text colour, header-as-cover, period card (§3.5) | `Report.title/subtitle` + agency logo/colour from `Company` (dossier cover in `src/components/public-report.tsx`); no per-report fields | **M** |

### Should (31)

| # | Area | Feature | Reportei does | Ruler Reports today | Effort |
|---|---|---|---|---|---|
| 11 | AI | Tone-specific analyses | per-integration tones (Meta: general, CPC, CTR, worst metric, maximise…) | one general prompt in `analyse()`; language select in `AnalysisPanel` | **S–M** |
| 12 | Automations | Daily frequency | daily (Pro+), weekly, biweekly, monthly | `Automation.frequency` weekly/biweekly/monthly (`prisma/schema.prisma`, `src/lib/services/automations.ts`), form on the project page | **S** |
| 13 | Automations | Integration-failure alert e-mail | alert before the next run | `Integration.lastError` shown on the project page only | **S–M** (scheduler check + `messaging.ts`) |
| 14 | Automations | WhatsApp direct | official number, 3 numbers per automation | webhook URL + `whatsappType` generic/zapi/evolution/twilio (`src/lib/services/messaging.ts`) | **M** (WhatsApp Cloud API provider) |
| 15 | Control | Goal alerts by e-mail / WhatsApp | target reached / below / above by e-mail + WhatsApp | in-app notification + `control_goal_met/not_met` webhook (`src/lib/services/goals.ts`) | **S** (reuse `messaging.ts`) |
| 16 | Control | Shareable control dashboard | link, e-mail, WhatsApp, embed | `/goals` and the project tab, internal only | **M** (`/g/[token]`) |
| 17 | Dashboards | Client changes the period on the link | date picker and comparison on the public dashboard | `/d/[token]` shows the agency's preset; `updateDashboardPresetAction` internal | **M** (query-param range → `liveDashboardData`, cache key per range) |
| 18 | Dashboards | Real-time refresh (1–2 min) | Pusher-driven refresh on rolling presets | 5-minute `MetricCache` + manual "Refresh data" | **S–M** (client poll `router.refresh()` on rolling presets) |
| 19 | Integrations | Campaign-level selection | pick campaigns on the integration and at generation | none; `Connector.fetch` has no campaign filter (`src/lib/connectors/index.ts`) | **M** (shares groundwork with #1) |
| 20 | Overview | Pages with chosen metrics | tabs (Leads, E-commerce…), metric columns, grouped metrics | fixed `OVERVIEW_KPIS` in `src/lib/services/overview.ts`, the board on `/overview` | **M** |
| 21 | Projects & account | Multi-language UI | PT / EN / ES / FR | English strings inline; `Project.locale` only drives the analysis language | **L** |
| 22 | Report editor | Campaign filter by rule | contains / does not contain, combinable | none (needs #1) | **M** |
| 23 | Report editor | Cross-network funnel | steps from different integrations, horizontal/vertical, calculated steps | `funnel_v1` only from catalog archetypes (`src/lib/catalog/archetypes.ts`), `FunnelCard` in `widgets.tsx` | **M** — `funnel` special widget whose steps are `{prefix:key}` refs resolved like `calculatedValue()` |
| 24 | Report editor | Table: change dimension | GA4 up to two dimensions | table keys fixed in the catalog; `applyTableCustom()` cannot re-query | **M** |
| 25 | Report editor | Table keyword filters AND/OR | operators + logical operator | none; `applyTableCustom()` has hide/order/sort/limit | **S** (client-side over stored rows, `WidgetCustom.filters`) |
| 26 | Reports | Convert report ↔ dashboard | change the file or create a copy | `Report.kind` never changes; no action in `src/app/actions/app.ts` | **S** |
| 27 | Reports | Duplicate report / dashboard | "copy of …" | only `duplicateTemplateAction` exists (`actions/app.ts`) | **S** |
| 28 | Reports | Wizard: campaigns per ads account | `CampaignSelect` step | `ReportBuilder` picks integrations only | **M** (after #19) |
| 29 | Theming & cover | 17 report themes | `theme-report-1…17` recolour charts and highlights; block theme wins | one `--brand`; `PALETTE` constant in `src/components/charts.tsx` | **M** (see 3.3) |
| 30 | AI | Cross-project Chat AI | ⌘J chat: queries, creates reports/automations/goals, live Meta Ads, external MCP | `AskBox` per report (`src/components/ask-box.tsx`); MCP server (`mcp/server.ts`, 21 tools) usable from Claude | **L** |
| 31 | AI | Studio: describe → material | prompt → single page / slides, chat editing, publish, templates | `studioDeck()` from a report + viewer (`src/components/studio-deck.tsx`); no prompt, edit or link | **L** |
| 32 | API & automation | Official Zapier / Make / n8n | published apps + n8n community node | generic signed webhooks (`src/lib/services/webhooks.ts`) + Push API | **M** |
| 33 | Integrations | Expired-integration notifications | bell + e-mail (+WhatsApp) with reintegrate link | `lastError` on the project page; "Needs attention" count on `/overview` | **S** |
| 34 | Report editor | Grouped ("magic") metrics | `magic:ads-spend`, `magic:social_media-new_followers`… | formula can sum a prefix (`src/lib/engine/formula.ts`); no ready-made groups in the drawer | **S** |
| 35 | Report editor | Per-widget Excel export | CSV / Excel per widget | CSV via `reportToCsv` (`src/lib/services/export.ts`) from the drawer | **S** |
| 36 | Report editor | Reorder blocks by drag | press-and-hold handle (SortableJS) | up/down arrows (`moveBlock`, `report-editor.tsx`) | **S** (reuse the pointer pattern of `grid.tsx`) |
| 37 | Report editor | Table: hide / highlight rows | `hiddenRows`, `highlightedRows`, row count | `rows` limit only | **S** |
| 38 | Reports | AI analysis at generation: template-based | general or template AI analysis | general card only (`attachAnalysis` on automations, builder toggle) | **S–M** |
| 39 | Reports | Failure state with retry | "not generated — reintegrate" page, per-widget retry | amber `SourceStatusList` banner, no retry or reconnect link | **S** |
| 40 | Reports | List badges + bulk delete | "Not viewed", "Automated", select all | `ReportIndex`: search, client filter, view count | **S** |
| 41 | Timeline | Standalone shareable timeline | public link, project password | milestones inside shared reports and the project tab only | **S–M** (`/t/[token]`) |

### Could (33)

| # | Area | Feature | Reportei does | Ruler Reports today | Effort |
|---|---|---|---|---|---|
| 42 | AI | Assistants (Ads, Instagram, E-mail) | chat with a specialist | none | **M** (personas over `AskBox`) |
| 43 | AI | Opportunity score + Meta Ads alerts | score /100, pause / swap creative | none; `connectors/meta.ts` reads insights only | **L** |
| 44 | API & automation | OAuth-issued MCP tokens | "MCP OAuth – Claude" tokens | static `ApiToken` (`src/lib/auth.ts`, Settings › API) | **M** |
| 45 | Automations | Bulk automation across projects | "All projects / Select all" | one project per form | **S–M** |
| 46 | Automations | Monthly by weekday position | first/last Monday… | `dayOfMonth` only | **S** |
| 47 | Automations | Quick-create from a report | `AutomationQuickCreateModal` | project-tab form only | **S** |
| 48 | Control | Auto-record outcome to the timeline | rocket / alert per period | `goals.ts` closes periods (`lastClosedPeriod`) but writes no `TimelineEvent` | **S** |
| 49 | Control | Indicator from a report widget | "Create control from report" | `GoalForm` on the project page only | **S** (toolbar button → prefilled form) |
| 50 | Control | Goal filtered by campaign | ads goals per campaign | none (after #19) | **M** |
| 51 | Dashboards | Pause real-time on a custom period | warning modal | n/a until #18 | **S** |
| 52 | Overview | Per-project filters + saved presets | campaign / objective filters, presets | none | **M** |
| 53 | Overview | Real-time polling | 30 s | none | **S** |
| 54 | Projects & account | Activity log | company-wide log | no audit table | **M** |
| 55 | Projects & account | Archive a project | read-only history | delete only (`deleteProjectAction`) | **S** |
| 56 | Projects & account | Multi-company membership | switcher | `User.companyId` is single | **L** |
| 57 | Projects & account | Owner transfer | transfer ownership | roles exist, no action | **S** |
| 58 | Report editor | Calculated step in a funnel | formula step | after #23 | **S** |
| 59 | Report editor | Chart reference lines | horizontal / vertical annotations | none (`WidgetCustom` has no annotations; recharts `ReferenceLine` available) | **S** |
| 60 | Report editor | Chart start-at-zero | `beginAtZero` | none (YAxis `domain`) | **S** |
| 61 | Report editor | Chart two axes | `two_axis` | none (`yAxisId`) | **S–M** |
| 62 | Report editor | Manual chart (metric × dimension) | typed values → chart | none (see 3.4) | **M** |
| 63 | Report editor | Save a metric to the timeline | toolbar action with suggested title | none | **S** |
| 64 | Sharing & export | Share by WhatsApp from the editor | Share ▾ › WhatsApp | automation channel only | **S** (`wa.me` link) |
| 65 | Templates | Studio templates | save Studio as template | none (after #31) | **M** |
| 66 | Templates | Templates with AI-analysis config | template AI | `Template.sections` only | **S** |
| 67 | Theming & cover | Footer customisation | logo, shape, colours | "Powered by" line only (`public-report.tsx`) | **S** |
| 68 | Theming & cover | Per-block theme override | block theme wins | none (after #29) | **S** |
| 69 | Timeline | Event / outcome icons | icon picker | title, content, date only | **S** |
| 70 | Timeline | Save event and write e-mail | "Save and write e-mail" | none | **S** |
| 71 | AI | Regenerate an analysis | replaces the card, one free | "Generate" adds another card (`AnalysisPanel`) | **S** |
| 72 | API & automation | Per-widget query endpoint (v1) | `POST /integrations/{id}/widgets/value` | `POST /metrics/get-data` | **S** (alias) |
| 73 | Automations | WhatsApp summary with metrics | KPIs in the message | title + link only (`messaging.ts`) | **S** |
| 74 | Report editor | Hide a campaign | per container | widget hide/show exists; no campaign containers (#1) | **S** after #1 |

Skipped on purpose: plan-gated integrations, billing. Extras not scored: Push API, Slack/Teams/Discord/Telegram, anomaly
flags, client-portal role, whole-report CSV, HMAC webhooks with delivery log, self-hosting, 18 extra slugs, demo-data mode.

---

## 3. The five requested features

### 3.1 Client / project logos on project and report screens

**Exists.** `Project.logo String?` and `Company.logo String?` (`prisma/schema.prisma`); API v2 reads and writes the project
logo (`sProject`, create/update in `src/lib/api/routes.ts`). Settings › White-label has an agency "Logo URL" field; that logo is
rendered in one place only, the public dossier header (`src/components/public-report.tsx`, `<img class="h-7">`), and the
agency *initial* in the rail (`BrandMark` in `src/components/shell.tsx`).

**Missing.** The project logo is never rendered: the projects list draws the initial letter (`projects/page.tsx`,
`pr.name.slice(0, 1)` tile), the project header is text (`PageHeader`), the internal report subtitle links the name
(`report-page.tsx`), the public cover prints the name as an eyebrow (`public-report.tsx`), the reports index cover too
(`report-rows.tsx`). No UI sets it: the "New project" form has name/timezone/currency/decimal only and there is no project
settings form at all (only the API can set `logo`). No upload (URL strings), no shape, no choice of agency vs client logo on
the cover, no logo in e-mails. Reportei: project logo in settings, cover logo upload with round/square and show/hide.

**Build.** `ProjectMark { logo, name }` (image with the initial as fallback) used in six places; project settings form
(`/projects/[id]?tab=settings` with logo, name, locale, formats) → **S**. Upload instead of URL: see 3.5 (**M**).

### 3.2 Platform icons instead of coloured dots

**Exists.** Every slug has a `color` (`src/lib/catalog/integrations.ts`); it is painted as dots in six places:
`PlatformBadge` (`widgets.tsx`, 8 px dot + uppercase name — block headers, editor block headers, project integrations list),
project cards (`projects/page.tsx`, 10 px dots), the report builder (`report-builder.tsx`), the editor's Add-block menu
(`report-editor.tsx`), the public cover's Sources list (`public-report.tsx`), and the connect catalog's coloured square with
the first letter (`projects/[id]/connect/page.tsx`). `public/` is empty, `nav-icons.tsx` holds the eight nav glyphs only, lucide
ships no brand marks, and `IntegrationDef` has no `icon` field.

**Missing.** One SVG per slug. Simple Icons (CC0) covers the global half (Facebook, Instagram, Threads, X, YouTube, LinkedIn,
TikTok, Pinterest, Snapchat, Reddit, Google Ads, Google Analytics, Search Console, Google Business Profile, Microsoft, Amazon,
Apple, Shopify, WooCommerce, BigCommerce, PrestaShop, Stripe, HubSpot, Salesforce, Zoho, Pipedrive, ActiveCampaign, Mailchimp,
Klaviyo, Brevo, Omnisend, Matomo, Plausible, Google Sheets, Make, Zapier, n8n…); the Brazilian ones (RD Station, Nuvemshop,
Hotmart, Kiwify, Eduzz, iFood, Olist, Magazord, Kommo, Phonetrack, GreatPages, Repediu, Cardápio Web, E-goi, Pluga) need
hand-drawn marks or a lettermark fallback.

**Build.** `icon?: string` on `IntegrationDef` + `public/icons/<slug>.svg`; `<PlatformIcon slug size />` with a lettermark
fallback in the platform colour; replace the six dot sites and the connect tile → **S** for the first 25 slugs, **M** for all 67.

### 3.3 Colour customisation per report and per channel / platform

**Exists.** One workspace colour: `Company.brandColor` → `--brand` on the shell and the public page (`shell.tsx`,
`public-report.tsx`), used for buttons, links, highlights and the main chart series on the client link (`ReportBody
brand={company.brandColor}` → `TimeChart color`). Series beyond the first come from the constant `PALETTE` in `charts.tsx`.
`Company.accentColor` is stored but never read (bug B11). Per-platform colour = the catalog constant, not editable.

**Missing.** Per-report theme (`Report` has no theme field), per-block colour/icon (`LayoutBlock` has none), per-widget series
colour (`WidgetCustom` has none), per-platform override (nothing lets the agency recolour "Meta Ads" blocks), cover background
and text colour, highlight colour. Reportei: 17 report themes, block theme override, custom-block colour and icon, cover and
footer colours.

**Build.** `Report.theme` JSON (`{ palette[], highlight, cover: { bg, text } }`) with 17 presets, `LayoutBlock.color/icon`,
`Company.platformColors: Record<slug, hex>` consumed by `getIntegrationDef`/`PlatformBadge`; turn `PALETTE` into CSS
variables (`--series-1…8`) that `charts.tsx` reads, set on the report wrapper, overridden per block → **M**. Fix B10 first so
the editor and the client link agree on colours.

### 3.4 User-built charts and infographic widgets

**Exists.** Charts come only from catalog keys (`chart_v1`); per widget you can pick line/bar (time) or bar/pie (category)
and group by day/week/month/quarter (`rebucket()` in `compose.ts`, `SettingsPanel`). The Customizable tab offers Analysis,
Manual metric and Calculated metric (`specials` in `report-editor.tsx`; `SPECIAL_SLUGS` in `layout/types.ts`). Building
blocks available: `TimeChart`, `CategoryChart`, `Sparkline` (recharts), `FunnelCard`, the formula engine
(`src/lib/engine/formula.ts`) and blended metrics, the caliper.

**Missing.** (a) a composed chart: pick 1–4 metric refs from the report → one chart (series for catalog chart keys are
already stored per key by `ensureWidgetValues`); (b) a manual chart: typed labels/values (`WidgetCustom.manualSeries`)
rendered by the existing chart components; (c) chart options: two axes, start-at-zero, reference lines (#59–61);
(d) infographic widgets: icon list (`iconsList_v1`), progress ring / gauge bound to a goal, heading/divider, image card,
big number with icon. Reportei has (a) partly (metric × dimension chart), (b), (c) and the icon list.

**Build.** (a) **S**, (b) **M**, (c) **S**, (d) **M** — all are new `special` slugs resolved in `composeReport()` plus a
`SettingsPanel` section each; no connector work.

### 3.5 Importing media (images) into reports

**Exists.** Nothing: no upload route (`grep upload|multipart|writeFile src` → none), `public/` is empty, logos are URL
strings, `sanitizeHtml` drops `img` (allow-list in `src/lib/util/sanitize.ts`), the analysis drawer says "Scripts, images
and iframes are stripped", e-mail bodies carry no images.

**Missing.** `POST /api/v2/uploads` (multipart, type/size limits, `DATA_DIR/uploads/<company>/<id>.<ext>` or S3) and a
`/u/[id]` route with cache headers; an `Upload` table (company, project, mime, size, createdBy); `img` in the allow-list with
`src` restricted to `/u/` or https; an "Insert image" control in the analysis editor (which means a real WYSIWYG — TipTap —
instead of the textarea); an `image_v1` widget (upload or URL, fit/cover, caption, link); logo upload for company and
project; a Docker volume for uploads. Reportei: Quill with images/video in analysis cards, logo upload on cover/footer.

**Build.** **M** with local disk and TipTap; **L** with S3 and image processing.

---

## 4. Behaviour differences (flow · Reportei · Ruler Reports · decision)

| Flow | Reportei | Ruler Reports | Decision |
|---|---|---|---|
| Build a report | generate from a template, edit the document in place, autosave | same since 2026-10-21 (`/reports/[id]`, 12-col grid, drawers, autosave, undo); numbers stay a frozen snapshot | done; remaining: containers, block colour/icon |
| Monthly commentary | one AI card per block, tones, credits | one card list per report, unlimited regenerate, no credits | fix per-block; keep no credits |
| Period after creation | fixed; AI re-run asks about credits | fixed; "Refresh data" re-pulls | keep, allow editing the period |
| Shared dashboard | client picks the dates; real-time | agency's preset only; 5-min cache | fix (#17, #18) |
| Password | per project (all links) | per report | add a project default |
| Delivery | e-mail (+failure alerts), in-app, WhatsApp direct/webhook | e-mail/outbox, in-app, Slack/Teams/Discord/Telegram, WhatsApp webhook | keep extras; add #13, #14 |
| Goals | 7 per project, e-mail/WhatsApp, shareable, campaign filter | unlimited, in-app + webhook, internal | add #15, #16 |
| Connecting accounts | OAuth everywhere, plan-gated | OAuth Google/Meta, tokens elsewhere, mostly synthetic | fix #3, #4 |
| Overview | pages, metric picker, filters, presets, real-time | one KPI board + anomalies | add #20; keep anomalies |
| Errors | "not generated — reintegrate" page with retry | amber banner inside the report | add retry/reconnect (#39) |
| Clicks to first report | 5 | 4 | keep |
| Colours seen by the writer vs the client | identical | charts differ (B10) | fix |

---

## 5. Bugs

Severity: **S1** blocks a core flow or loses data · **S2** visible on most pages or hides a control · **S3** cosmetic / edge.
None of these is S1. Measurements are in `probe.json` (3101, 50 loads) and `probe2.json` (3102); screenshots in `shots/`.

### Slide-rule navigation (`src/components/slide-nav.tsx`, `.slidenav*` in `globals.css`, `src/components/shell.tsx`)

**B1 — S2 — The marker is absent at first paint and flies in from the left edge on every page load and every client-side
navigation.**
Repro: open `/api-docs` at 1440. The page paints with "API & MCP" bold but no ink bar; ~85 ms later (prod; 0.7–4 s on the dev
server) a bar appears at x = 0 under "Overview" and slides 941 px to the right over 0.4 s while fading in (samples:
`op 0 / 0px → 0.24 / 141px → 0.47 / 283px → … → 1 / 941px`). Then click "Projects": the bar under Overview switches off,
reappears at x = 0 and slides to Projects (`+8 ms op 1 tr 0 · +85 ms op 0 tr 0 · +108 ms 12 px · … · +490 ms 81 px`). On
every one of the 50 loads the first sample was `opacity 0, translate 0px`. Expected: the marker is under the current section
in the server HTML, and on navigation it slides from the previous section to the new one (the design's "slide along a track").
Cause: `current` starts `null`, so the server renders `translate: 0 / opacity: 0`; `useLayoutEffect` reads `offsetLeft`
(forcing style/layout with the marker at 0) and then sets state, so the inline-style change is animated by
`.slidenav-marker { transition: translate .4s, scale .4s, opacity .25s }`. The slide-in repeats on every route because
`AppShell` is rendered by each `page.tsx` rather than by a layout: Next remounts the whole shell, state resets (the ruler
sampler shows the same remount: marks `2 → 1`). Reduced motion only hides the symptom (the bar pops in late instead).
Fix: (1) move the shell to `app/(app)/layout.tsx` and derive `active` from `usePathname()` inside `SlideNav` — one instance
survives navigation and the marker slides from the previous item for free; (2) draw the resting marker server-side
(`.slidenav-item[aria-current="page"]::before`, 3 px ink) and keep the JS element only for the animation, or gate the
`transition` behind a `data-ready` attribute set after the first measurement (`requestAnimationFrame` after `measureActive`).

**B2 — S3 — The hover ghost parks at the far left and always arrives from there.**
Repro: hover "Goals" (ghost at 532 px), move the pointer off the rail: for ~150 ms the brand bar is visible sliding left
(`532 → 372 → 184 → 92 px` while opacity `1 → 0.53 → 0.17 → 0.06`). Hover "API & MCP" next: the ghost starts at x = 0 and
crosses the whole track (`0 → 283 → 617 → 737 → 942 px`). Cause: `style(null)` returns `translate: 0px / scale: 1` whenever
`ghost` is null, so hiding also moves it home. Fix: keep the last box in a ref and only animate `opacity` when hiding; when a
new hover starts from hidden, initialise the ghost at the marker's box (no transition for that first frame).

**B3 — S2 — When the track overflows (≤ 1280 px) the active section is scrolled under the right fade; items under the left
fade lose their first letters.**
Measured at 1280: nav box 968 px, track 1029 px — already overflowing. On `/api-docs` the active item's right edge equals the
box's right edge (scrollLeft 60 at 1280, 316 at 1024, 556 at 768, 654 at 390; "rightGap 0"), so its last 28 px sit inside
`mask-image: … calc(100% - 28px) → transparent`: "MCP" fades out (`shots/1024-api_docs-head.png`, `1280-api_docs-head.png`);
`/integrations` at 1024/768/390 and `/templates` at 390 behave the same, and the item scrolled under the left fade reads
"emplates" (`768-integrations-head.png`). At ≥ 768 the first item starts 10 px into the 16 px left fade, so the "O" of
"Overview" is drawn at 40–100 % opacity. Before hydration the active item is simply off-screen at these widths.
Cause: `measureActive` calls `scrollIntoView({ inline: 'nearest' })` and the container has no `scroll-padding`; the track has
no inline padding under the fade. Fix: `.slidenav { scroll-padding-inline: 16px 28px }` (+ `inline: 'center'`),
`.slidenav-track { padding-inline: 16px 28px }` and apply the mask only when `scrollWidth > clientWidth` (a `data-overflow`
attribute from a ResizeObserver on `.slidenav`, which the component does not observe today — it observes the track, whose
`max-content` width never changes with the viewport).

**B4 — S2 — The editor toolbar sticks underneath the rail.**
Repro: `/reports/11` at 1440 or 1024, scroll 300 px: "Saved · undo · redo · Add block · Save as template · Preview as client"
is stuck at y 7–53 behind the 61 px rail; `elementFromPoint` at its centre returns `.rail-inner`
(`shots/p2-1440-report-scrolled-head.png` shows KPI cards directly under the rail, no toolbar). Cause: `report-editor.tsx`
toolbar `sticky top-2 z-20` vs `.rail { position: sticky; top: 0; z-index: 40 }` — a leftover from the sidebar layout. Fix:
publish the rail height as `--rail-h` (60 px desktop, 93 px on phones; a ResizeObserver on `.rail` or two media values) and
use `top: calc(var(--rail-h) + 8px)` for the toolbar; the drawers already use `lg:top-16` and are fine.

### Scroll ruler (`src/components/scroll-ruler.tsx`, `.sruler*` in `globals.css`)

**B5 — S2 — On pages that do not scroll the ruler shows one mark at the very bottom, half off-screen, never current; on
long pages the headings of the last screen collapse into one mark at 100 %.**
Repro: `/projects`, `/dashboards`, `/templates`, `/notifications`, `/projects/1` at 1440×900 (and `/dashboards`,
`/projects/1` at 1024×768): the only mark ("Projects") sits at `top: 100%` (tick y 899, label 878–922), nothing is current
(`shots/1440-projects.png`, bottom-left "ects"); the h2s of `/templates` ("report templates", "dashboard templates") are gone.
`/integrations` at 1440 shows 9 of 11 headings ("Local" at 100 %, "Call tracking" and "Custom data & automation" dropped);
`/templates` at 1024 puts "dashboard templates" on the bottom edge. Cause: `H = max(1, scrollHeight − innerHeight)` and
`p = clamp(top / H)`: every heading that can never reach the top of the viewport clamps to 1, and the 0.012 de-dup removes all
but the first; on a non-scrolling page H = 1 so everything beyond the first pixel is 1. Fix: place marks by document
proportion (`top / scrollHeight`) and drive the cursor by `(scrollY + innerHeight · scrollY / H) / scrollHeight`, so both share
one scale, the cursor reaches the last mark at the bottom, and every heading has a place; keep "current = last heading above
y = 96"; when H ≤ 0 draw marks by position and the cursor at 0.

**B6 — S3 — The first label is hidden under the rail, adjacent labels overlap, the last label hangs off the bottom.**
Measured on every page: the h1 tick is at y 59.5 (above the aside's `top: 60px`), its vertical label spans y −20…140
(report) or 0…120 (api-docs) and the rail (z 40 > 30, opaque) covers the top half — "9 clients, la" shows from the "9" down
(`shots/p2-zoom-1440-overview-ruler.png`). "Metro Dental | 2026-…" and "Analysis" (ticks 33 px apart, labels up to 160 px)
print on top of each other (`p2-zoom-1440-report-ruler-top.png`); `/api-docs` stacks six labels in 330 px
(`p2-1440-api_docs-bottom.png`). Cause: `.sruler-mark { translate: 0 -50% }` centres a label of up to 160 px on its tick, the
aside has no inset, and there is no collision rule. Fix: hang the label from the tick (`align-items: flex-start`, label
offset below), inset marks to `calc(16px + p · (100% − 32px))`, and suppress a label whose box intersects the previous visible
one (or show labels for the current mark and its neighbours only).

**B7 — S3 — Cursor and marks use different scales.**
Cursor: `translate: calc(--p · (100vh − 94px))` from `top: 16px`; marks: `top: p%` of the `100vh − 60px` aside. At scroll 0 the
cursor is 16 px below the current tick (76 vs 59.5); with "Authentication" at y 96 (its mark is current) the cursor sits 15 px
under the tick (107.5 vs 92.2); at the bottom it is 2 px above. Fix: one inset formula for both (B5/B6).

**B8 — S3 — The ruler tells writers less than readers, and lists invisible headings.**
In the editor the block titles are `<input>`s (`report-editor.tsx`), so a writer's ruler shows "title · Analysis · Timeline"
only, while a viewer gets one mark per block (`BlockHeader` h2 in `widgets.tsx`); `h2.sr-only` ("Clients", "Analysis") become
marks although nothing is on screen. Fix: wrap the editable title in an `<h2>` (or add `data-ruler-label`), and exclude
`.sr-only` through the existing `.no-ruler` filter.

### Other findings

**B9 — S3 — Horizontal page scroll on `/api-docs` below 1024 px** (document 895 px wide at 768 and 390; the pass-5c
overlap scan did not include this page). Cause: a `<pre>`/endpoint block wider than its column. Fix: `pre { overflow-x: auto;
max-width: 100% }` and `min-width: 0` on `.frame-content`.

**B10 — S3 — "Preview as client" and the client link disagree on colours.** `InternalReport` renders `ReportEditor` and
`ReportBody` without `brand` (`report-page.tsx`), so charts use `PALETTE[0]` (#1a36e6); `/r/[token]` passes
`company.brandColor` (`public-report.tsx`). Fix: pass the brand (or read `var(--brand)` in `charts.tsx`).

**B11 — S3 — "Accent colour" in Settings › White-label is saved (`Company.accentColor`) and never read anywhere.** Wire it
(secondary series, links) or remove the field.

**B12 — S3 — The Add-block menu's click-away layer (`fixed inset-0 z-30`) sits under the rail (z 40):** clicking a nav
link while the menu is open navigates without closing it (harmless because the page unmounts, but inconsistent).

Checked and found correct: marker geometry after settle on all 50 loads (translate = `offsetLeft`, width = `offsetWidth`);
keyboard focus shows the ghost at the focused item (Templates → 345 px); pointer-leave clears it; pages without a nav entry
(`/settings`, `/notifications`) render no stray bar (opacity 0); reduced motion (`prefers-reduced-motion: reduce`) removes every
slide — marker and ghost jump, the ruler is a static tape; the phone rail is two rows (93 px) with the nav full-width; no
horizontal overflow at any width except B9; no console errors on the production build (the dev run logged only HMR errors
when its server was stopped). The dark "N" badge bottom-left in the 3101 screenshots is the Next.js dev-tools button, not
part of the app.

---

## 6. Top five to build next

1. **Shell fixes B1, B3, B4, B5–B7 together** (≈ 2 days): shell into a route-group layout with `usePathname()`, server-drawn
   marker, `scroll-padding`, `--rail-h`, one scale for ruler marks and cursor. They are on every screen the agency opens.
2. **Logos + platform icons + colour themes (3.1–3.3)**: `ProjectMark`, `PlatformIcon`, `Report.theme` with 17 presets,
   block colour/icon (#6, #29), and B10/B11 — the visible gap a client notices first.
3. **Campaign containers and campaign selection (#1, #19, #22, #28)**: one data-model change (campaign filter through
   `Connector.fetch`) unlocks four rows and most of what ads clients ask for.
4. **Uploads + rich analysis + image widget (3.5, #5)** and the composed / manual chart widgets (3.4, #62, #59–61).
5. **Delivery and control parity**: daily and weekday-position schedules, failure alerts, goal alerts by e-mail, shareable
   goals, client date picker and auto-refresh on shared dashboards, convert / duplicate (#12–18, #26–27).

After these the score lands around 72–75 with 7 of the 10 open must-haves closed; live connectors (#3, #4) are the long tail.

---

## Appendix — evidence

- `features.csv` (copy of the project's matrix, unchanged) · `parity-raw.md` / `parity-raw.json` (`parity.py` output)
- `probe.cjs` / `probe.json`: 3101, 10 routes × 5 widths, per-frame marker and ruler samples, geometry, headings vs marks
- `probe2.cjs` / `probe2.json`: 3102 (production build), hover / leave / focus / click samples, ruler scroll alignment, sticky
  toolbar hit-test, no-active pages, reduced motion
- `shots/`: `<width>-<route>-head.png` (rail close-ups), `<width>-<route>.png` (viewports), `p2-zoom-*.png` (2× close-ups),
  `p2-1440-report-scrolled-head.png` (B4), `p2-1440-api_docs-bottom.png` (B6/B7)
- Layout diff: run `imgdiff.py` once Reportei screenshots exist in `replica/screens/` at 1440×900 and 390×844 in the same
  state; the clone side can start from `shots/1440-overview.png`, `1440-projects.png`, `1440-reports.png`,
  `1440-reports_11.png` and their 390 counterparts.
