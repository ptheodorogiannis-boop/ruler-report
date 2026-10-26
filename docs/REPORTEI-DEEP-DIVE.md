# Reportei — deep-dive (how the product really works)

Collected 2026-10-21. Extends [`EVIDENCE.md`](EVIDENCE.md) (2026-10-19), which covered the public API and the metric
model. This pass went inside the app. Every claim is tagged:

| Tag | Source |
|---|---|
| **[UI]** | the live app `app.reportei.com`, opened read-only in the user's own signed-in Chrome (no settings were changed, nothing was saved, created or deleted) |
| **[MODEL]** | the report document exposed on the editor page as `window.$backbone` (structure) and `window.$content` (rendered values); only *shapes and keys* were copied, never client numbers |
| **[BUNDLE]** | the shipped front-end: Vite manifest + 453 JS chunks downloaded from `app.reportei.com/build/` and analysed statically with REA (`analyze_javascript_application`, Evidence `ev_f806a01689c2e95b598338fc390b8f6a0a77832f202fea36ee18f36c05d07a4b`: 453 files parsed, 0 parse failures, 1.85 M AST nodes, 9 219 findings; coverage *partial* — semantic graph truncated by budget). A feature trace on the literal `"Drag to move"` (Evidence `ev_5fe5295baa22c79ba0bc904175d03ec902cd5f478408e4965f8cc114d6107f58`, *inferred*) reached 26 nodes / 67 edges around `Widget-*.js`. String literals were also mined directly from the chunks. |
| **[HELP]** | Reportei help-center articles fetched through the Reportei MCP (`search_help_center` / `get_help_article`) |
| **[LOG]** | "Timeline of Reportei's News" — the in-app changelog, all 15 pages (Oct 2021 → Oct 2026) |
| **[MCP]** | read-only calls to the Reportei MCP (`list_table_fields`, etc.) |

What REA could **not** do here: runtime observation over CDP. Every attempt to launch an isolated Chrome/Edge with
`--remote-debugging-port` was handed off to the already-running Chrome (the flags were even opened as a tab), so no
CDP endpoint existed. Static analysis + the user's signed-in session replaced it. Runtime claims below therefore come
from [UI]/[MODEL], not from REA.

---

## 1. Technology stack [BUNDLE] [UI]

* **Backend:** Laravel. Pages are Blade + **Livewire** (`/vendor/livewire/livewire.js`, `livewire-turbolinks`), with
  **Alpine.js** sprinkled in; the heavy screens are **Vue 3** islands built with **Vite** (35 entry points) and **Vuex**
  stores (`store-*.js`, namespaces `SHEETS/*`, `OVERVIEW/*`, `TrackedStore/*`).
* **Realtime:** Laravel **Echo + Pusher** (`echo-*.js`) — used for live dashboard refresh and overview polling.
* **Editor libraries:** a custom 12-column grid called **"gridigo"** (`GridItem`, `isDraggable`, `isResizable`,
  `rowHeight` in `SourceGridMixin` and `main`), **SortableJS** (28 references) for drag-ordering, **Quill** for the
  analysis text widget, **ApexCharts** (`apexcharts.ssr.esm`) for charts, **pikaday/moment** for dates,
  **cleave** for number inputs.
* **Vite entries** (= product modules): app shell (`app-redesign`), report editor (`reports/themes/v4`), `studios`,
  `overview`, `trackeds` (= Reportei Control), `insights` (= Reportei AI), `chat` (Chat AI), `list-reports-dashboards`,
  `dashboard-session`, `google-sheets` (mapping wizard), `flux-import`, `onboarding`, `companies/onboarding`,
  `billing/plan-adjust`, `downgrade`, `cancellation`, `automations/bulk_automation`, `clients/opportunity_score`,
  and admin-only dashboards (`ai-usage`, `chat-usage`, `platform-usage`, `product-metrics`, `promotion-monitor`,
  `studio-usage`, `meta-ads-alerts`, `google-sheets mapping`).
