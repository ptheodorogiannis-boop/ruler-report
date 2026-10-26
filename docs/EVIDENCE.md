# How Reportei works — evidence dossier

> **Part 2 (2026-10-21):** the in-app deep-dive — editor, drag-and-drop grid, widget model, modules, changelog,
> REA static analysis of the shipped bundle — is in [`REPORTEI-DEEP-DIVE.md`](REPORTEI-DEEP-DIVE.md). The parity
> comparison with this codebase is in [`../replica/parity.md`](../replica/parity.md) (44.4 / 100).

Collected 2026-10-19. "report.ei" is read as **Reportei** (reportei.com), the Brazilian marketing
reporting/dashboard platform. Every claim below is tagged with where it came from.

Sources
- **[SITE]** reportei.com home page (fetched)
- **[API]** developers.reportei.com — Reportei API v2 reference (fetched; `app.reportei.com/docs/api` 302-redirects there)
- **[MCP]** the Reportei MCP server connected to this Claude session, read-only calls against the Ruler Digital Agency account
- **[3P]** third-party listings (MindCloud, Pipedream, Capterra, SaaSworthy, Shopify/HubSpot app stores)
- **[HELP]** reportei.com help-center search snippets

Client figures from the live account are deliberately **not** copied here; only structure and counts.

---

## 1. What the product is

| Fact | Evidence |
|---|---|
| Builds multichannel marketing/sales **reports** and **dashboards**, aimed at agencies | [SITE] |
| Claims 10,000+ customers, 70 countries, site in PT / EN / ES / FR / PT-PT | [SITE] |
| 3-day free trial, no free tier | [SITE], [3P] Capterra |
| Tiers Starter / Pro / Premium, differ by project count, integrations, dashboards-per-project, team seats | [HELP], [3P] |
| Starter ≈ 5 projects, unlimited reports, 1 automation / project, 3 seats; Pro = 2× dashboards, 8 seats | [HELP] |
| Account type `agency`, specialty field, `total_clients` | [MCP] `get_company_settings` → `{"type":"agency","total_clients":28,...}` |

## 2. Domain model (reconstructed)

```
Company (agency)  ──< Project (= client)  ──< Integration (= connected account on one network)
   │                     │                         │ slug e.g. facebook_ads, google_analytics_4
   │                     ├──< Report     (STATIC snapshot, has comparison period, share URL)
   │                     ├──< Dashboard  (LIVE view, same shape as report)
   │                     ├──< Automation (schedule → generates + delivers a report)
   │                     ├──< Goal / "Controle" (tracked metric + target + alert)
   │                     └──< TimelineEvent (milestone, optionally linked to report)
   ├──< Template (kind = report | dashboard; sections → widgets)
   └──< Webhook  (event_type, source, optional project scope)
```

Evidence for each edge
- **Project fields** `id, name, logo, timezone, locale, date_format, decimal_separator_format` — [API] Project model, [MCP] `list_projects` (28 projects; per-project `timezone`, `decimal_separator_format: comma_dot|dot_comma`).
- **Integration fields** `id, source_id, name, slug, status(active|inactive), project_id` — [API], [MCP] `list_integrations` (184 rows). `source_id` is the *network's* id: `act_…` for Meta ads, bare number for GA4, a URL for Search Console, **base64 of the site URL** for WooCommerce, `spreadsheetId|||gid|||tabName` for Google Sheets, `accounts/…/locations/…` for Business Profile.
- A project holds several accounts with the same display name → they must stay separate integrations — [MCP] tool description + data.
- **Report vs dashboard**: report = static snapshot captured at creation; dashboard = live, refreshes on view — [MCP] `list_reports` / `list_dashboards` descriptions. Both share fields `title, subtitle, start_date, end_date, comparison_start_date, comparison_end_date, template_id, client_id, views, internal_url, external_url` — [API].
- `external_url` = `https://app.reportei.com/report/<32-char token>` or `/dashboard/<token>`; shareable with clients **without an account** — [MCP] `get_report`.
- Scale on the inspected account: 28 projects, 184 integrations, **510 reports**, 41 dashboards, 27 templates — [MCP].
- Templates have `kind` (report|dashboard), `is_default`, `used_count`, and detail view `sections[] → widgets[]` — [API], [MCP].

## 3. The widget / metric catalog (the core engine)

Each integration **type** (slug) owns a catalog of widgets. Discovery is `GET /metrics?integration_slug=…`; data is fetched with `POST /metrics/get-data`.

Evidence — [MCP] `list_metrics` returned:
- `facebook_ads` → **348** metrics, `google_analytics_4` → **96** metrics.
- A widget definition:

