# Ad previews, the source dropdown and Matomo goals (2026-11-04)

Branch `v4`. Approved in chat section by section on 2026-11-04, after the user's feedback on sub-project A (screenshots of
a Reportei ads table and a "Metrics by Source" dropdown). Choices: the campaign table gets an Ads level; the dropdown can
pick any account; Matomo connects with address + token and a site picker; Matomo goals keep Matomo's own names with an
optional rename in the tool.

## Goal

1. **See the ads, not only their names**: the campaign table at Ads level shows each ad's creative thumbnail, and its
   results with the result type ("Add to cart (pixel)", "Purchase") under the number, like the user's Reportei table.
   Facebook and Instagram post tables show the post's image.
2. **Find metrics by source**: a simple dropdown of every connected account (icon + name) in the Add metrics panel.
3. **Matomo with real data and separate conversion types**: a real Matomo connector; every Matomo goal is its own metric
   (Leads, Click to phone…) instead of one generic "Conversions".

Success: a client sees which creative drove which result; an agency adds a metric from any account without hunting; a
law-firm report shows "Leads" and "Click to phone" from Matomo as separate numbers.

## Out of scope

A "Grouped metrics" tab (one metric across accounts); TikTok/Pinterest previews (those connectors are sample data);
Google Ads ad-level previews (its search ads have no images; it keeps Campaigns); Matomo product images (Matomo has none);
conversion types for Meta/Google Ads beyond what Section 1 shows.

---

## 1. Ads table with previews

### Level

`WidgetCustom.level?: 'campaign' | 'adset' | 'ad'` on the campaign table (`container_v1`), default `'campaign'` (existing
tables unchanged). The settings drawer (`widget-settings/container.tsx`) gets a Level select; Meta Ads offers all three,
Google Ads only Campaigns. Columns, hidden rows (`hiddenCampaigns`, now "hidden rows" by row id), sorting, row count and
row stars work at every level.

### Data (Meta)

- `src/lib/connectors/meta.ts`: `DIM.adset` gains `idField: 'adset_id'`, `DIM.ad` gains `idField: 'ad_id'`, so ad set
  and ad rows are keyed by id and labelled by name, like campaigns.
- The campaign scope of the block still narrows the rows (an ad or ad set row belongs to its campaign).
- **Result type.** Meta's API documents no per-ad "results" field, so the type comes from the ad set's optimisation:
  `/{adset-id}?fields=optimization_goal,promoted_object` for the ad sets of the rows shown (one batched call). The pair
  maps to an `action_type` (`promotedObjectAction()` in `src/lib/connectors/meta-results.ts`):
  - `OFFSITE_CONVERSIONS` + `custom_event_type` → `offsite_conversion.fb_pixel_<event>` for PURCHASE (`purchase`),
    ADD_TO_CART, LEAD, COMPLETE_REGISTRATION, INITIATED_CHECKOUT, CONTENT_VIEW (`view_content`), ADD_PAYMENT_INFO,
    ADD_TO_WISHLIST, SEARCH, CONTACT, SCHEDULE, SUBMIT_APPLICATION, START_TRIAL, SUBSCRIBE (the event name in lower case,
    except CONTENT_VIEW); OTHER → `offsite_conversion.fb_pixel_custom`; a `promoted_object.custom_conversion_id` →
    `offsite_conversion.custom.<id>`;
  - `LINK_CLICKS` → `link_click`; `LANDING_PAGE_VIEWS` → `landing_page_view`; `LEAD_GENERATION` → `lead`;
    `CONVERSATIONS` → `onsite_conversion.messaging_conversation_started_7d`; `THRUPLAY` → `video_thruplay_watched`
    (read from `video_thruplay_watched_actions`); `REACH` / `IMPRESSIONS` → none (the column shows "–").
  - The count is that action in the row's `actions`; Cost per result = spend ÷ count.
  - Two new container metrics: `results` and `cost_per_result` (catalog ADS widgets, Meta only), each cell carrying the
    type label.
- **Labels.** `resultLabel(actionType, locale)`: a map of the common types (Purchase, Add to cart (pixel), Lead, Link
  click, Landing page view, Messaging conversation, ThruPlay, Registration, Checkout started, Content view; EL and EN),
  else Meta's name humanised (`offsite_conversion.fb_pixel_custom` → "Fb pixel custom").
