# Architecture

## Layers

| Layer | Path | Responsibility |
|---|---|---|
| UI | `src/app/**`, `src/components/**` | Next.js 15 App Router. Server components read through services; mutations are server actions (`src/app/actions/*`). Charts are the only heavy client code (`components/charts.tsx`). |
| Public API | `src/app/api/v2/[...path]/route.ts` → `src/lib/api/routes.ts` | One catch-all route + a tiny router. Auth (bearer token, else session), rate limits, pagination, zod validation, error envelope. |
| Services | `src/lib/services/*` | `reports` (create/snapshot), `automations` (schedule, run, deliver), `goals`, `webhooks`, `messaging`, `integrations`, `overview`, `anomaly`, `export`. |
| Engine | `src/lib/engine/*` | `resolve.ts` (widget → value), `report.ts` (template → report data, `ensureWidgetValues()` for widgets the editor adds), `formula.ts` (blended metrics). |
| Layout | `src/lib/layout/*` | `types.ts` (block → widgets `{x,y,w,h,custom}`), `grid.ts` (12-column maths: compact, push-down, resize, flow), `compose.ts` (pure: seed a layout from template sections, apply per-widget settings to the stored values → the rendered report; shared with the client), `service.ts` (seed/persist/save, `reportView()` used by every renderer, save-as-template). |
| Catalog | `src/lib/catalog/*` | `integrations.ts` (67 platforms), `archetypes.ts` (10 metric models), `build.ts` (archetype → widget definitions, variants, custom-data catalogs). |
| Connectors | `src/lib/connectors/*` | `Connector { daily, breakdown, totals?, validate?, unsupported? }`. |
| AI | `src/lib/ai/insights.ts` | analysis, Q&A, Studio decks; Claude or rule-based. |
| Data | `prisma/schema.prisma` | SQLite by default, Postgres-ready. |

## The engine in one page

1. A **template** is `sections[] → widgets[] → {slug, key}`. A widget applies to *every* connected account of that platform in the report (so one template serves every client).
2. `generateReportData()` expands that into one block per (widget × integration), after asking `FetchSession` to batch the primitives each integration will need — one `daily()` call per (integration, period, filter) instead of one per widget.
3. `resolveWidget()` turns a catalog entry into a value:
   * **Primitives** (spend, impressions, clicks, sessions, orders…) come from the connector.
   * **Virtual metrics** (ctr, cpc, cpm, roas, bounce rate, win rate…) are declared on the archetype as `num/den*mult` and computed from *aggregated* primitives. Averaging daily ratios is never done.
   * Calc kinds: `sum`, `avg`, `latest` (stock metrics such as followers), `delta` (net growth), `ratio`, `series` (time series, weekly buckets over 120 days), `breakdown` (tables), `chart_breakdown` (categorical charts), `funnel`.
   * **Non-additive** primitives (`reach`, `users`) ask the connector for a period total (`totals()`) instead of summing days.
   * Connectors can declare `unsupported` primitives; those widgets render an explicit “not provided” card rather than zeros.
   * Every failure becomes a typed `ErrorValue`; one broken integration never breaks a report (the source gets `data_status: "error"` and a banner).
4. **Reports** store the rendered JSON (`Report.data`, `dataSyncedAt`). **Dashboards** keep only the template + rolling preset and re-resolve on view behind a 5-minute cache.
5. **Report editor** (`Report.layout`): a report is a list of blocks (one per section × account, plus custom blocks), each with widgets `{id, slug, key, component, integrationId, x, y, w, h, custom}` on a 12-column grid. `Report.data` stays the value store: `sections[].blocks` hold the template-generated values and `data.widgets` holds everything the editor needed later, keyed by `"integrationId:key[@start..end]"` — so moving, resizing, renaming or re-bucketing never re-fetches; only a new metric, a custom period or a calculated metric's missing reference triggers `ensureWidgetValues()`. `composeReport()` (pure, also run in the browser) turns store + layout + settings into the `ReportData` every renderer consumes: internal page, `/r/[token]`, `/d/[token]`, CSV, API `/data`, AI. Autosave sends the whole layout through a server action (validated with zod, compacted, integration ids synced); the client keeps the last 20 layouts for undo. "Save as template" writes blocks → sections with `custom` + `layout` on each widget ref, which `seedLayout()` re-applies when a report is generated from that template. Dashboards cache by the fingerprint of the value keys the layout needs, so layout-only edits reuse cached numbers.
5. **Blended metrics** (`CustomMetric`) are evaluated after the normal widgets by summing each referenced `{prefix:key}` across all connected accounts with that prefix, then running the formula through a recursive-descent parser (no `eval`).

## Catalog generation

`catalog/archetypes.ts` defines ten metric models (ads, social, web, seo, ecom, crm, email, local, video, calls). Each lists:

* `prims` — the primitives and, for the demo connector, how they relate (`of: 'impressions', rate: 0.021` keeps funnels coherent);
* `virtual` — derived ratios;
* `dims` / `namedDims` — breakdown dimensions;
* `widgets()` — KPI, chart, table, funnel definitions;
* `variants` — platform split (`reach_facebook` …) via a `dimensions` filter, as in Reportei.

`INTEGRATIONS` maps each slug to an archetype and a reference-key prefix (`fb_ads`, `ga4`, `gads` …). Custom-data platforms (Sheets, CSV, REST, Push) build their catalog from detected columns stored in `Integration.config.columns`.

## Scheduling

`src/instrumentation.ts` starts an in-process scheduler (`lib/scheduler.ts`): automations every minute, goals hourly. Automations store `nextRunAt`, computed timezone-aware (`zonedToUtc`, DST-safe). A failing automation records the error and is moved to its next slot, so it cannot retry every minute. For multi-instance deployments set `ENABLE_SCHEDULER=0` and call `GET /api/cron/tick` (bearer `CRON_SECRET`) from a single cron.

## Security notes

* Integration credentials: AES-256-GCM with a key derived from `APP_SECRET` (`lib/crypto.ts`); never serialised by the API.
* API tokens: shown once, stored as SHA-256.
* Sessions: HS256 JWT in an httpOnly, SameSite=Lax cookie (14 days).
* Multi-tenancy: every query is scoped by `companyId`; restricted users additionally by project. A regression test covers a bug found during development where a later spread in a `where` clause overwrote the project restriction.
* Public pages: share tokens are 24 random bytes; optional password (hash + unlock cookie); analysis HTML passes an allow-list sanitiser (`util/sanitize.ts`); email previews render in a sandboxed iframe.
* Webhooks: HMAC-SHA256 over the raw body with a per-hook secret.
* Not done: CSRF tokens beyond SameSite/server-action defaults, login rate limiting, audit log, SSO.