```jsonc
{
  "reference_key": "fb_ads:cpc",            // "<platform>:<metric>[_<variant>]"
  "component": "number_v1",                 // number_v1 | chart_v1 | datatable_v1 | container_v1 (+ funnel in reports)
  "metrics": ["cpc"],                       // underlying provider metric(s)
  "dimensions": [ { "field":"publisher_platform","operator":"IN","value":["facebook"] } ],  // pre-filtered variants
  "type": "reach",                          // semantic type
  "calculated": true,                       // derived metric (e.g. views/session)
  "references": {
    "title": "Total Average CPC",
    "description": "…",
    "diff_type": "positive_bad",            // is an increase good or bad? colours the delta
    "formatting_function": "currency",
    "can_be_aggregated": false,             // ratios can't be summed across accounts
    "tags": { "cost":"paid", "calculation":"Passed through the network|Estimated by the network|calculated",
              "history":"retroactive", "value":"partial value" }
  }
}
```

- **Variant explosion**: one base metric (`reach`) is stamped out per publisher platform (`reach_facebook`, `reach_instagram`, `reach_messenger`, `reach_audience_network`) by attaching a `dimensions` filter — [MCP]. This is why the catalog is 348 entries, not ~40.
- **Metric data response**: object keyed by metric id → `{ values, comparison:{ values, difference, absoluteDifference } }` — [API].
- Period-over-period comparison is first-class on every request (`comparison_start/end`) — [API].
- Errors come back inline per metric: `no_data_in_period`, `expired_token`, `invalid_metrics_combination` — [MCP] `get_metrics_data`.

**Rendered report payload** (what a stored report looks like) — [MCP] `get_report_data`, structure only:

```
report{ id,title,type,start_date,end_date,comparison_*, data_synced_at }
sources[]{ source_id, platform, account_name, currency, data_status: ok|error|no_data, widgets[] }
widget types:
  number : { label, metric, value, comparison:{ value, change_pct } }
  chart  : { label, labels[], series[][] }           // time series, or categorical (age, gender, hour, device)
  table  : { label, columns[], rows[][], total_rows } // positional rows; cells may be {value,title}; ads/adsets/campaigns tables
  funnel : { label, steps[]{label,metric,value,comparison} }  // spend → reach → impressions → clicks → view content → add to cart → checkout
```
Observed for Meta Ads: 6 KPI numbers, 3 platform-split blocks, campaign / ad-set / ad tables (7 / 12 / 25 rows),
funnel, daily spend chart, hour-of-day chart, age / gender / device breakdown charts.

Key design facts
1. **Reports freeze data** (`data_synced_at`); dashboards re-query. → two storage strategies for the same template engine.
2. Every report is bound to a **list of integration ids** (`integration_ids` on create) — [API].
3. Custom blocks (`is_custom_block`) = consolidated summary cards that are not a network — [MCP].
4. **Analysis cards**: free-form HTML card on a report/dashboard (`get/update/add/remove_report_analysis`) — [MCP] tool names. This is where the written commentary / AI insight lives.

## 4. Public API v2 — exact surface

Base `https://app.reportei.com/api/v2`, `Authorization: Bearer <token>` — [API].

| Resource | Endpoints |
|---|---|
| Company | `GET /companies/settings` (includes `rate_limits`) |
| Projects | `GET /projects`, `GET /projects/{id}` |
| Integrations | `GET /integrations`, `GET /integrations/{id}` |
| Metrics | `GET /metrics`, `POST /metrics/get-data` |
| Templates | `GET /templates`, `GET /templates/{id}` |
| Reports | `GET /reports`, `GET /reports/{id}`, `POST /reports` |
| Dashboards | `GET /dashboards`, `GET /dashboards/{id}`, `POST /dashboards` |
| Webhooks | `GET /webhooks`, `GET /webhooks/events`, `GET/PUT/DELETE /webhooks/{id}`, `POST /webhooks` |
| Timeline | `GET/POST /timeline-events`, `GET/PUT/DELETE /timeline-events/{id}` |