* **Third-party SDKs on the page:** Intercom, PostHog (feature flags + surveys), Sentry, Heap, Microsoft Clarity,
  ProfitWell, FirstPromoter (affiliate), SatisMeter (NPS), GTM, plus Meta/TikTok/LinkedIn/Bing/X/OpenAI ad pixels.
* **Window globals that reveal features:** `$isDashboard`, `$isDynamic`, `$printing`, `$isExternalReport`,
  `$reportSecurityCode`, `$showAutomationSuggestion`, `$showMcpSuggestion`, `$studioNudge`, `$studioFromReport`,
  `$client_decimal_separator_format`, `$client_date_format`, `$client_locale`, `__reporteiChat*` (plan type, max
  tool iterations = 20, image generation, built-in connectors, attachments jpeg/png/webp ≤ 30 MB, 5 per message).

## 2. Information architecture [UI]

```
/company/{id}                       My projects (cards: reports count, last report, stacked network icons) · Manage team
/overview?tab={page}                Overview (Premium): pages/tabs, real-time toggle, period + comparison, filter, add metrics
/client/{id}                        Project home: 3-step onboarding, Opportunity score /100 + Meta Ads alerts,
                                    Reports · Dashboards · Studio (Beta) · Reportei Control · Reportei AI · Timeline · Automation
/client/{id}/reports                list (search, select all, bulk delete, "Not viewed", "Automated report" badges)
/client/{id}/report/select          New report wizard 1/2 (templates)  →  2/2 period, comparison, integrations, campaigns, AI
/client/{id}/report/{rid}           Report editor            /report/{token} public link   (?old=1 legacy theme in iframe)
/client/{id}/dashboard/select       New dashboard wizard     /client/{id}/dashboard/{did}  (live; same editor, $isDashboard)
/client/{id}/studio/create          Studio wizard (period, template, single-page | multi-slide, integrations)
/client/{id}/reports-automation/create   Automation wizard 1/3 (type, integrations, failure-alert e-mail) …
/client/{id}/control/welcome|dashboard   Reportei Control (indicators & goals)
/client/{id}/insights               Reportei AI hub (assistants, MCP, WhatsApp assistant)
/client/{id}/event/new              Timeline event form
/client/{id}/edit | /auth | /team | /security     Project settings · Integrations · Team · Password protection
/company/{id}/edit?step=account-overview|info|activity-log|plan|team|templates-reports|templates-dashboards|templates-studios|notifications|api-tokens
/settings/personal-data | password-change | privacy/v4 | whatsapp-link
/notifications · /timeline (News) · /auth/reportei/reportei-flux (Flux SSO) · developers.reportei.com (API)
```

Global top bar: project switcher, **"Ask Reportei AI… ⌘J"** (Chat AI), Flux link, notifications bell (integration
expired → "Reintegrate now" links), company switcher (a user can belong to several companies), account menu.

## 3. The report editor — what the user can do [UI] [HELP] [LOG]

### 3.1 Layout and drag-and-drop
* The report is a vertical stack of **blocks** (one per connected account, plus custom blocks). Blocks are
  re-ordered by **press-and-hold on the block's drag handle** (`⋮⋮`, SortableJS) [HELP integracoes-gerais] [UI].
* Inside a block, widgets live on a **12-column grid** (gridigo). Each widget stores `layout {x,y,w,h}`
  [MODEL]. Observed sizes: KPI numbers `3×2` or `3×4`; charts `6×4` (also `3×4`, `4×4`, `12×4`); tables `12×5…22`;
  funnel `12×6–7`; purchase-journey pipeline `12×10`; analysis text `12×2…14`; campaign container `12×2`.
* **Move** = hover the widget → drag handle "Drag to move" (`drag-handler cursor-grab`; disabled with the tooltip
  "You have to finish editing before moving") [BUNDLE Widget]. **Resize** = drag the arrow handle in the bottom-right
  corner (298 resize handles in the live DOM) [UI] [LOG 2023-09-19 "Optimization of metric layout and sizing"].
