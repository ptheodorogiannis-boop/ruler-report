# Ad previews, the source dropdown and Matomo goals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ads-level campaign tables with creative thumbnails and typed results, post thumbnails, a source dropdown in Add
metrics, and a real Matomo connector whose goals are separate, renamable metrics.

**Architecture:** `BreakdownRow` gains `thumb`, `link` and `resultType`; the Meta connector fills them at ad / ad-set level
(ad-set optimisation → action type, creatives → thumbnails), the container and table values carry them, and the cards draw
them. Snapshots copy thumbnails into the media store. Matomo is a new connector (`matomo.ts`) over its HTTP API with goals
stored in the integration config and turned into catalog widgets.

**Tech Stack:** Next.js 15 App Router, Prisma 6, Tailwind, zod, node:test via tsx, Playwright on the mock server.

**Spec:** `docs/superpowers/specs/2026-11-04-ads-previews-sources-matomo-design.md`

## Global Constraints

- Branch `v4`; `main` (production) only with the user's explicit OK. No Prisma schema change (new settings in JSON columns).
- Never stage `package.json` / `package-lock.json`. Commit with `git -c core.safecrlf=false`, named files only, ending
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- The user types Matomo addresses and tokens into the app; never into the chat; tests use stand-in servers.
- Single test file: `DATABASE_URL='file:./test.db' APP_SECRET='test-secret-test-secret-test-secret' TSX_TSCONFIG_PATH=tsconfig.test.json APP_URL=http://localhost:3100 ENABLE_SCHEDULER=0 ANTHROPIC_API_KEY='' node --import tsx --test tests/<file>.test.ts`
  (after `DATABASE_URL='file:./test.db' npx prisma db push --skip-generate --accept-data-loss` if `npm test` ran).
- Browser tests: back up `prisma/mock.db` first, start `ruler-reports-v2-mock` (3106), run with
  `PLAYWRIGHT_BROWSERS_PATH='E:\Claude\tmp\ms-playwright' NAV_BASE=http://localhost:3106 DATABASE_URL='file:./mock.db' APP_SECRET='ruler-reports-local-dev-secret-0123456789abcdef' TSX_TSCONFIG_PATH=tsconfig.test.json`;
  stop the server and restore `mock.db` at the end. Never run `next build` while the mock server runs.
- Gates per task: the task's tests, `npx tsc --noEmit` (restore `next-env.d.ts`, `tsconfig.json`), sloplint
  `node "C:/Users/Panagiotis Theo/.claude/skills/hallmark/scripts/sloplint.mjs" src/app/globals.css src/components src/app --scope app --genre modern-minimal`
  with **0 FAIL, 0 REFLEX, 0 WARN**, `npm run i18n:review`. Client components' i18n keys must be in a namespace of
  `APP_NAMESPACES` (`src/lib/i18n/namespaces.ts`).
- i18n strings via `node E:\Claude\tmp\scripts\i18n-add.cjs <json file>` (file of `{ key: [en, el] }`).

## Review Focus

1. **Accounts with many ads**: thumbnails and ad-set lookups only for the rows the table keeps (`MAX_CONTAINER_ROWS`), in
   batches of ≤ 50 ids. Test: Task 1 `batches ids`.
2. **An ad whose ad set or creative cannot be read** (deleted, no access): that row shows "–" and a placeholder; the table
   still renders. Test: Task 1 `missing ad set and creative`.
3. **Matomo's number formats**: values arrive as numbers, numeric strings, `"-"` or percentages (`"3.2%"`). Test: Task 6
   `parses Matomo values`.
4. **Matomo day keys**: `period=day&date=start,end` returns an object keyed `YYYY-MM-DD` for every day, empty days as `[]`;
   empty days are real zeros. Test: Task 6 `daily keys`.
5. **Goal renames**: over 60 characters refused; markup kept as text. Test: Task 8 `goal names`.

---

### Task 1: Meta ads and ad sets: ids, result types, thumbnails

