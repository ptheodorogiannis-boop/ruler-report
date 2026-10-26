# Ruler Reports

A self-hosted marketing reporting platform for agencies, modelled on [Reportei](https://reportei.com): multichannel **reports** (frozen snapshots), **live dashboards**, **automations**, **goals**, a **timeline**, an **AI analyst**, a public **REST API**, **webhooks** and an **MCP server** — plus white-label client links, blended metrics, a Push API, anomaly detection and Slack/Teams/Discord/Telegram delivery that Reportei does not have.

> **How it was designed:** [`docs/EVIDENCE.md`](docs/EVIDENCE.md) is the dossier on how Reportei actually works, and [`docs/REPORTEI-DEEP-DIVE.md`](docs/REPORTEI-DEEP-DIVE.md) goes inside the app (editor, widget model, every module, changelog, REA bundle analysis). [`replica/parity.md`](replica/parity.md) scores this codebase against it: **59.5 / 100** (was 44.4 before the in-report editor landed on 2026-10-21; editor area 16 → 63) — its public API v2 reference, its metric/widget model, and live read-only calls to a real Reportei account — with every claim tagged by source. [`docs/FEATURE_MATRIX.md`](docs/FEATURE_MATRIX.md) maps each of those findings to the code that implements it.

## Quick start

```bash
cd ruler-reports
npm install --legacy-peer-deps
cp .env.example .env          # set APP_SECRET (32+ random chars)
npm run setup                 # prisma generate + db push + demo data
npm run dev                   # http://localhost:3100
```

Sign in with `admin@demo.local` / `demo1234` (printed again by the seed together with a one-time API token).
Or sign up for a fresh workspace on `/signup` — the built-in templates are created for you.

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js 15 app on port 3100 (scheduler starts with the server) |
| `npm run setup` | generate client, create SQLite schema, seed 6 demo clients |
| `npm test` | 77 tests against a throw-away database (`scripts/test.mjs`) |
| `npm run tick` | run due automations + evaluate goals once (for OS cron when `ENABLE_SCHEDULER=0`) |
| `npm run mcp` | start the MCP server (stdio) — see [API & MCP](#api-webhooks-mcp) |
| `docker compose up --build` | container with a persistent volume (see *Status* — untested here) |

## What you get

| Area | Highlights |
|---|---|
| **Projects & integrations** | clients → connected accounts; 67 platforms in the catalog (47 slugs covering every platform on Reportei's public list, 20 extra); encrypted credentials; per-project timezone, currency, number format (`1,234.56` / `1.234,56`) |
| **Metric catalog** | 1,857 widgets: KPI, chart, table and funnel components with `reference_key`, `diff_type`, `formatting_function`, `can_be_aggregated`, tags and per-platform variants (`reach_facebook`, `reach_instagram`…) — the same shape as Reportei's `/metrics` |
| **Reports** | pick a template, integrations, period and comparison (previous period / last year / custom); the numbers are frozen at generation time; analysis cards; CSV export; print-to-PDF; **Studio** slide deck |
| **Report editor** | edit the generated report in place (writers only): blocks per account on a **12-column grid**, drag to move, corner resize, **Add metrics** drawer (searchable catalog + manual metric / calculated metric / analysis card / blended metrics, click or drag to add), per-widget settings (title, description, previous value / variation / absolute difference, positive-is-bad, highlight, hide, chart line/bar/pie, group by day/week/month/quarter, table columns / order / sort / rows, custom period, API query), duplicate, per-widget CSV, add/remove/reorder blocks, **autosave** with Saved indicator, undo/redo, **Save as template**; the client link and the CSV export render the edited layout |
| **Dashboards** | live, rolling presets (last 7/14/30/90 days, this/previous month, quarter, YTD), 5-minute cache, embed with `?embed=1` |
| **Client links** | tokenised public URLs, optional password, white-label logo/colour/name, hide “powered by”, view counter + `report_viewed` webhook |
| **Templates** | sections → widgets editor with a searchable picker; 10 built-ins (default, executive summary, social, paid media, e-commerce, lead gen, SEO, local, 2 dashboards) |
| **Automations** | weekly / biweekly / monthly, timezone-aware (DST-safe), previous-period reports, delivery by email, in-app, WhatsApp webhook, Slack, Teams, Discord, Telegram |
| **Goals** | targets per metric with pacing, projected end value, situation (`high / ideal / average / low / no_data`), met / missed / off-track alerts |
| **Timeline** | milestones per project, shown inside reports and on client links |
| **AI** | analysis writer, “ask your data”, Studio decks — Claude when `ANTHROPIC_API_KEY` is set, otherwise a deterministic rule-based analyst |
| **Overview** | every client's headline KPIs with deltas and anomaly flags (z-score of latest day vs trailing 14) |
| **Blended metrics** | safe formula engine: `({fb_ads:conversion_value}+{gads:conversion_value})/({fb_ads:spend}+{gads:spend})` |
| **Push API** | post rows from Make / Zapier / n8n / call trackers / CRMs; columns are detected and widgets appear automatically |
| **Team** | roles owner / admin / editor / viewer / **client portal**, optional per-project access |

## Integrations

| Status | Platforms |
|---|---|
| **Live connector** (real API calls) | Meta Ads, Google Analytics 4, Search Console, WooCommerce, Google Sheets (CSV export), CSV URL, REST/JSON, Push API (+ Make, n8n, Zapier, Pluga as Push sources) |
| **Synthetic data** until a connector is written | everything else — Facebook/Instagram/YouTube/LinkedIn/TikTok/Pinterest/Threads/X pages, Google Ads, TikTok/LinkedIn/Pinterest/Microsoft/X/Spotify/Kwai/Snapchat/Reddit/Amazon/Apple ads, Business Profile, Matomo, Plausible, HubSpot, Pipedrive, RD Station, Kommo, GoHighLevel, ActiveCampaign, Salesforce, Zoho, Mailchimp, Klaviyo, Omnisend, Brevo, E-goi, Shopify, Nuvemshop, Magazord, Olist, Hotmart, Kiwify, Eduzz, iFood, Cardápio Web, Repediu, Stripe, BigCommerce, PrestaShop, Phonetrack, CallRail, Ruler Attribution, Ruler Click-to-Call |

Writing a connector is two methods — see [`docs/CONNECTORS.md`](docs/CONNECTORS.md).

## API, webhooks, MCP

* **REST API v2** at `/api/v2` — all 26 endpoints of Reportei's public v2 (same paths, bearer token, pagination envelope, rate limits and error shape) plus 36 extensions (automations, goals, blended metrics, ingest, overview, export, AI). Interactive list at `/api-docs`.
* **Webhooks**: `report_viewed`, `report_created`, `dashboard_created`, `automation_executed`, `control_goal_met`, `control_goal_not_met`, `timeline_milestone_added`; HMAC-SHA256 signed; Slack / Teams / Discord formats.
* **MCP server** (`mcp/server.ts`, 21 tools) talks to the REST API with your token:

```json
{ "mcpServers": { "ruler-reports": { "command": "npx", "args": ["tsx", "mcp/server.ts"], "cwd": "<repo>",
  "env": { "RULER_REPORTS_URL": "http://localhost:3100", "RULER_REPORTS_TOKEN": "rr_…" } } } }
```

## Design

[`docs/DESIGN.md`](docs/DESIGN.md) is the design review (HIG principles applied to a web app) and the token system: paper `#F4F5F2`, ink `#101418`, secondary `#525B66` (6.9:1), accent `#1A36E6` (7.7:1, workspace-configurable), signal green/red, two typefaces loaded with `next/font` (Inter with Greek for UI and data, Bricolage Grotesque for titles and KPI values), and the one signature element: the **ruler band**, the report period drawn as a measuring scale on the client cover and under the internal report title. Keyboard focus rings, an 11 px type floor, 4.5:1 text contrast and `prefers-reduced-motion` are part of the floor.

The award pass (same document, "Award pass") adds the concept **the instrument**: the motion verb *slide along a track and click into place* runs through the sidebar (a marker slides in, each in-house icon has one moving part), the primary button (a fill slides in), inline links and the **caliper**, the signature: hover or focus a KPI and a scale under the number replays the measurement from the previous value to the current one. Sign-in has a face: a procedural avatar ([bible-strong avatar lab](https://github.com/smontlouis/bible-strong-avatar-lab), `@bible-strong/avatar-react`, **AGPL-3.0**, so keep the app's source available if you ever distribute it) that watches the pointer, becomes *your* avatar as you type your email (derived from the address with `src/lib/avatar.ts`, no lookup) and closes its eyes while you type your password. Every user gets the same derived avatar in the sidebar and the team list; no uploads. Live dashboards carry a breathing "now" marker on their ruler band; static reports hold still.

The structure pass (same document, "Structure pass") replaced the admin skeleton: no sidebar; one top rail with the **slide-rule navigation** (sections on a ticked track, an ink marker under the current one, a ghost that slides to what you point at), notifications and an account menu; a **scroll ruler** down the left edge that turns every heading of the page into a labelled tick and shows how far down the document you are; the overview as a **board** of client rails with instrument readouts and calipers; the reports and dashboards lists as a type-led **index** whose rows lift their cover beside the pointer; the client link as a **dossier** with a pinned cover column beside the blocks.

## Configuration

See [`.env.example`](.env.example): `APP_SECRET` (sessions + credential encryption), `APP_URL`, `ANTHROPIC_API_KEY`, `SMTP_*`, `GOOGLE_CLIENT_ID/SECRET` and `META_APP_ID/SECRET` (enable the one-click “Continue with Google / Meta” buttons — see [One-click OAuth](#one-click-oauth)), `ENABLE_SCHEDULER`, `CRON_SECRET`. SQLite by default. With a `postgres://` `DATABASE_URL`, `npm run build` generates and applies a Postgres schema by itself: see [Deploying to Vercel](docs/DEPLOY-VERCEL.md) for Vercel with a Neon database.

## One-click OAuth

Set `GOOGLE_CLIENT_ID/SECRET` and/or `META_APP_ID/SECRET` and the connect page of the supported integrations shows **Continue with Google / Meta** above the paste-token form (which always remains as a fallback). Without the env vars the buttons are not rendered.

* Register these redirect URIs in your OAuth apps: `{APP_URL}/api/oauth/google/callback` and `{APP_URL}/api/oauth/meta/callback`.
* Flow: `/api/oauth/{google|meta}/start` → provider consent (only the scopes of the chosen integration) → `/callback` exchanges the code → **account picker** (`/projects/[id]/connect/[slug]/pick`) → one integration per ticked account, credentials encrypted like any other.
* Pickers: GA4 properties (Analytics Admin API), Search Console sites, Business Profile locations, YouTube channels, Meta ad accounts, Facebook Pages, Instagram business accounts. Google stores the refresh token only; Meta stores a ~60-day long-lived token (Pages/Instagram get their own Page token) — Meta tokens are not refreshed, so reconnect when one expires. Re-picking an already-connected account refreshes its credentials instead of duplicating it.
* Security: `state` is a 10-minute signed JWT (company, project, integration, user; `jose` + `APP_SECRET`); the callback only completes for the user who started it. Tokens wait for the picker in an encrypted httpOnly cookie, never in the database, and the posted selection is re-validated against a fresh account listing.
* Details and limits: [`docs/CONNECTORS.md`](docs/CONNECTORS.md#oauth-one-click-connect).

## Architecture

```
 Browser ─ Next.js App Router (server components + server actions)         External clients / MCP
    │                                                                              │
    ├─ /r/[token] /d/[token]  public, white-label, password gate                   │
    └─ app pages ──────────────┬──────────────────────────────────────────────────┘
                               ▼
                    src/lib/api (REST v2 router, rate limits, pagination)
                               ▼
        services: reports · automations · goals · webhooks · messaging · overview · AI
                               ▼
              engine: resolveWidget()  ← catalog (archetypes → widgets) + formula engine
                               ▼
        connectors: daily() + breakdown() [+ totals()]  → Meta · GA4 · GSC · Woo · CSV/Sheets/REST/Push · demo
                               ▼
                 Prisma / SQLite (credentials AES-256-GCM, tokens SHA-256)
```

Key idea (details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)): connectors only return **primitives** (daily sums, breakdown rows). CTR, CPC, ROAS, bounce rate, win rate… are derived once in the engine, so a real connector and the demo connector behave identically and ratios are always computed from aggregated totals, never averaged.

## Status — what is and isn't verified

* **Verified:** `tsc --noEmit` clean; `next build` succeeds; 66 automated tests pass (engine maths, catalog invariants, formula engine, CSV/number/date parsing, the CSV/REST/Push connectors against local HTTP servers, the WooCommerce connector against a mock store, the full REST API incl. tenant isolation and rate limiting, webhook signatures, automations incl. DST schedule maths, goal alerts, the OAuth start/callback/picker/finalize flows against mock Google and Meta servers, the report layout: grid maths, seeding, re-bucketing, table settings, compose, validation, save/prune/integration sync, save-as-template round trip, live dashboards); the UI was exercised in a browser (login, overview, project, report builder → report, **report editor: drag, resize, add a metric, settings, autosave, client link shows the edited layout**, public client link, template editor) and every page returns 200.
* **Written against public docs but not run against live accounts:** the Meta Ads, GA4 and Search Console connectors (they need real credentials) and the Google/Meta OAuth flows (token exchange and account listing are tested against local mock servers only — never with a real Google or Meta app).
* **Not verified:** Docker image, SMTP delivery, Anthropic calls, Telegram/Teams/Discord/WhatsApp webhooks (Slack-shaped delivery is tested against a local receiver).
* **Known gaps vs Reportei:** no campaign containers (per-campaign widgets), no table keyword filters / dimension change, custom blocks have a title but no colour or icon, analysis cards take sanitised HTML without image upload, blocks reorder with arrows (widgets drag, blocks do not); per-platform metric depth is smaller (Meta Ads 64 widgets vs Reportei's 348, GA4 34 vs 96); one-click OAuth covers Google (GA4, Search Console, Business Profile, YouTube) and Meta (ad accounts, Pages, Instagram) only — every other platform still takes pasted tokens, Meta long-lived tokens are not auto-refreshed, Google Ads and Threads have no picker, and Business Profile / YouTube / Pages / Instagram connect fine but still show synthetic data until their connectors exist; PDF is browser print; Studio decks are an in-app viewer, not PPTX export; no Flux (post scheduling) or Sync (push to Google Sheets) products — use CSV export / `IMPORTDATA`; custom domains need your reverse proxy.
