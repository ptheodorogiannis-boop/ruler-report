# Parity report — Ruler Reports vs Reportei (2026-10-21, re-scored after the in-report editor)

## Connect flow re-test (2026-11-02)

What changed: one sign-in per provider (Google covers Google Ads, Analytics, Search Console, YouTube and Business
Profile; Meta covers Meta Ads, Facebook Pages and Instagram), a Reportei-style **accounts found** page, a live Google
Ads connector, honest live / sample labels, and the unslop + Hallmark polish of the connect screens. Setup for admins:
[`../docs/CONNECT-SETUP.md`](../docs/CONNECT-SETUP.md).

| | Before | After |
|---|---|---|
| Feature score (`parity.py`) | 59.5 (must-haves 23 of 33) | **61.6** (must-haves **24 of 34**, 125 rows counted) |
| Integrations area | 50.0 | **82.4** |
| Layout, accounts-found dialog vs Reportei's "Meta accounts found" (searched, one account per network, nothing ticked) | not run | **23.4** as captured, **35.7** with Reportei's modal cropped to its content box: *different* |
| Overall, features and layout averaged by `parity.py --visual` | 59.5 | 55.2 |

**Where the rise comes from.** No existing must-have changed status: one-click OAuth and the breadth of live connectors
are still *partial* (Google and Meta only; 17 live connectors of 67). The score moves because of rows added today
(one sign-in lists every network, a *must*, seen in Reportei for Meta and not checked for Google; account search, a
*should*) and two Integrations rows re-checked against the v3 code (expiry alerts with Reconnect, campaign selection).
Today's extras (declined permissions per network, isolated network errors, honest live / sample labels) are not
scored.

**Why the layout score is low and why that is fine here.** Reportei shows a 626 px modal over the page; ours is a
720 px page column with a sticky footer, so every row lands at a different height once both are scaled to the same
width. The structure is the same element for element: title, one sentence, search, one group per network (mark,
name, count), account cards in two columns, a footer with the selection count and one primary button. The skill's
rule applies: parity means doing the same job, not looking the same. Screens: `screens/reportei/`,
`clone-screens/meta-accounts-found.png` and `meta-accounts-selected.png`; diff images in `diffs/`.

**The matrix is older than v3.** Rows outside Integrations still describe the app before v3 (campaign containers,
server PDF, per-block AI, duplicate / convert, daily schedules, the client period picker and the Greek UI were built
in v3 and are still marked missing). Only the Integrations rows were re-checked today, so the overall feature score
understates the app. Re-checking every area is a separate pass.

### Behaviour differences, connect flow

| Flow | Reportei | Ruler Reports | Fix or keep |
|---|---|---|---|
| Connect Meta Ads, a Page and an Instagram account | Integrate Meta, Facebook login, "Meta accounts found", tick, Integrate | Connect with Meta, consent, accounts found, tick, Add 3 accounts | keep: same steps |
| Connect Google Ads and GA4 | not observed whether one Google login lists every network | one Google consent lists Google Ads (incl. accounts under a manager), GA4, Search Console, YouTube, Business Profile | keep |
| What to copy by hand | nothing | nothing (property IDs, customer IDs and tokens only behind "Connect with a token or ID instead") | keep |
| Unticking a permission on the consent screen | not observed | that network says "not allowed" with Sign in again; the rest list normally | keep |
| One network's API fails | not observed | the error shows inside that network's group only | keep |
| Per-project account limit | "You can integrate 2 more accounts in this project" | none (self-hosted, no plans) | keep |
| Telling same-named Pages apart | numeric ID under each Page | numeric ID under each Page and Instagram account | done |
| After adding | back to the integrations list | banner names the added accounts, which are listed first and marked "Just added" | keep |
| Setup the agency does once | none (Reportei owns verified apps) | a Google OAuth client, a Google Ads developer token, a Meta app (Settings, System shows what is missing) | inherent to self-hosting |