**Files:**
- Create: `src/lib/connectors/meta-results.ts`
- Modify: `src/lib/engine/types.ts` (`BreakdownRow`), `src/lib/connectors/meta.ts` (DIM, breakdown, grouping),
  `src/lib/connectors/demo.ts` (ad rows)
- Create: `public/demo/creative-1.svg` … `creative-4.svg` (simple flat shapes, ≤ 2 KB each)
- Test: `tests/connectors-meta-ads.test.ts`

**Interfaces:**
- Produces: `BreakdownRow` gains `thumb?: string | null; link?: string | null; resultType?: string | null`.
- Produces (`meta-results.ts`):
  `promotedObjectAction(optimizationGoal: string | undefined, promoted?: { custom_event_type?: string; custom_conversion_id?: string }): string | null`
  per the spec's table (OFFSITE_CONVERSIONS events → `offsite_conversion.fb_pixel_<event>`, CONTENT_VIEW →
  `…fb_pixel_view_content`, OTHER → `…fb_pixel_custom`, custom conversion → `offsite_conversion.custom.<id>`, LINK_CLICKS →
  `link_click`, LANDING_PAGE_VIEWS → `landing_page_view`, LEAD_GENERATION → `lead`, CONVERSATIONS →
  `onsite_conversion.messaging_conversation_started_7d`, THRUPLAY → `video_thruplay_watched`, anything else → null);
  `resultLabel(actionType: string | null | undefined, t: (key: string) => string): string` (i18n keys
  `results.<type with dots → _>` for the common ones, else humanised: `offsite_conversion.fb_pixel_custom` → "Fb pixel custom";
  null → "–").
- Produces: Meta `breakdown()` for `dimension` `'ad'` and `'adset'` returns rows keyed by `ad_id` / `adset_id`, labelled by
  name; when `prims` includes `results`, each row gets `values.results` and `resultType`; for `'ad'`, each row gets `thumb`
  (`image_url`, else `thumbnail_url`, else null). Lookups: `GET <graph>/?ids=<≤50 ids>&fields=optimization_goal,promoted_object`
  and `…&fields=creative{thumbnail_url,image_url}`, only for the rows after `opts.limit` (or all when no limit), errors
  per batch swallowed.
- Produces: the demo connector's `'ad'` / `'adset'` rows get `resultType` cycling purchase / add to cart / lead,
  `values.results`, and (ads) `thumb: '/demo/creative-<1..4>.svg'`.

- [ ] **Step 1: Failing tests** (stand-in Graph server as in `tests/connectors-meta.test.ts`, swapping
  `endpoints.meta.graph`):
  - `promotedObjectAction`: `('OFFSITE_CONVERSIONS', { custom_event_type: 'ADD_TO_CART' })` →
    `'offsite_conversion.fb_pixel_add_to_cart'`; `CONTENT_VIEW` → `'offsite_conversion.fb_pixel_view_content'`;
    `{ custom_conversion_id: '987' }` → `'offsite_conversion.custom.987'`; `('LINK_CLICKS')` → `'link_click'`;
    `('LEAD_GENERATION')` → `'lead'`; `('REACH')` → `null`.
  - `resultLabel`: purchase type → the `results.offsite_conversion_fb_pixel_purchase` string; unknown
    `'offsite_conversion.fb_pixel_custom'` → `'Fb pixel custom'`; null → `'–'`.
  - `ads level`: insights `level=ad` rows (two ads in ad set A optimised for ADD_TO_CART, one in B for PURCHASE, actions
    listed per type) → three rows keyed by ad id, `resultType` and `values.results` from the matching action, thumbs from
    `image_url` then `thumbnail_url`.
  - `missing ad set and creative`: the ids call omits one ad set and one creative → that row has `resultType: null`,
    `values.results: 0`, `thumb: null`; the others are filled.
  - `batches ids`: 120 ad rows with `limit: 60` → creative lookups request 60 ids in 2 calls (≤ 50 per call).
  - `campaign level unchanged`: `dimension: 'campaign'` makes no `?ids=` calls.