* **Adding a widget** = open the left **control bar** ("Add metrics" button on the block, or the network icon in the
  left rail) → tab **Predefined metrics** (searchable, alphabetical, each entry shows its type icon: number / chart /
  table; a GA4 block lists ~96 entries) or tab **Customizable metrics** = `Analysis · Calculated metric · Chart ·
  Funnel · Manual metric` → **drag the entry into the block** [UI] [HELP metricas-manuais-calculadas].
* Autosave: the top bar shows **"✓ Saved"**; edits are pushed through Vuex `backbone` commits [UI] [BUNDLE main].
* **Undo/redo** icons exist in the bundle (`undo`, `redo`, `undo-12`, `undo-20`), and a `DataUnsavedModal`.

### 3.2 Widget hover toolbar [UI]
`Drag to move` · **Highlight** (star — coloured emphasis for number widgets) · **Duplicate** · **Edit** · **Hide**
(for campaign containers: "Hide Campaign") · **Save to timeline** (turns a number into a milestone with a suggested
title/description [LOG 2025-10-08]) · **Generate widget query** (opens `SourcePayloadModal` / `CopyReportModal`: the
API query for this widget — the "query builder" mentioned in the API docs) · **Remove** · per-widget **export**
(CSV / Excel, `ExportConfigurationModal`) [HELP exportar-compartilhar].

### 3.3 Widget types [MODEL] [BUNDLE]
| component | what it is | notable `custom` settings |
|---|---|---|
| `number_v1` | KPI with comparison | `showComparisonValue`, `showAbsoluteDifference`, `isPositiveBad` (invert colour meaning), `custom_period` (e.g. `MTD`), `decimal_places`, `references.title/description` override, `highlight` |
| `chart_v1` | line / bar / pie (ApexCharts) | `chart_type`, `group_by` = day · week · month · quarter (+ weekday), `two_axis`, `beginAtZero`, `annotations[]` (horizontal/vertical **reference lines**, with/without legend), `type: vertical` (orientation), custom period |
| `datatable_v1` / `datagrid_v1` | tables | `hidden_columns`, `originalOrder` (column move), `hiddenRows`, `highlightedRows`, row count (`max_number_of_rows`), `filters` (keyword rules, **AND/OR** `logicalOperator`, operators e.g. *Equals to / Not equals to / Contains / Does not contain*), `sort[]`, **dimension change** (GA4 up to 2 dimensions) [LOG 2025-08-22], custom columns composed from `available_metrics` × `available_dimensions` [MCP list_table_fields] |
| `calculated_v1` | formula over predefined/manual values, + − × ÷ and parentheses; **grouped ("magic") metrics** `magic:ads-spend`, `magic:ads-clicks`, `magic:ads-impressions`, `magic:ads-reach`, `magic:ads-campaigns_count`, `magic:gmb-total_directions_actions`, `magic:social_media-new_followers`, `magic:social_media-total_posts_engagement`, + CRM and e-mail-marketing groups | `formula[]`, `calculatedFormula`, `calculatedData{values, decimalPlaces}`, `source{preferred_source_id}` (which account feeds a cross-network widget) |
| `funnel_v1` | horizontal or vertical funnel; each step can come from a different integration and can be a calculated metric | `steps[]`, `type` |
| `pipeline_v1` | GA4 "Purchase journey" / CRM pipelines | |
| `container_v1` | **campaign container** (`container_type: campaigns` / `summary`) holding per-campaign widgets; "Add campaigns" per ads block; campaign filter **by rule** (contains / does not contain, combinable) or manual selection [LOG 2025-07-09] | `campaigns`, `campaign_filters` |
| `wysiwyg_v1` / `analysis_v1` | analysis card (Quill: text, images, links, video); AI-generated variants carry an "AI" marker | `content`, `sendByWebhook` |
| `empty_v1` | **manual metric** placeholder (offline numbers typed in) | `isManual`, `values` |
| `iconsList_v1` | icon list widget | |
| manual **Chart** (customizable) | choose metric, dimension (e.g. Date), chart type → "Generate chart"; grouping available for date dimension | |