- `POST /reports` body: `title, subtitle, start, end, template_id, integration_ids, project_id, [comparison_start, comparison_end]`. Request uses `start/end`, response uses `start_date/end_date`.
- **Pagination envelope**: `{ data[], links{first,last,prev,next}, meta{current_page,from,last_page,per_page,to,total} }`, `per_page ≤ 100`, `sortBy`, `descending`.
- **Rate limits**: global bucket per token (sample 150/min, 15/s); `POST /reports` & `/dashboards` 30 per 24h or 2 per active project (trial capped at 30); `POST /metrics/get-data` 100 per 60s. Headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After` on 429.
- **Errors**: 401/403/404/422/429/500, body `{message, errors{field:[..]}}`.
- The docs contradict themselves in 5 places (default per_page 15 vs 100, `descending` default, webhook `status` type, metric `type` shape, `start` vs `start_date`) — our API normalises these.
- Third-party proof the API is real and used: Pipedream proxies `app.reportei.com/api/v1/me`; MindCloud wraps **26 actions** (4 POST / 18 GET / 2 PUT / 2 DELETE) — [3P]. The API is v2 now; v1 existed.

### Webhooks
- Event types: `report_viewed, report_created, dashboard_created, automation_executed, control_goal_met, control_goal_not_met, timeline_milestone_added` — [API], [MCP].
- Sources: `custom, make, zapier, n8n` — [API].
- A webhook with no `project_id` is company-wide — [MCP].

## 5. Automations

Evidence — [MCP] `list_automations` / `get_automation` / `create_automation` descriptions, [SITE]:
- Scheduled job that **generates a report and delivers it** — frequency `weekly | biweekly | monthly`.
- Channels (any combination): `email` (recipients), `in-app`, `whatsapp` (a **webhook URL** + `whatsapp_type`).
- Has: sources (integrations), template, period, comparison period, `next run`, `last run`, enabled flag.
- Starter plan: 1 automation per project — [HELP].

## 6. "Reportei Controle" — goals & alerts

[MCP] `list_goals` / `get_goal_progress`:
- A goal = a metric (`reference_key`) from one integration + frequency + target.
- Returns `current value, target, progress %, estimated end value, days remaining, recent history`, and **situation** ∈ `high | ideal | average | low | no_data`.
- Fires `control_goal_met` / `control_goal_not_met` webhooks — [API]. Site promises mid-month alerts when results drift — [SITE].

## 7. Timeline

Milestones per project (`title`, HTML `content`, `date`, optional `report_id`), shareable by link, can be written via API (e.g. log a campaign launch automatically) — [API], [SITE], [HELP].

## 8. AI layer

- **Reportei AI** — assistant producing analysis/insights from campaign data; Traffic-Management assistant — [SITE], [HELP].
- **Reportei Studio** — text prompt → one-pager or slide deck with charts, edited via chat, shareable — [SITE].
- **MCP** — the same data exposed to AI clients. The tools visible in this session (≈60) show the real feature map: `get_performance_summary`, `get_campaign_summary`, `get_channel_breakdown`, `get_audience_insights`, `get_top_content`, `compare_periods`, `run_company_analysis` (cross-project ranking/total/breakdown, async, preset `ads_spend`), `get_opportunity_score` + `get_recommendations` (Meta Ads, Reportei's own score) — [MCP].
- Add-on pricing "+AI" tier ≈ +$12/mo — [3P].

## 9. Integration catalog

[SITE] lists 50+: Instagram, Facebook, Meta Ads, TikTok, YouTube, LinkedIn, Pinterest, Threads, X Ads, Spotify Ads, Kwai Ads, Microsoft Ads · GA4, Google Ads, Search Console, Google Business Profile · RD Station, HubSpot, ActiveCampaign, Mailchimp, E-goi, GreatPages, Pipedrive, Kommo, GoHighLevel, Phonetrack · Shopify, Nuvemshop, WooCommerce, Magazord, Olist, Hotmart, Kiwify, Eduzz, iFood, Cardápio Web, Repediu · Google Sheets, Make, n8n, Pluga, Zapier.
Slugs actually in use on the account — [MCP]: `facebook, facebook_ads, instagram_business, google_adwords, google_analytics_4, search_console, google_my_business, linkedin, linkedin_ads, youtube, woo_commerce, google_sheets`.
Note `google_sheets` is used as a **generic custom-data source** (one integration per sheet tab) — agencies feed their own lead sheets into reports.

## 10. Other modules

| Module | Evidence |
|---|---|
| **Overview** — one screen of KPIs across all projects | [SITE] |
| **Sharing** — link, PDF, WhatsApp | [SITE] |
| **Flux** — post scheduling / approval calendar (separate product) | [SITE] |
| **Sync** — pipe 40+ channels into Google Sheets (separate product) | [SITE] |
| **Academy** — free courses | [SITE] |
| White-label — **not confirmed** by any source; Spendbase mentions it for enterprise but unverified | [3P] |

## 11. Inferred architecture (not published — marked as inference)

- Laravel/PHP + SPA front-end (inference from the `Validation 422 {errors:{field:[]}}` envelope and `links/meta` pagination, which is Laravel's resource-collection format).
- Provider sync workers writing retroactive history per integration (`history: retroactive` tag) and a nightly refresh (`updated_at` on integrations changes every ~day, e.g. 03:05–03:16 for Meta accounts).
- Report generation = resolve template → fan out `get-data` per widget → snapshot JSON (`data_synced_at`).

## 12. Gaps in the evidence
- Exact pricing page returned 404; prices only from third parties and they conflict.
- White-label / custom domain: unconfirmed.
- Studio and AI internals: marketing copy only.
- Template JSON beyond `sections[].widgets[]` not seen (no template-detail call exposed in this MCP).