- [ ] **Step 2: Run; expect FAIL** (module missing / no `resultType`).
- [ ] **Step 3: Implement.** `DIM.adset.idField = 'adset_id'`, `DIM.ad.idField = 'ad_id'`; at ad level the insights fields
  add `adset_id`; grouping also sums `actions` per `action_type` (and `video_thruplay_watched_actions`) for the results step.
  i18n `results.*` keys (EN/EL): Purchase/Αγορά, Add to cart (pixel)/Προσθήκη στο καλάθι (pixel), Lead/Δυνητικός πελάτης,
  Link click/Κλικ σε σύνδεσμο, Landing page view/Προβολή σελίδας προορισμού, Messaging conversation/Συνομιλία μέσω μηνυμάτων,
  ThruPlay/ThruPlay, Registration/Εγγραφή, Checkout started/Έναρξη ολοκλήρωσης αγοράς, Content view/Προβολή περιεχομένου.
  Namespace `results` goes into `APP_NAMESPACES`.
- [ ] **Step 4: Run; expect PASS.** Also `tests/connectors-meta.test.ts`.
- [ ] **Step 5: Commit** — `"Meta ads and ad sets: rows by id, result types from the ad set, creative thumbnails"`.

### Task 2: Campaign table levels and the Results metrics

**Files:**
- Modify: `src/lib/layout/types.ts` (`WidgetCustom.level`), `src/lib/layout/compose.ts` (`customSchema.level`),
  `src/lib/engine/types.ts` (`ContainerValue`), `src/lib/layout/container.ts`, `src/lib/catalog/integrations.ts`
  (`extraWidgets` on `facebook_ads`), `src/lib/catalog/build.ts`, `src/lib/catalog/helpers.ts` (`WidgetSpec.containerOnly`),
  `src/lib/catalog/pickable.ts`, `src/lib/engine/resolve.ts` (refuse container-only widgets elsewhere),
  `src/lib/api/routes.ts` (serializer), `src/components/widget-settings/container.tsx` (Level select)
- Test: `tests/v4-ads-level.test.ts`

**Interfaces:**
- Consumes: Task 1 rows.
- Produces: `WidgetCustom.level?: 'campaign' | 'adset' | 'ad'` (schema `z.enum([...]).optional()`);
  `ContainerValue.level?: 'campaign' | 'adset' | 'ad'`; `ContainerValue.rows[i].thumb?: string | null` and
  `.resultType?: string | null`.
- Produces: `resolveContainer` reads `w.custom.level ?? 'campaign'` as the breakdown dimension; at `adset`/`ad` the
  campaign scope goes only to the connector (`campaignIds`), never as a row-key filter. `containerFromRows` copies `thumb`
  and `resultType` from the rows.
- Produces: catalog widgets `results` (sum of prim `results`, group "Results") and `cost_per_result` (ratio spend /
  results, money, `diff: 'positive_bad'`) for `facebook_ads` only, both `containerOnly: true`; `pickableMetrics` drops
  `containerOnly`; `resolveWidget` on a `containerOnly` widget returns
  `{ type: 'error', code: 'invalid_metrics_combination', message: 'Only in the campaign table (Ads or Ad sets level).' }`.
- Produces: API container rows add `thumb` and `result_type`.
- Ruling (spec said notes per cell): one `resultType` per row, shown under the Results and Cost per result cells.

- [ ] **Step 1: Failing tests:** `containerFromRows` keeps `thumb`/`resultType`; `resolveContainer` with
  `custom.level: 'ad'` asks the session for `'ad'` with the campaign ids and does not drop rows whose key is not a campaign
  id; level absent → `'campaign'` as before; `getCatalog('facebook_ads')` has `results` and `cost_per_result` (container-only),
  `getCatalog('google_adwords')` has neither; `pickableMetrics('facebook_ads', …)` excludes them; resolving `results` as a
  KPI returns the error above; `customSchema` accepts `level: 'ad'`, rejects `level: 'keyword'`.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement.** Level select in the container settings: options Campaigns / Ad sets / Ads (`editor.levelCampaign`,
  `editor.levelAdset`, `editor.levelAd`), shown only for `facebook_ads`; i18n EN/EL (Καμπάνιες / Σύνολα διαφημίσεων /
  Διαφημίσεις); the "hidden campaigns" label becomes "Hidden rows" (`editor.hiddenRows`: Κρυφές γραμμές). The demo connector
  treats `results` like any synthetic prim for ad rows.