Source matrix: [`features.csv`](features.csv) (123 scored rows, 2 skipped, 9 extras). Evidence for every Reportei
row: [`../docs/REPORTEI-DEEP-DIVE.md`](../docs/REPORTEI-DEEP-DIVE.md) and [`../docs/EVIDENCE.md`](../docs/EVIDENCE.md).
Scored with `python replica/parity.py replica/features.csv` (must 3 · should 2 · could 1; partial = ½).

## Parity: 59.5 / 100  (was 44.4 before the in-report editor)

| | |
|---|---|
| Feature score | **59.5** (123 counted, must-haves **23 of 33** done) |
| Layout score | **not run** — no same-state screenshots exist (Reportei's editor was captured at 1568×772 inside the user's Chrome without saving to disk, and the clone's pages deliberately use a different layout). Overall = feature score. |
| Verdict | **Not shippable as a Reportei replacement yet.** 10 must-have features are missing or partial (campaign containers, per-block AI, live connector breadth, OAuth breadth, rich-text analysis with images, themed custom blocks, added table columns, expert templates, server PDF, cover editor). It *is* usable today as a reporting tool: generate, **edit the report in place**, share, automate, track goals. |

## By area, weakest first

| Area | Score | Features | Was |
|---|---|---|---|
| Overview | 42.9 | 4 | 42.9 |
| Theming & cover | 50.0 | 6 | 50.0 |
| AI | 50.0 | 9 | 50.0 |
| Integrations | 50.0 | 5 | 50.0 |
| Automations | 52.5 | 11 | 52.5 |
| Dashboards | 54.5 | 5 | 54.5 |
| Reports (lifecycle & wizard) | 56.2 | 10 | 43.8 |
| Control (goals) | 56.2 | 8 | 56.2 |
| Timeline | 57.1 | 4 | 57.1 |
| Projects & account | 57.1 | 8 | 57.1 |
| Templates | 60.0 | 3 | 60.0 |
| Report editor | 63.4 | 37 | 16.2 |
| API & automation | 75.0 | 5 | 75.0 |
| Sharing & export | 85.3 | 8 | 85.3 |

The first build was a **data/report engine with a template editor**, not a **document editor**. The in-report editor
(2026-10-21: `src/lib/layout/*`, `src/components/report-editor.tsx`, `grid.tsx`) closes most of that gap — 37 rows, score
16 → 63: drag from the catalog, grid move/resize, per-widget settings, manual / calculated / analysis widgets, custom
blocks, autosave, undo, save as template. What is still missing in the editor is campaign containers, table filters /
dimension change, cross-network funnels, chart extras (two axes, reference lines) and block theming.

## Must-haves not done (build order)

1. Campaign containers (per-campaign widgets inside an ads block) — no
2. AI analysis per block (not only per report) — partial
3. Breadth of *live* integrations (8 live of 67; Reportei ≈ 58 live) — partial
4. One-click OAuth for every provider (Google + Meta only) — partial
5. Analysis card with images (the card itself is now a grid widget; HTML is sanitised, no upload) — partial
6. Custom block theming (colour, icon, header toggle; the block container exists) — partial
7. Table: *add* columns (hide / reorder / sort exist) — partial
8. Generation wizard: expert templates — partial
9. PDF with page breaks (server-rendered) — partial
10. Per-report cover editor — partial

Done since the first score: drag from catalog, grid move/resize, save as template, per-report calculated metrics
(all were must-haves), plus manual metrics, highlight, duplicate, hide, period override, number toggles,
positive-is-bad, title/description, chart type, group-by, sort, per-widget API query, undo/redo, add/remove blocks.

Full missing list is in the `parity.py` output; the should/could items that matter most for an agency are:
daily automations, WhatsApp direct delivery, failure-alert e-mails, goal alerts by e-mail/WhatsApp, shareable control
dashboard, client-side period change on shared dashboards, real-time dashboards, overview pages, report themes,
convert/duplicate reports, campaign selection at generation, multi-language UI.

## Behaviour differences (flow · Reportei · Ruler Reports · fix or keep)

| Flow | Reportei does | Ruler Reports does | Decision |
|---|---|---|---|
| Build a report | Generate from a template, then **edit the document in place** (drag, resize, add/remove widgets, custom blocks); autosave | Same since 2026-10-21: generate, then edit on `/reports/[id]` (12-column grid, Add-metrics drawer, settings drawer, autosave, undo); the numbers stay a frozen snapshot, new widgets are resolved once and stored | **Done** — remaining: campaign containers, block colours/icons |
| Monthly report with commentary | One analysis card per block, AI-written with a chosen tone, regenerate once free, credits | One analysis card per report, AI or rule-based, unlimited regenerate, no credits | Fix per-block cards; **keep** no credits |
| Comparison | Period card with pencil; changing the period of an AI report asks about credits | Comparison fixed at creation; refresh re-pulls data | Keep (snapshot semantics) but allow editing the period |
| Share a dashboard | Client can change the date range on the public link; real-time option | Public link shows the preset range; agency changes the preset | Fix — client-side date picker on `/d/[token]` |
| Password | Per **project**, covers reports, dashboards, timeline, control | Per **report** | Keep both: add project-level default |
| Delivery | E-mail (+ failure alerts), in-app, WhatsApp direct or webhook | E-mail (SMTP or outbox), in-app, Slack/Teams/Discord/Telegram, WhatsApp webhook | Keep extra channels; add failure alerts |
| Goals | 7 per project, e-mail/WhatsApp alerts, shareable dashboard, campaign filter | Unlimited, in-app + webhook alerts, internal only | Add e-mail alerts + public link |
| Connecting accounts | OAuth for every provider; plan-gated | OAuth for Google/Meta, tokens elsewhere; most providers synthetic | Fix — write live connectors in order of agency use (Google Ads, Instagram, Facebook Page, Business Profile, TikTok, LinkedIn, Shopify) |
| Overview | Pages, chosen metrics, filters, presets, real-time | One fixed KPI table + anomaly flags | Add pages/metric picker; **keep** anomalies |
| API | v2 + v1 query builder + Zapier/Make/n8n apps + MCP OAuth | v2-compatible + Push API + signed webhooks + MCP (static token) | Keep; publish Make/Zapier templates later |
| Errors | "Not generated — reintegrate" page with Delete; retry per widget | Per-source banner inside the report | Keep |
| Clicks to first report | 5 (project → New report → template → settings → generate) | 4 (project → New report → settings → generate) | Keep |

## Yours, not in the original (not scored)

Push API for rows from Make/Zapier/n8n/call trackers · Slack/Teams/Discord/Telegram delivery · anomaly flags on the
overview · client-portal role · whole-report CSV · HMAC-signed webhooks with delivery log · self-hosted, no plan limits
· synthetic demo-data mode · 18 integration slugs Reportei does not list (Snapchat, Reddit, Amazon Ads, Apple Ads,
Matomo, Plausible, Omnisend, Brevo, Salesforce, Zoho, Stripe, BigCommerce, PrestaShop, Ruler Attribution, Ruler
Click-to-Call, CSV URL, REST/JSON, Push) — all on synthetic data for now.

Reportei features that only exist because of its SaaS model and were skipped on purpose: plan-gated integrations,
billing/invoices.

## Top five to build next

1. ~~**In-report editor**~~ — **done 2026-10-21** (editor area 16 → 63, parity 44.4 → 59.5). Left over from this
   item: table keyword filters and dimension change, two-axis charts and reference lines, block drag-reorder.
2. **Custom blocks + per-report calculated / manual metrics + campaign containers** (reuse the formula engine and the
   `container_v1` idea).
3. **Live connectors** for Google Ads, Instagram, Facebook Page, Business Profile and Shopify, with OAuth pickers.
4. **Per-block AI analyses with tones + regenerate**, and a cover/theme editor (themes recolour charts).
5. **Delivery parity**: daily + weekday-position schedules, failure-alert e-mails, goal alerts by e-mail, client date
   picker and real-time refresh on shared dashboards, convert/duplicate reports.