Widget identity: `reference_key` (`fb_ads:spend`, `google_analytics_4:all_sessions`, `all_conversions:conversionActions/<id>`
for per-conversion-action metrics, `magic:…` for grouped, `wysiwyg`, `number`/`number_2` for manual) + `references`
(`title, description, tags, columns, labels, diff_type, formatting_function, can_be_aggregated, labels_formatting_function, type`).

### 3.4 Blocks (sources) and custom blocks [MODEL] [UI]
`sources[]` = `{source_id, type, slug, source_name, specific_type, integrated_at, currency, isCustom, info{name, color,
icon, backgroundColor, monitoredMetrics, enabled}, custom{theme, isHidden, info{name, subtitle, color, icon{name,
background, color}, shouldShowHeader}}, content{widgets[]}}`. Numeric `type` codes seen: 0 Facebook, 6 Meta Ads,
7 Instagram, 8 Google Ads, 12 Google Business Profile, 16 GA4, 999 custom block.
A **custom block** ("Marketing Efforts", "Monthly Overview", "Next Steps" style) has title, subtitle, border colour,
icon (name + background/colour), show/hide header, its own theme, and can hold manual metrics, grouped metrics,
calculated metrics, funnels, charts, analyses and **metrics dragged from any other network block** [LOG 2023-12-01].
Blocks can be hidden (`isHidden`), removed, re-ordered, themed individually.

### 3.5 Report-level customization [UI] [HELP relatorios-e-dashboards] [BUNDLE CoverEditor/FooterEditor]
* **Cover** (`header`): show/hide cover, title, subtitle, logo (upload, round/square, show/hide, remove), background
  colour, text colour, "Make report header behave like cover", `report_details` (period card on cover).
* **Footer**: logo, logo shape, colours, themes.
* **Report theme**: 17 themes (`theme-report-1…17`) that recolour charts and highlighted metrics; hierarchy =
  block theme overrides report theme [LOG 2023-12-06].
* Decimal/thousand separators and date format come from the **project**, with a banner when the client's setting
  differs from the user's account [UI].
* Period & comparison are edited from the period card (`ConfirmPeriodModal`; changing the period of an AI-analysed
  report asks whether to re-run AI (credits) or drop AI).

### 3.6 Top bar actions [UI] [LOG]
`Saved` · **Save as template** · **See as client** (public view) · **Create Studio** (from this report) ·
**Share ▾**: Share by link · Share by PDF (`PdfConfigurationModal`: full page, page breaks) · Share by WhatsApp ·
Share by e-mail · Embed view (`EmbedModal`) · Automate sending this report · **⋮ More options**: Convert to
dashboard / report (change current file or create a new one) [LOG 2023-08-30] · Duplicate ("copy of …") · Delete ·
(dev) Copy report query.

## 4. Reports vs dashboards [HELP] [UI] [LOG]
* **Report** = snapshot of a period; analysis period cannot change after creation; meant to be sent monthly with
  commentary. **Dashboard** = same editor and widgets, but the period and comparison can be changed — also by the
  client on the shareable link — and it can be **real-time** (`ConfirmChangeRealTime`): with a rolling period
  (Today, Last 7/15/30 days, Week to date) it refreshes every ~1–2 min; a custom/retroactive period pauses real-time
  [LOG 2026-03-18]. Data otherwise refreshes only on a user action (change period, re-add metric, regenerate).
* Generation can **fail** ("was not generated — error in data collection… reintegrate") and the dashboard offers
  *Delete dashboard* [UI].
* Lists show *Last report created*, *Not viewed*, *Automated report*, search, select-all/bulk delete [BUNDLE list_main].