- [ ] **Step 4: Run; expect PASS.** Also `tests/v3-campaigns.test.ts`, `tests/v3-campaigns-fixes.test.ts`,
  `tests/v4-picker-catalog.test.ts`.
- [ ] **Step 5: Commit** — `"Campaign table: Campaigns / Ad sets / Ads levels; Results and Cost per result for Meta"`.

### Task 3: Thumbnails and result types on the page

**Files:**
- Modify: `src/components/container-card.tsx`, `src/components/widgets.tsx` (`TableCard`), `src/app/globals.css`
- Create: `src/components/row-thumb.tsx`
- Test: `tests/v4-previews-render.test.ts`

**Interfaces:**
- Consumes: Task 2 values; `TableValue.thumbs` / `links` from Task 5 (render code handles them now; values arrive in
  Task 5).
- Produces: `RowThumb({ src, alt }: { src: string | null | undefined; alt: string })`: 48×48, radius 8, `object-fit: cover`,
  the `MediaImage` placeholder when `src` is empty; `loading="lazy"`.
- Produces: `TableValue` gains `thumbs?: (string | null)[]; links?: (string | null)[]` (type only here).
- Produces: ContainerCard: `RowThumb` before the name when `v.level === 'ad'`; under the Results and Cost per result
  cells, `resultLabel(row.resultType, tr)` in `.cell-note` (11px, `--ink-3`). TableCard: `RowThumb` when `v.thumbs`,
  name as a link (`target="_blank" rel="noreferrer"`) when `v.links?.[i]`.

- [ ] **Step 1: Failing render tests** (server render as in `tests/v4-stars.test.ts`): ads-level container with two rows
  (one thumb, one null) → one `<img>` with the thumb src and one placeholder; the Results cell has the purchase label
  under the number; campaign-level container → no thumbs; a table with `thumbs` and `links` → `<img>` per row and the name
  inside `<a href=… target="_blank" rel="noreferrer">`.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** (tokens only; print keeps 48px thumbs).
- [ ] **Step 4: Run; expect PASS.** Also `tests/v4-stars.test.ts`, `tests/v4-tones.test.ts`. Sloplint 0/0/0.
- [ ] **Step 5: Commit** — `"Tables: creative and post thumbnails, result types under the numbers"`.

### Task 4: Snapshots keep their thumbnails

**Files:**
- Create: `src/lib/media/thumbs.ts`
- Modify: `src/lib/media/store.ts` (`listMedia` skips `creative-thumb:`), `src/lib/engine/report.ts` (`snapshotReport`)
- Test: `tests/v4-thumbs.test.ts`

**Interfaces:**
- Produces: `THUMB_PREFIX = 'creative-thumb:'`;
  `keepThumbnails(data: ReportData, companyId: number, fetchFn: typeof fetch = fetch): Promise<ReportData>` — walks container
  rows (`thumb`) and table `thumbs` in `sections` and `data.widgets`; for each `http(s)` URL: name =
  `creative-thumb:<sha1 of the URL without its query string>`; reuse a `Media` row of that name for the company, else fetch
  (10 s timeout), accept only `image/*` ≤ 300 KB, `putMedia`, and replace the URL with the media URL; on any failure keep
  `null` (placeholder). Relative URLs (`/demo/…`) and existing `/api/media/` URLs are left as they are.
- Produces: `snapshotReport` returns `keepThumbnails(data, report.companyId)`; live dashboards are untouched.

- [ ] **Step 1: Failing tests** (stand-in image server): two rows with the same image URL but different query strings →
  one `Media` row, both rows point at its URL; an HTML answer, a 404 and a 400 KB image → `null`; `/demo/creative-1.svg`
  unchanged; `listMedia(companyId)` does not list `creative-thumb:` rows; a second `keepThumbnails` run fetches nothing.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run; expect PASS.** Also `tests/v2-media.test.ts`, `tests/engine.test.ts`.
