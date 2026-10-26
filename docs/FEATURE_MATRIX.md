# Feature matrix — Reportei finding → implementation

Evidence references (§) point into [`EVIDENCE.md`](EVIDENCE.md). “Parity” = same behaviour/shape; “Equivalent” = same job, different mechanics; “Extension” = not in Reportei.

## Core model

| Reportei (evidence) | Here | Where |
|---|---|---|
| Company → Project (client) → Integration (§2) | Parity | `prisma/schema.prisma`: `Company`, `Project`, `Integration` |
| Project fields `timezone, locale, date_format, decimal_separator_format` (§2) | Parity (+`currency`) | `Project`; number format used by `src/lib/util/format.ts` |
| Same-named accounts stay separate integrations (§2) | Parity | integrations are rows keyed by id, never merged |
| `source_id` is the network's id (act_…, GA4 id, base64 URL, `sheet|||gid|||tab`) (§2) | Parity | `Integration.sourceId`; Woo accepts base64 or plain URL (`connectors/woo.ts`); Sheets split (`connectors/custom.ts`) |
| Integration `status: active/inactive` (§2) | Parity | toggle in project → Integrations |
| Report = static snapshot, Dashboard = live (§2) | Parity | `Report.kind`; `snapshotReport()` vs `liveDashboardData()` in `engine/report.ts` |
| Share URL token, no account needed (§2) | Parity (+password, rotate, disable) | `/r/[token]`, `/d/[token]`, `actions/app.ts → updateShareAction` |
| Template `kind` report/dashboard, `is_default`, `used_count`, `sections[].widgets[]` (§2) | Parity | `Template`, `lib/templates/defaults.ts`, template editor |

## Widget / metric engine (§3)

| Reportei | Here | Where |
|---|---|---|
| `reference_key` = `<prefix>:<metric>` | Parity | `catalog/build.ts` |
| Components `number_v1 / chart_v1 / datatable_v1 / container_v1` + funnel in reports | Parity | `engine/types.ts` `Component`, `funnel_v1` |
| `diff_type`, `formatting_function`, `can_be_aggregated`, `tags{cost,calculation,history,value}` | Parity | `WidgetDefinition.references` |
| Platform variants via `dimensions` filter (`reach_facebook` …) | Parity | `catalog/build.ts` variants, applied by connectors |
| Number / chart / table / funnel value shapes, comparison `{value, change_pct}` | Parity | `engine/types.ts` value types |
| Typed inline errors (`no_data_in_period`, `expired_token`, `invalid_metrics_combination`) | Parity (+`provider_error`) | `engine/resolve.ts → errorFrom` |
| `data_status ok/error/no_data` per source | Parity | `engine/report.ts` source statuses, shown as a banner |
| Metric catalog size: Meta Ads 348, GA4 96 | **Gap** — 64 and 34 | archetypes in `catalog/archetypes.ts` |
| Custom blocks / summary cards | Equivalent | blended metrics (`engine/formula.ts`) + analysis cards |
| Reach is not additive | Parity | `Connector.totals()` used for `reach`/`users` when available |

## Report editor (REPORTEI-DEEP-DIVE §3)