## 5. Generation wizard [UI]
Step 1 **Templates**: *Reportei templates* (Classic, E-commerce, Inbound, Paid Traffic), *Expert templates*
(community-submitted), *My templates* (+ "Manage templates"). Step 2: title/subtitle, period presets, comparison,
integrations (multi-select, "Undo selection", "Add new integration"), campaign selection for ads networks
(`CreateWithoutCampaign`, `CampaignSelect`), **AI analysis toggle** (general AI analysis vs template AI analysis)
[LOG 2024-07-23]. Templates that were saved with "whole account" data vs N campaigns behave differently [HELP templates].

## 6. Automations [UI] [HELP automacoes] [LOG]
* Types: **Report automation** (generate + send) and **WhatsApp summary automation** (key metrics as a chat message).
* Frequency: **daily** (PRO+), weekly, biweekly, monthly by day-of-month **or by position** (first/second/third/fourth/
  last weekday) [LOG 2026-09-18]; hour + weekday; analysis period = previous period (Last 7 days, Previous week,
  Last 15 days, Last 30 days, "Same previous period").
* Delivery: e-mail (recipients), **in-app**, **WhatsApp direct** from Reportei's official number (up to 3 numbers per
  automation; beta, all plans) [LOG 2026-08-12] or WhatsApp **via webhook** to Make/Zapier/n8n; **integration-failure
  alert e-mail** before the next run [UI].
* Bulk automation creation across projects (`bulk_automation_main`: "All projects", "Select all") [BUNDLE].
* Quick-create from inside a report (`AutomationQuickCreateModal`), plan limits (`AutomationPlanLimitModal`),
  persistent "Automate this report" nudge [UI].

## 7. Reportei Control (goals / indicators) [UI] [BUNDLE ControlFormWizard] [LOG]
* Premium. Up to **7 indicators per project**, from any integration; **Goal** (reach at least) or **Limit** (stay
  under); `is-positive-bad` colouring; periods incl. `last_day`, `lastOfQuarter`, `lastOfSemester`, `lastOfYear`,
  custom; "Show with taxes" (Meta balance) [LOG 2026-10-15]; **filter by campaign** for ads networks [LOG 2025-03-24].
* States: *Goal reached / Below the goal / Above the goal / Limit reached / Below the limit / Above the limit*;
  progress ring, days left, projected value.
* Alerts: `target_reached_alert`, `below_average_alert`, `above_average_alert`, `whatsapp_alert` — e-mail, and
  **WhatsApp** (official number, 3 numbers per project) [LOG 2026-09-24]; webhook events `control_goal_met / not_met`.
* Control dashboard is **shareable by link, e-mail, WhatsApp** and embeddable [BUNDLE control_main]; goals can
  **auto-record each period's outcome to the Timeline** (rocket vs alert icon) [LOG 2025-10-08]; "Create control
  from report" modal turns a report widget into an indicator.

## 8. Timeline [UI] [HELP timeline] [LOG]
Event = title, date, details (rich text), optional linked report, **icon picker**; *Save* or *Save and write
e-mail*. Shareable link (password-protected with the project). Fed automatically by "Save to timeline" on widgets
and by Control. Webhook `timeline_milestone_added`. Plan-gated.

## 9. Reportei AI [UI] [HELP reportei-ai] [LOG]
* **AI analyses in reports** (2023-09): one per integration at generation, or added later per block ("Add analysis"
  → manual / general AI / **specific-tone** analyses, e.g. Meta Ads: General, CPC, CTR, worst-performing metric,
  maximise results; RD CRM: conversion rate, lost-opportunity rate, task performance). Credits: 1 per analysis;
  **regenerate once** free; editing an AI card makes it manual; period change re-runs with credits.
* **Assistants** (`/insights`): Ads Management, Instagram, E-mail Marketing & Automation; "chat with the assistant"
  (3 messages per credit); **Reportei Assistant on WhatsApp** (beta).
* **Chat AI** (⌘J, 2026-08): queries any integration, compares periods, creates reports/dashboards/automations/goals/
  timeline entries, checks opportunity score, generates artifacts (HTML, charts, code, Markdown, diagrams), reads
  **live Meta Ads** (active campaigns, budgets, creatives, audiences) [LOG 2026-09-11], and can connect **external MCP
  servers** (AI plan).