- [ ] **Step 5: Commit** — `"Snapshots keep their own copy of creative and post thumbnails"`.

### Task 5: Facebook and Instagram post thumbnails

**Files:**
- Modify: `src/lib/connectors/facebook.ts` (`POST_FIELDS`, `posts()`, `breakdown`), `src/lib/connectors/instagram.ts`
  (media fields, post breakdown), `src/lib/engine/resolve.ts` (`breakdown` case adds `thumbs`/`links`),
  `src/lib/connectors/demo.ts` (post rows get demo thumbs)
- Test: `tests/connectors-social.test.ts` (extend)

**Interfaces:**
- Consumes: `BreakdownRow.thumb` / `link` (Task 1), `TableValue.thumbs` / `links` (Task 3).
- Produces: Facebook post rows `thumb = full_picture ?? null`, `link = permalink_url ?? null`; Instagram
  `thumb = (media_type === 'VIDEO' ? thumbnail_url : media_url) ?? null`, `link = permalink ?? null`. The resolver sets
  `thumbs` / `links` only when some row has one.

- [ ] **Step 1: Failing tests:** Facebook `top_posts` table has `thumbs[0]` = the stand-in's `full_picture` and `links[0]` its
  `permalink_url`; Instagram video post → its `thumbnail_url`; a table whose rows have no thumbs has no `thumbs` key; the
  `pages_read_user_content` fallback test still passes (fields without comments still include `full_picture`).
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run; expect PASS** (whole `tests/connectors-social.test.ts`).
- [ ] **Step 5: Commit** — `"Facebook and Instagram post tables: the post's image and link"`.

### Task 6: Matomo connector

**Files:**
- Create: `src/lib/connectors/matomo.ts`
- Modify: `src/lib/catalog/integrations.ts` (`matomo` → connector `'matomo'`, `ConnectorId`), `src/lib/connectors/index.ts`
  (register, `REAL_CONNECTORS`), `src/lib/catalog/archetypes.ts` (WEB: `top_page_titles` table), `src/lib/connectors/ga4.ts`
  (`page_title: 'pageTitle'`)
- Test: `tests/connectors-matomo.test.ts`

**Interfaces:**
- Produces: credentials `{ baseUrl: string; tokenAuth: string }` (the existing field names; ruling: the spec's
  `{ url, token }` keeps the names the connect form already uses).
- Produces: `matomoApi<T>(creds, method: string, params: Record<string, string>, fetchFn = fetch): Promise<T>` —
  `POST <baseUrl>/index.php` body `module=API&format=JSON&method=…&token_auth=…&…`; `baseUrl` must be `https:` unless the
  host is `localhost` / `127.0.0.1` (tests, mock); a JSON `{ result: 'error', message }` throws `Error('Matomo: <message>')`,
  messages mentioning the token or HTTP 401/403 throw `Error('invalid_token: <message>')`.
- Produces: `matomoBulk(creds, calls: { method: string; params: Record<string, string> }[])` via `API.getBulkRequest`
  (`urls[i]` = the query string of each call).
- Produces: `listMatomoSites(creds): Promise<{ id: string; name: string; url: string; currency: string; timezone: string }[]>`
  (`SitesManager.getSitesWithAtLeastViewAccess`).