| Reportei | Here | Where |
|---|---|---|
| Blocks (one per connected account + custom blocks), widgets with `layout {x,y,w,h}` on a 12-column grid (§3.1, §3.4) | Parity | `Report.layout`, `src/lib/layout/types.ts`, `grid.ts`, `components/grid.tsx` |
| Default sizes KPI 3×2, chart 6×4, table 12×6 (§3.1) | Parity (tables/funnels sized to their rows) | `DEFAULT_SIZE`, `sizeOfValue()` in `layout/compose.ts` |
| Drag handle to move, corner handle to resize (§3.1) | Parity | `components/grid.tsx` (pointer events, push-down + compaction) |
| Left control bar: Predefined metrics (searchable) / Customizable (Analysis, Calculated, Manual) → drag into the block (§3.1) | Parity (Chart/Funnel customizable widgets missing) | `AddMetricsPanel` in `report-editor.tsx`, `GET /api/v2/metrics` |
| Autosave "✓ Saved", undo/redo (§3.1) | Parity | `saveLayoutAction`, history of 20 layouts in `report-editor.tsx` |
| Hover toolbar: drag · highlight · duplicate · edit · hide · remove · export (§3.2) | Parity (save-to-timeline missing) | `.rtoolbar` + settings drawer |
| `number_v1` custom: `showComparisonValue`, `showAbsoluteDifference`, `isPositiveBad`, `custom_period`, title/description, `highlight` (§3.3) | Parity | `WidgetCustom`, applied in `composeReport()` / `Kpi` |
| `chart_v1` custom: `chart_type`, `group_by` day/week/month/quarter (§3.3) | Parity; two-axis, annotations, beginAtZero missing | `rebucket()`, `ChartCard`, `charts.tsx` |
| `datatable_v1` custom: `hidden_columns`, `originalOrder`, `sort[]`, `max_number_of_rows` (§3.3) | Parity; filters, dimension change, custom columns missing | `applyTableCustom()` |
| `calculated_v1` formula with + − × ÷ and parentheses (§3.3) | Parity (no `magic:` groups) | `calculated` widget → `engine/formula.ts` |
| `empty_v1` manual metric, `wysiwyg_v1` analysis card (§3.3) | Parity (sanitised HTML, no images) | `manual` / `analysis` widgets |
| `container_v1` campaign containers (§3.3) | **Gap** | — |
| Custom block with title, colour, icon, header (§3.4) | Partial (title; mixes any account's metrics) | `LayoutBlock.integrationId = 0` |
| Save as template (§3.6) | Parity (+ keeps positions and settings) | `saveAsTemplate()` in `layout/service.ts`, `TemplateWidgetRef.custom/layout` |
| Generate widget query (§3.2) | Parity | settings drawer → `POST /metrics/get-data` body |

## API v2 (§4)

| Reportei | Here |
|---|---|
| Base `/api/v2`, bearer token | `src/app/api/v2/[...path]/route.ts` |
| 26 endpoints (company, projects, integrations, metrics, templates, reports, dashboards, webhooks, timeline) | all present; `tests/api.test.ts` asserts the list |
| `{data, links, meta}` pagination, `per_page ≤ 100`, `sortBy`, `descending` | `lib/api/http.ts`; docs inconsistencies normalised (default per_page 15, descending true, `start`/`end` in requests and `start_date`/`end_date` in responses) |
| Rate limits 150/min · 15/s · metrics 100/60 s · reports/dashboards 30/24 h or 2 per project | `lib/api/http.ts`, `routes.ts`; `X-RateLimit-*` + `Retry-After` |
| Errors 401/403/404/422/429/500 with `message` and `errors{field}` | `ApiError`, zod → 422 |
| `POST /metrics/get-data` returns values + `comparison{values,difference,absoluteDifference}` | Parity |

## Webhooks, automations, goals, timeline (§4–§7)

| Reportei | Here |
|---|---|
| 7 event types, company-wide or project-scoped, sources custom/make/zapier/n8n | Parity (+slack, teams, discord formats, HMAC signature, delivery log) — `services/webhooks.ts` |
| Automations weekly/biweekly/monthly; email · in-app · WhatsApp-webhook | Parity (+Slack, Teams, Discord, Telegram, AI analysis card) — `services/automations.ts`, `services/messaging.ts` |
| Controle goals: frequency, target, progress, estimated end value, days remaining, situation `high/ideal/average/low/no_data` | Parity — `services/goals.ts` |
| `control_goal_met` / `control_goal_not_met` events | Parity; plus one drift alert per period |
| Timeline events with HTML content, optional report link, API writable | Parity |

## AI & MCP (§8)

| Reportei | Here |
|---|---|
| Reportei AI (analysis/insights) | `ai/insights.ts → analyse()` — Claude or rule-based fallback |
| Reportei Studio (prompt → slides) | `studioDeck()` + `/reports/[id]/studio` (viewer; no PPTX export) |
| MCP exposing data to assistants | `mcp/server.ts` (21 tools) over this API |
| `get_performance_summary`, `compare_periods`, `run_company_analysis`, opportunity score | Equivalent: overview, report data, `get_metrics_data` with comparison; opportunity score **not built** |

## Integrations (§9) and other modules (§10)

| Reportei | Here |
|---|---|
| 42 named platforms on its public list (docs/EVIDENCE.md §9) | every one has a slug — 47 slugs because pages/ads and CRM/marketing products are split (`catalog/integrations.ts`); 8 live connectors, the rest synthetic |
| Google Sheets as custom data source | Parity — auto-detected columns, EU/US numbers and dates |
| Overview across projects | Parity (+anomalies) — `/overview` |
| Sharing: link, PDF, WhatsApp | link + print-to-PDF + WhatsApp via automation webhook |
| Flux (post scheduling), Sync (to Sheets), Academy | not built |
| One-click account connection with account picker | Equivalent for Google (GA4, Search Console, Business Profile, YouTube) and Meta (ad accounts, Pages, Instagram) — `lib/oauth/*`, `api/oauth/*`, `connect/[slug]/pick`; buttons only when `GOOGLE_CLIENT_ID/SECRET` / `META_APP_ID/SECRET` are set, paste-token forms remain. Tested against mock token/list endpoints only; **not verified live**; other platforms still paste tokens |

## Extensions beyond Reportei

White-label branding · client-portal role and per-project access · password-protected links · embed mode · blended-metric formula engine · Push API · REST/CSV connectors · 20 extra integrations (Snapchat, Reddit, Amazon, Apple Ads, Matomo, Plausible, Klaviyo, Omnisend, Brevo, Salesforce, Zoho, Stripe, BigCommerce, PrestaShop, CallRail, Ruler Attribution, Ruler Click-to-Call, CSV, REST, Push) · anomaly detection · Slack/Teams/Discord/Telegram delivery · CSV export · outbox viewer · 36 additional REST endpoints.