* **MCP server** for Claude/GPT (OAuth tokens appear under *API Reportei* as "MCP OAuth – Claude (user)") [UI].
* **Studio** (2026-08, beta): describe → AI builds the whole material; formats *Single page* or *Multi-slide*;
  edit by chat (colours, texts, charts, sections); change period afterwards; publish via public link / embed;
  Studio templates; "Save Studio as template"; "Copy my text" [BUNDLE studios main].

## 10. Overview [UI] [HELP overview] [LOG 2024-08-13]
Premium (7-day trial). Multiple **pages** (tabs such as Leads, E-commerce, Ad spend, Social Media, IG Post Types…),
rows = projects, columns = metrics (+ grouped metrics), real-time (30 s polling), period + comparison, per-project
**filter** (campaigns, Meta objective) with **saved filter presets**, "View of <team member>", totals row, average
value, drag-sortable pages (`PagesDraggableEditor`), onboarding.

## 11. Opportunity score & Meta Ads alerts [UI] [LOG 2026-09-17]
Project home shows a **score /100** computed by Reportei from Meta Ads data, with alerts of 4 types (Delivery, Issues,
Fatigue, Catalog) and severity (Error/Warning/Info); actions **Pause/Reactivate delivery**, **Swap creative**,
dismiss/restore, jump to Ads Manager. Not plan-gated.

## 12. Integrations [UI /client/{id}/auth] [LOG]
Catalog with plan badges (none = all plans, Pro, Premium, Alpha/Beta):
Instagram Business · Facebook · Meta Ads · Google Analytics 4 · Google Ads · Twitter/X Ads (Pro) · YouTube · LinkedIn
(page or **personal profile**) · LinkedIn Ads (Pro) · RD Station Marketing (Pro) · Google Search Console (Pro) · Google
Business Profile · Mailchimp (Pro) · Hotmart (Pro) · TikTok · TikTok Ads (Pro) · Pinterest (Pro) · Pinterest Ads (Pro) ·
Pipedrive (Pro) · ActiveCampaign (Premium) · Phonetrack (Pro) · RD Station CRM (Pro) · HubSpot Marketing (Premium) ·
HubSpot CRM (Premium) · E-goi (Pro) · Shopify (Premium) · Google Sheets (Pro, 3 tabs) · WooCommerce (Pro) · Nuvemshop (Pro) ·
Magazord (Pro) · Threads · Spotify Ads (Premium) · Kiwify (Pro) · Kommo (Pro) · Repediu (Pro) · GreatPages (Pro) · iFood
(Pro) · Cardápio Web (Pro) · Olist (Pro) · Eduzz (Pro) · GoHighLevel (Pro) · Microsoft Ads (Pro) · Kwai Ads (Pro) · Klaviyo
(Pro) · CallRail (Alpha Premium) · Keyword.com (Alpha Premium) · Twilio (Alpha Premium) · Google Local Services (Beta
Premium) · ChatGPT Ads (Beta Pro) · NAMTAB (Beta Pro) · Ahrefs (Beta Premium) · Airtable (Alpha Premium). Bundle icons
also include `facebook_groups`, `google_analytics` (UA), `telegram`, `snapchat`, `tiktok_shop`, `goomer`.
Google Sheets / Airtable are **custom-data** integrations with a 3-step wizard (format → validate → create metrics,
optionally with AI "Create metrics"); columns are bound by position (vertical/horizontal sheets).
Expired integrations raise bell notifications + e-mail (+ WhatsApp beta) with a reintegrate link.

## 13. Sharing, export, security [HELP exportar-compartilhar] [UI]
Public link per report/dashboard/timeline/control (`/report/<32-char code>`); **password protection is per project**
(covers all its shareable links); embed code; PDF (full page / page breaks); CSV/Excel **per widget only** (no whole-
report Excel); WhatsApp and e-mail share; "See as client"; view counter via API.