- Produces: `num(v: unknown): number` — numbers, numeric strings, `"3.2%"` → 3.2, `"-"`/`""`/null → 0.
- Produces: `matomoConnector: Connector` with:
  - `daily` (period=day, date=`start,end`, idSite = `sourceId`): sessions = `nb_visits`, users = `nb_uniq_visitors`,
    pageviews = `nb_pageviews` (`Actions.get`), engaged_sessions = `nb_visits − bounce_count`, session_duration =
    `sum_visit_length`, conversions / revenue = `Goals.get` `nb_conversions` / `revenue`, transactions / abandoned_carts =
    `Goals.get idGoal=ecommerceOrder` / `ecommerceAbandonedCart` `nb_conversions`, `goal_<id>_conversions` /
    `goal_<id>_revenue` = `Goals.get idGoal=<id>`; empty days = 0.
  - `breakdown` (period=range): channel `Referrers.getReferrerType`, device `DevicesDetection.getType`, country
    `UserCountry.getCountry` (label from `countryName(code)`), city `UserCountry.getCity`, page `Actions.getPageUrls flat=1`,
    page_title `Actions.getPageTitles flat=1`, landing_page `Actions.getEntryPageUrls flat=1`, campaign
    `Referrers.getCampaigns`, product `Goals.getItemsName`, goal (rows per `config.goals`: conversions, revenue,
    goal_conversion_rate via one bulk `Goals.get idGoal=<id>`); row values map `nb_visits`→sessions,
    `nb_uniq_visitors`→users, `nb_hits`/`nb_pageviews`→pageviews, `nb_conversions`→conversions, `revenue`→revenue.
  - `totals` for `users` (`VisitsSummary.get` period=range; when absent, null so the daily sum is used).
  - `validate`: `SitesManager.getSiteFromId` + `Goals.getGoals` → `{ name, config: { currency, timezone, goals: [{ id, name }] } }`.
  - `unsupported: ['new_users', 'events', 'view_item', 'add_to_cart', 'begin_checkout']`.
- Produces: WEB widget `table('top_page_titles', 'Top pages by title', 'page_title', ['pageviews', 'users', 'conversions'], { group: 'Tables', sortBy: 'pageviews' })`.
- Produces: a data note for Matomo `users` in `src/lib/catalog/data-notes.ts` (that file shows as modified only by line
  endings; follow its per-slug note shape): "Unique visitors over a period need Matomo's range processing; without it this
  is the sum of the daily unique visitors." / «Οι μοναδικοί επισκέπτες μιας περιόδου χρειάζονται την επεξεργασία εύρους του
  Matomo· χωρίς αυτήν είναι το άθροισμα των ημερήσιων μοναδικών επισκεπτών.»

- [ ] **Step 1: Failing tests** (stand-in Matomo `http.createServer` on `/index.php`, recording each request body):
  - `token in the body`: no request URL contains `token_auth`; bodies do.
  - `sites`: `listMatomoSites` maps the site list.
  - `daily keys`: a 3-day range with the middle day `[]` → three keys, middle day all zeros.
  - `parses Matomo values`: `'12'` → 12, `'3.2%'` → 3.2, `'-'` → 0.
  - `breakdowns`: channel, country (code `gr` → "Greece"), page_title, goal rows with renamed nothing.
  - `goals`: `goal_1_conversions` daily from `Goals.get idGoal=1`.
  - `validate`: returns site name, currency, timezone and goals.
  - `errors`: `{ result: 'error', message: 'You can't access this resource' }` → throws `/Matomo: You can't access/`; a
    token message → `/invalid_token/`; `http://example.com` base → refused.
  - `ga4 page title`: GA4 breakdown `page_title` asks `pageTitle`.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run; expect PASS.** Also `tests/connectors.test.ts`, `tests/v4-picker-catalog.test.ts`.
- [ ] **Step 5: Commit** — `"Matomo: a real connector (visits, channels, pages by URL and title, goals, products)"`.

### Task 7: Goals in the catalog

**Files:**
- Create: `src/lib/catalog/matomo-goals.ts`
- Modify: `src/lib/catalog/integrations.ts` (`IntegrationDef.dynamicWidgets?`), `src/lib/catalog/build.ts` (cache key,
  dynamic widgets), `src/lib/catalog/groups.ts` (web: `goals` after `conversion`), `src/lib/catalog/labels.ts` if needed
- Test: `tests/v4-matomo-goals.test.ts`