- **Thumbnails.** For ad rows: `/?ids=<ad ids>&fields=creative{thumbnail_url,image_url,object_type}` (batched, ≤50 ids per
  call). Preference: `image_url`, else `thumbnail_url`; none (catalog/dynamic ads) → placeholder.

### Value shape

`ContainerValue.rows[i]` gains `thumb?: string | null` (an image URL) and `notes?: (string | null)[]` (per metric cell, the
result type). `ContainerValue.level?: 'campaign' | 'adset' | 'ad'`. The API serializer (`routes.ts`) adds `thumb` and the
notes to each row.

### Images that last

A frozen report keeps its own copy: when a snapshot is built, each thumbnail is fetched once and stored with `putMedia`
(`src/lib/media/store.ts`) under the name `creative-thumb:<platform>:<creative or post id>` (reused if that name exists for
the company), and the row's `thumb` becomes the media URL. `listMedia` skips names starting with `creative-thumb:`, so the
media library stays clean. Live dashboards use the platform URL as is. A thumbnail that fails to download keeps the
placeholder; the table never fails because of an image. Size cap: 300 KB per image.

### Posts

Facebook top posts (`facebook.ts`) add `full_picture,permalink_url`; Instagram top posts (`instagram.ts`) add
`media_url,thumbnail_url,permalink` (video: `thumbnail_url`). `TableValue` gains `thumbs?: (string | null)[]` and
`links?: (string | null)[]` aligned with `rows`. Snapshots store the images the same way (`creative-thumb:facebook:<post>`).

### Rendering

`ContainerCard` (Ads level) and `TableCard` (when `thumbs` exist) draw a 48×48 rounded thumbnail (`object-fit: cover`)
before the name; the placeholder is the existing `MediaImage` placeholder. Under a cell with a note, the note in small muted
text. A post row's name links to the post (new tab, `rel="noreferrer"`). Print keeps the thumbnails at the same size.

## 2. Source dropdown in Add metrics

- `AddMetricsPanel` (Predefined tab): the source select always shows (today only in custom blocks), as a small listbox button
  (`src/components/source-select.tsx`): platform icon (`PlatformIcon`) + platform name + account name per option, sorted by
  platform type then name, keyboard-operable (arrows, Enter, Esc).
- It opens on the block's account. Choosing another account loads that account's pickable metrics in the same
  `MetricPicker`.