## 14. Projects, team, account [UI] [HELP equipe-e-conta]
Project: logo, name, report language, date format, decimal separator, **timezone** (with the post-at-midnight warning),
security (password), team per project, archive (irreversible, read-only history). Company: account overview (reports /
projects / dashboards / automations generated), company data (logo, name), **activity log**, plan & billing
(Starter / Pro / Premium, +AI tiers, invoices, card, cancel), team (Owner / Admin / Member; members limited to
projects; owner transfer), templates (report / dashboard / studio, with usage counts), notifications (WhatsApp
integration-break alerts), API tokens (+ MCP OAuth tokens). Multi-company membership with a switcher.

## 15. API and automation platforms [HELP collab-sheets-api] [LOG 2025-04-22] [`EVIDENCE.md` §4]
Besides REST v2 there is still a **v1** (`/api/v1/clients`, `/api/v1/clients/{client}/integrations`,
`/api/v1/integrations/{id}/widgets`, `POST /api/v1/integrations/{id}/widgets/value` — the per-widget "query builder").
Official **Zapier**, **Make** (incl. custom API calls) and **n8n community node** (`@reportei/n8n-nodes-reportei`):
actions create report / dashboard / timeline milestone; triggers report created, dashboard created, milestone added,
automation ran, goal reached / missed. Reportei **Sync** (Google Sheets add-on, 20+ networks) and **Flux** (post
scheduling, approvals, 1 project from R$19.90/mo) are separate products.

## 16. Feature timeline (from the changelog) [LOG]
2021-10 new version (v4 editor) · 2021-11 cover/footer customization, templates, GA4 · 2021-12 CSV/Excel export ·
2022-03 manual metrics & charts, analysis anywhere · 2023-07 chart grouping by week/month/quarter, HubSpot ·
2023-08 duplicate, convert report↔dashboard, post comparison · 2023-09 Reportei AI (analyses + assistants), reference
lines, start-at-zero toggle, new move/resize · 2023-10 custom block · 2023-11 Teams (multi-admin, per-project
members) · 2023-12 calculated metrics, cross-network funnel, report themes · 2024-01 grouped metrics · 2024-02 chat
with assistants · 2024-03 AI analysis on existing reports, regenerate · 2024-04 UTM tables/columns, social & CRM
groups · 2024-07 tone-specific AI analyses, template AI · 2024-08 WooCommerce, Shopify, **Overview** · 2024-09
AND/OR table filters · 2024-10 GA4 funnel · 2025-02 vertical funnel, calculated steps, e-mail grouped metrics ·
2025-03 Control goals by campaign, Threads · 2025-04 Zapier/Make/n8n, Kiwify · 2025-05 Kommo · 2025-07 campaign
filter by rule, Overview filters · 2025-08 table dimension editing, Spotify Ads · 2025-09 iFood · 2025-11 LinkedIn
personal, Eduzz · 2026-01 Google Sheets · 2026-03 Olist, Magazord, Microsoft Ads, **real-time dashboards** ·
2026-04 GoHighLevel · 2026-06 Kwai, Klaviyo · 2026-08 **Chat AI**, **Studio**, direct WhatsApp automations, CallRail,
Keyword.com, Twilio · 2026-09 Meta Ads alerts, daily automations, ChatGPT Ads, Google Local Services, Ahrefs, Control
WhatsApp alerts · 2026-10 Airtable, NAMTAB, save-to-timeline, Meta balance metrics.

## 17. Open questions / not observed
* The exact edit-sidebar controls were taken from the help center and bundle strings; the sidebar itself did not
  open during the read-only session (the first click only focused the widget).
* Dashboard period picker UI was not captured (the two dashboards available had failed generation or rendered in a
  legacy iframe).
* Studio editor, Control dashboard with data, Overview page editor and the billing pages were viewed only as
  entry/empty states or described from bundle strings and the changelog.
* No runtime REA capture (CDP unavailable on this machine); REA coverage is static and partial by budget.