**Interfaces:**
- Consumes: Task 6 config shape `{ goals: { id: string; name: string }[]; goalNames?: Record<string, string> }`.
- Produces: `goalName(config, id): string` (rename, else Matomo name, else `Goal <id>`);
  `goalWidgets(config): WidgetSpec[]` → per goal `goal_<id>_conversions` (sum, "<name> – conversions"),
  `goal_<id>_conversions_by_date` (series), `goal_<id>_conversion_rate` (ratio of `goal_<id>_conversions` / sessions ×100,
  percent), `goal_<id>_revenue` (sum, money), group `Goals`; plus `table('conversions_by_goal', 'Conversions by goal',
  'goal', ['conversions', 'revenue', 'goal_conversion_rate'], { group: 'Tables', sortBy: 'conversions' })` when there are goals.
- Produces: `getCatalog(slug, config)` caches by `slug` plus a hash of `config.goals` and `config.goalNames` for slugs with
  `dynamicWidgets`.
- Produces: a widget key `goal_<id>_…` that is no longer in a Matomo account's catalog resolves to
  `{ type: 'error', code: 'invalid_metrics_combination', message: 'This goal no longer exists in Matomo.' }` (where the engine
  reports an unknown metric today, `src/lib/engine/report.ts` ~line 338); a frozen report keeps its stored value.
- i18n: `catalog.group.goals` (Goals / Στόχοι).

- [ ] **Step 1: Failing tests:** with goals `[{ id: '1', name: 'Lead form' }, { id: '3', name: 'ClickToPhone' }]` and
  `goalNames: { '3': 'Click to phone' }` → `goal_1_conversions` titled "Lead form – conversions", `goal_3_conversions` titled
  "Click to phone – conversions"; group order puts Goals after Conversion; a second call with different `goalNames` returns
  new titles (cache keyed by goals); no goals → no goal widgets and no `conversions_by_goal`; a layout widget
  `goal_9_conversions` on an account whose goals no longer include 9 resolves to the "no longer exists" error.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run; expect PASS.** Also `tests/v4-picker-catalog.test.ts`.
- [ ] **Step 5: Commit** — `"Matomo goals: one set of metrics per goal, named from Matomo or the agency's rename"`.

### Task 8: Connecting Matomo, goal names, goals on every check

**Files:**
- Create: `src/components/matomo-connect.tsx` (client), `src/components/matomo-goals.tsx`
- Modify: `src/app/actions/app.ts` (`listMatomoSitesAction`, `connectMatomoAction`, `saveGoalNamesAction`),
  `src/app/projects/[id]/connect/[slug]/page.tsx` (Matomo uses `MatomoConnect` when not demo),
  `src/app/projects/[id]/page.tsx` (Goals list on a Matomo integration row), `src/lib/services/health.ts`
  (`HealthResult.config`, merged on save), `src/app/actions/app.ts` "Check now" save, `scripts/mock-providers.mjs`
  (stand-in Matomo at `/matomo/index.php`)
- Test: `tests/v4-matomo-connect.test.ts`, `tests/v4-matomo-browser.test.ts`

**Interfaces:**
- Consumes: Task 6 `listMatomoSites`, `matomoConnector.validate`; Task 7 `goalName`.
- Produces: `listMatomoSitesAction(input: { projectId: number; baseUrl: string; tokenAuth: string }): Promise<Result<{ sites: { id: string; name: string; url: string }[] }>>`
  (writer, `assertProject`); `connectMatomoAction(input: { projectId: number; baseUrl: string; tokenAuth: string; siteIds: string[] }): Promise<Result<{ ids: number[] }>>`
  → one `connectIntegration` per site (validation fills goals); `saveGoalNamesAction(fd)` with `integrationId` and
  `goal_<id>` fields → `config.goalNames` (trimmed; empty removes; > 60 characters refused with
  "Goal names are at most 60 characters").
- Produces: `HealthResult.config?: Record<string, unknown>` (from `validate`); both health save sites merge it into
  `Integration.config`.
- UI: address + token fields, **Load sites** (`connect.loadSites`), the site list with `ListFilter`, **Connect** with the
  count; Goals list (`goals.title`, `goals.showAs`, `goals.save`) under a Matomo row on the Integrations tab. i18n EN/EL in
  `connect` / `goals` namespaces (add `goals` to `APP_NAMESPACES` if new).