- A metric picked from another account is added where the panel was opened, with its own `integrationId`. Inside a channel
  block such a widget shows a small platform icon before its title (`WidgetCard` title, when the widget's account differs
  from the block's).
- Right-click "Add metric here" keeps the block's own account.

## 3. Matomo with real data and goals

### Connect

- `matomo` moves from connector `demo` to a real `matomo` connector (`src/lib/connectors/matomo.ts`), auth `api_key`.
- The connect page for Matomo asks for **Matomo address** (https only) and **API token** (secret), then **Load sites**
  (`listMatomoSitesAction(url, token)` → `SitesManager.getSitesWithAtLeastViewAccess`). The sites show as a list with the
  existing `ListFilter` search; each ticked site becomes an integration: `sourceId` = idSite, name = the site name,
  credentials `{ url, token }` encrypted, config `{ currency, timezone, goals: [{ id, name }] }`.
- Calls: `POST <url>/index.php` with `module=API&format=JSON&method=…` and `token_auth` in the body (never in the URL);
  several reads go through `API.getBulkRequest`. A Matomo error answer (`{ result: 'error', message }`) becomes a provider
  error with Matomo's message; HTTP 401/403 or "token" errors become the "reconnect" error.
- Existing Matomo integrations (sample data) stay demo until reconnected with a real address and token.

### Metrics (the WEB archetype the GA4 block uses)

| primitive / table | Matomo |
|---|---|
| sessions, users, pageviews, bounce_rate, avg_session_duration (daily) | `VisitsSummary.get` period=day (`nb_visits`, `nb_uniq_visitors`, `nb_pageviews` via `Actions.get`, `bounce_rate`, `avg_time_on_site`) |
| conversions, revenue (daily) | `Goals.get` period=day (`nb_conversions`, `revenue`) |
| by channel / country / device | `Referrers.getReferrerType`, `UserCountry.getCountry`, `DevicesDetection.getType` (period=range) |
| top pages (URL) | `Actions.getPageUrls` flat=1 |
| top pages by title (new) | `Actions.getPageTitles` flat=1 |
| products | `Goals.getItemsName` |

Unique visitors over a range may be off in Matomo (it can be disabled for ranges): `users` sums daily values only when the
range total is unavailable, and the widget's data note says so. Primitives Matomo cannot give go in the connector's
`unsupported` list, so the picker hides them.

**GA4 gets "Top pages by title"** too (`pageTitle` dimension), the same catalog table.

### Goals

- Read with `Goals.getGoals` on connect and on every health check ("Check now", the daily check); stored in
  `config.goals`.
- The catalog for a Matomo integration adds, per goal `g`: `goal_<id>_conversions` (KPI), `goal_<id>_conversions_by_date`
  (chart), `goal_<id>_conversion_rate` (KPI), `goal_<id>_revenue` (KPI), in a **Goals** group (placed after Conversion in the
  web group order), plus one table `conversions_by_goal` (row per goal: conversions, conversion rate, revenue).
  `getCatalog(slug, config)` caches by slug **and** a hash of the goals for Matomo.
- Data: `Goals.get` with `idGoal=<id>` (period=day) for one goal's daily series; the table asks `Goals.get` with
  `idGoal=<id>` (period=range) for every goal in one `API.getBulkRequest`.
- **Names.** A goal's title is its Matomo name unless renamed. The project's Integrations tab shows, for a Matomo account, a
  **Goals** list: ID, Matomo name, a "Show as" field (saved to `config.goalNames[id]`, max 60 characters). The shown name is
  used in the picker, widget titles, the client link, the PDF and the AI analysis.
- A goal deleted in Matomo disappears from the picker; frozen reports keep their numbers; a live widget for it shows "This
  goal no longer exists in Matomo".

---

## 4. Errors

- Meta: a failed thumbnail or ad-set lookup never fails the table (placeholder, "–" for results); a refused insights call
  fails the table as today.
- Matomo: wrong address/token at "Load sites" shows Matomo's message under the form and connects nothing; a site the token
  lost access to shows the reconnect card.
- Image copies: download failures, non-image answers and files over 300 KB are skipped.

## 5. Testing

TDD, as before.

- Connector tests with stand-in servers (as `tests/connectors-meta.test.ts` and `connectors-social.test.ts` do):
  - Meta Ads level: rows keyed by ad id; result type from the ad set's optimisation for each listed pair (purchase,
    add to cart, custom conversion, link clicks, lead form, reach → none); cost per result; thumbnails from `image_url` then
    `thumbnail_url`; missing creative → null.
  - Facebook / Instagram post thumbnails and links.
  - Matomo: site list; token in the body, never in the URL; daily visits/conversions; channel/country/device tables; page
    titles; goals list; per-goal conversions; a Matomo error answer; a 401.
- Engine/service tests: snapshot stores thumbnails once per creative under `creative-thumb:` names and the media library
  does not list them; a failed download keeps the placeholder; Matomo catalog includes goal widgets with renamed titles;
  catalog cache changes when goals change.
- Render tests: Ads-level container shows thumbnails and notes; TableCard with thumbs and links; widget from another
  account shows its platform icon.
- Browser tests (mock server, which gains a stand-in Matomo and Meta ad/creative answers): Ads level in the settings
  drawer → thumbnails and result types on the client link; source dropdown switches accounts and adds a metric from another
  account; Matomo connect → Load sites → pick → goal metrics in the picker → rename a goal → the client link shows the new
  name.
- Hallmark sloplint 0 FAIL / 0 WARN; `npm run i18n:review`; `next build`.

## 6. Constraints

- Production (`main`) is updated only with the user's explicit OK. The preview build pushes schema changes to the shared
  Neon database (no schema change is planned here: new settings live in JSON columns).
- The user pastes Matomo addresses and tokens into the app; they never pass through the chat.
- Never stage `package.json` / `package-lock.json` (another session's uncommitted dependencies).