- [ ] **Step 1: Failing tests:** `connectMatomoAction`'s service path (call `connectIntegration` for two sites against the
  stand-in) creates two integrations with `config.goals`; `saveGoalNames` keeps a rename, removes an empty one, refuses 61
  characters, stores `<b>x</b>` as text; a health check against the stand-in with a new goal merges it into `config.goals`.
  Browser (mock server): connect Matomo with address `http://127.0.0.1:3198/matomo` and token `mock-matomo` → Load sites →
  pick one → its Goals list shows the stand-in's goals → rename one → open the picker for that account → the Goals group
  lists the renamed goal.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement.** The stand-in Matomo answers `SitesManager.getSitesWithAtLeastViewAccess`,
  `SitesManager.getSiteFromId`, `Goals.getGoals`, `VisitsSummary.get`, `Actions.get`, `Goals.get`, the breakdown methods and
  `API.getBulkRequest`, refusing any token but `mock-matomo`.
- [ ] **Step 4: Run; expect PASS.** Also `tests/v3-health.test.ts`.
- [ ] **Step 5: Commit** — `"Matomo: connect with address and token, pick sites, rename goals; goals refresh on every check"`.

### Task 9: Source dropdown in Add metrics

**Files:**
- Create: `src/components/source-select.tsx`
- Modify: `src/components/report-editor.tsx` (`AddMetricsPanel`), `src/components/widgets.tsx` (`WidgetCard` /
  `LayoutSection`: icon for a widget from another account)
- Test: `tests/v4-source-select.test.ts` (render), `tests/v4-source-browser.test.ts`

**Interfaces:**
- Produces: `SourceSelect({ sources, value, onChange }: { sources: SourceInfo[]; value: number; onChange: (id: number) => void })`:
  a button with the current account (`PlatformIcon` + platform name + account name) opening a listbox of all sources sorted
  by platform category then name; ArrowUp/Down, Enter, Escape; `role="listbox"`, options `role="option"`.
- Produces: `AddMetricsPanel` always renders `SourceSelect`, initial value the block's account (or the first source for
  custom blocks); a pick from another account adds a widget with that `integrationId`.
- Produces: a widget whose `integrationId` > 0 and differs from its block's shows `PlatformIcon` (14px) before its title
  (`data-foreign-source`), in the editor and on the client link.

- [ ] **Step 1: Failing tests:** render: `SourceSelect` lists each source once with its icon and name; a KPI widget from
  another account inside a Meta block renders `data-foreign-source`. Browser: open Add metrics on a Meta block → the
  dropdown shows the Meta account → pick the Google Analytics 4 account → its metrics list → add one → the new widget has
  the GA4 icon in its title and a value.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run; expect PASS.** Also `tests/v4-picker-browser.test.ts`. Sloplint 0/0/0.
- [ ] **Step 5: Commit** — `"Add metrics: a source dropdown with every connected account"`.

### Task 10: Ads-level browser test, docs, whole suite

**Files:**
- Create: `tests/v4-ads-level-browser.test.ts`
- Modify: `docs/DESIGN.md` (section "Ad previews, sources and Matomo goals"), `docs/FEATURE_MATRIX.md`, `docs/CONNECTORS.md`
  only if it has a Matomo row (it is modified in the working tree by another session: edit only if needed and stage only
  your hunk)

- [ ] **Step 1:** Browser test: in a Meta Ads block's campaign table settings choose Ads → the client link shows thumbnails
  (`img` per row with `/demo/creative-` sources) and result labels under Results.
- [ ] **Step 2:** Run it; expect PASS (or fix with a failing test first).
- [ ] **Step 3:** Docs.
- [ ] **Step 4:** `npm test` (0 failures), every browser test one file at a time on the mock server (PDF menu test may fail
  for the known missing Chromium), `npx tsc --noEmit`, sloplint 0/0/0, `npm run i18n:review`, then stop the mock server and
  `npx next build`.
- [ ] **Step 5: Commit** — `"Docs: ad previews, sources and Matomo goals"`.
