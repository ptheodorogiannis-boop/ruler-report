# Writing a connector

A connector turns “give me these primitives for these dates” into API calls. It never computes ratios.

```ts
// src/lib/connectors/index.ts
export interface Connector {
  id: string;
  daily(ctx, prims: string[], range, filter?): Promise<Record<date, Record<prim, number>>>;
  breakdown(ctx, dimension, prims, range, opts?): Promise<{ key; label?; values: Record<prim, number> }[]>;
  totals?(ctx, prims, range): Promise<Record<prim, number>>;   // non-additive metrics (reach, users)
  validate?(ctx): Promise<{ name?; config? } | void>;           // called when connecting; throw a human message
  unsupported?: string[];                                      // primitives this API cannot provide
}
```

`ctx.integration` carries `sourceId`, decrypted `credentials`, and `config`. Primitive names come from the archetype (`catalog/archetypes.ts`), e.g. the **ads** archetype needs `impressions, reach, clicks, link_clicks, spend, video_views, view_content, add_to_cart, checkout, purchases, leads, conversions, conversion_value, engagements`.

## Steps

1. Pick the archetype in `catalog/integrations.ts` (the slug already exists for 67 platforms) and set `connector: 'yourid'`.
2. Implement `daily()` and `breakdown()` for the primitives and dimensions in that archetype (see the dimensions listed under `dims` / `namedDims`). Return zero-filled days if the API omits empty ones.
3. Register: `registerConnector('yourid', yourConnector)` (or add it to `REGISTRY`).
4. Declare `unsupported` for anything the API cannot give you.
5. Add a test with a local HTTP server — `tests/connectors.test.ts` (WooCommerce) is the template.

## Reference implementations

| Connector | File | Notes |
|---|---|---|
| Meta Ads | `meta.ts` | Marketing API `/insights`; `omni_*` actions with pixel fallbacks; `publisher_platform` breakdown for platform variants; period `totals()` for reach. Untested against a live account. |
| Google Analytics 4 | `ga4.ts` | Data API `runReport`; item-scoped metrics for the product table; `totals()` for users. Untested live. |
| Search Console | `gsc.ts` | `searchAnalytics.query`; average position is stored as `position × impressions` so it aggregates correctly. Untested live. |
| WooCommerce | `woo.ts` | REST v3 orders + customers with pagination; tested against a mock store. |
| Facebook Page | `facebook.ts` | Page Insights (`page_media_view`, `page_total_media_view_unique`, `page_follows` as the follower stock) + the Page's published posts. Metrics are requested one by one (one invalid metric fails a whole request). Meta removed Page demographics, link clicks and saves: those say so. Mock-tested only. |
| Instagram Business | `instagram.ts` | Instagram Graph API. `total_value` metrics have no daily series, so one call per day (90-day retention); followers rebuilt backwards from `followers_count`; `views` replaces `impressions`. Mock-tested only. |
| YouTube | `youtube.ts` | YouTube Analytics API v2 + Data API (titles, subscriber snapshot). No channel impressions/CTR in the API → `unsupported`. Age/gender = channel totals × `viewerPercentage`. Mock-tested only. |
| Google Business Profile | `gbp.ts` | Business Profile Performance API (`fetchMultiDailyMetricsTimeSeries`, monthly search keywords) + v4 reviews. Zero-filled days; reviews are optional so an unapproved reviews endpoint does not break views/actions. Mock-tested only. |
| Sheets / CSV / REST / Push | `custom.ts` | Column detection (date / number / text), EU+US numbers, day-first or month-first dates, nested JSON flattening; tested. |
| Demo | `demo.ts` | Deterministic synthetic data for every archetype. |

## Credentials

Connect forms (`app/projects/[id]/connect/[slug]`) are driven by `IntegrationDef.fields`. Values are stored encrypted. `credentials.demo = true` forces the demo connector even on slugs that have a live one (used by the seed and the “use synthetic data” checkbox).

## Google token refresh

`connectors/google.ts` refreshes access tokens from a stored refresh token using `GOOGLE_CLIENT_ID/SECRET`. The refresh token comes either from the one-click flow below or pasted by hand (OAuth playground, scopes in `GOOGLE_SCOPES`); a short-lived access token (`ya29.…`) can also be pasted to test.

## OAuth one-click connect

Code: `src/lib/oauth/*` (state JWT, provider mechanics, request flow, pending-token cookie), routes `src/app/api/oauth/{google,meta}/{start,callback}`, picker `src/app/projects/[id]/connect/[slug]/pick`, submit action `src/app/actions/oauth.ts`. Tests: `tests/oauth.test.ts` (local mock token + list endpoints; `src/lib/oauth/endpoints.ts` is the single place the provider hosts are defined, which the tests repoint).

| Integration (`slug`) | Provider scopes requested | Picker lists | Stored as `sourceId` | Live connector |
|---|---|---|---|---|
| `google_analytics_4` | `analytics.readonly` | GA4 properties (`accountSummaries`) | property id | yes |
| `search_console` | `webmasters.readonly` | verified sites (`sites`) | site URL / `sc-domain:` | yes |
| `google_my_business` | `business.manage` | locations per account | `accounts/…/locations/…` | yes |
| `youtube` | `youtube.readonly`, `yt-analytics.readonly` | your channels | channel id | yes |
| `facebook_ads` | `ads_read` | `/me/adaccounts` | `act_…` | yes |
| `facebook` | `pages_show_list`, `pages_read_engagement`, `read_insights` | `/me/accounts` | page id (+ Page token) | yes |
| `instagram_business` | + `instagram_basic`, `instagram_manage_insights` | Pages' linked IG accounts | IG account id (+ Page token) | yes |

Rules the implementation follows:

* **Gating** — a button is rendered only if `GOOGLE_CLIENT_ID` *and* `GOOGLE_CLIENT_SECRET` (resp. `META_APP_ID` and `META_APP_SECRET`) are set (`oauthAvailable()`); `/start` also refuses when they are missing. The manual form stays on the page either way.
* **State** — `signState()`: HS256 JWT, audience `oauth-state`, 10 min, carries `provider, companyId, projectId, slug, userId`. `/callback` requires a logged-in session of the same user and company with write access to the project.
* **Tokens** — Google: `access_type=offline&prompt=consent`; the exchange fails with a readable message if no refresh token came back or a requested permission was unticked. Meta: code → short-lived token → long-lived token (≈60 days); `expiresAt` is stored for information, there is no refresh. Pending tokens live in the `rr_oauth_pending` cookie (AES-256-GCM, 15 min, httpOnly) until the picker is submitted.
* **Finalize** — `finalizeSelection()` re-lists the accounts with the pending tokens, keeps only the ticked ones that are still accessible, then calls `connectIntegration()` (validation skipped — the listing just proved access) once per account. An account already connected to the project (same slug + sourceId) gets its credentials replaced instead of a duplicate row.
* **Not covered** — providers other than Google/Meta, Google Ads (needs a developer token) and Threads, Meta token refresh, revoking tokens at the provider when an integration is deleted, multiple integration kinds from a single consent. Request/response shapes follow the public API docs and have not been checked against live Google/Meta accounts.

## Going live: the credentials each live connector needs

Everything below is checked against the providers' docs (Oct 2026) and against local mock servers only (`tests/connectors-social.test.ts`, `tests/oauth.test.ts`); **none of it has run against a live account yet.** Expect to adjust once real responses arrive: a wrong metric name shows up as an error on that one widget, not on the whole report.

First, `APP_URL` in `.env` must be the address you actually open (e.g. `http://localhost:3104`). The OAuth redirect URIs are `APP_URL/api/oauth/google/callback` and `APP_URL/api/oauth/meta/callback`, and both providers compare them character for character.

### Google (YouTube, Business Profile, GA4, Search Console)

1. Google Cloud Console → create or pick a project → **APIs & Services → OAuth consent screen**. While the app is in *Testing*, add every Google account you will connect as a **test user**, and know that for an external app in *Testing* status Google issues refresh tokens that **expire in 7 days** (publish the app, or reconnect weekly).
2. **Credentials → Create OAuth client ID → Web application**; add the redirect URI above. Copy the client id and secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
3. **Library → enable** (one per source you will connect):

| Source | APIs to enable |
|---|---|
| YouTube | YouTube Analytics API, YouTube Data API v3 |
| Business Profile | **Business Profile Performance API**, My Business Account Management API, My Business Business Information API, and the legacy My Business API (v4, reviews) |
| GA4 | Google Analytics Data API, Google Analytics Admin API |
| Search Console | Google Search Console API |

4. **Business Profile needs Google's approval** before any of its APIs work (verified against Google's prerequisites page, Oct 2026). Submit *Application for Basic API Access* from an email that owns or manages the Profile. Google requires a **verified Business Profile that has been active for 60+ days and lists a website**, and an organization-level Google Cloud project. Until approval the project shows a quota of **0 QPM** (approved projects show 300 QPM): check *IAM & Admin → Quotas* for "Business Profile Performance API". This is the most likely blocker. The connector turns the failure into a readable message on connect, and an unapproved reviews endpoint only empties `rating` / `new_reviews`.
5. The Google account you connect must be able to read the data: owner/manager of the Business Profile location, owner/manager of the YouTube channel (a Brand Account channel is selected in Google's account chooser), a user on the GA4 property, a verified owner/user of the Search Console site.

### Meta (Facebook Page, Instagram, Meta Ads)

1. developers.facebook.com → **Create app** → add a Facebook login product with the valid OAuth redirect URI above. **Check which one Meta offers:** Meta's Instagram docs list *Facebook Login for Business*, and the connect flow (`oauth/providers.ts` `authUrl`) sends classic `scope=` permissions, not a Login-for-Business `config_id`. If Meta will only let the new app use Login for Business, `authUrl` needs a `config_id` (a small change; tell me when you see that screen). Also check whether Meta accepts an `http://localhost:3104` redirect URI in Development mode; if it insists on HTTPS, expose port 3104 through an HTTPS tunnel and set `APP_URL` to that address. Copy the app id and secret into `META_APP_ID` / `META_APP_SECRET`.
2. In **Development mode** only people with a role on the app (admin, developer, tester) can connect: add yourself and your testers. Live mode for other people's accounts needs App Review for the permissions below (and business verification for some).
3. Permissions the connect buttons request: Facebook Page `pages_show_list`, `pages_read_engagement`, `read_insights`; Instagram adds `instagram_basic`, `instagram_manage_insights`; Meta Ads `ads_read`.
4. The person connecting needs the right role on the asset: a Page role that includes *Analyze* for Page Insights; for Instagram, a **Business or Creator** account **linked to a Facebook Page** that the person manages.
5. Facebook Page insights need a Page with **100 or more likes/followers**; Instagram follower demographics need 100+ followers, and `follows_and_unfollows` style metrics are not requested.
6. Page and Instagram tokens are Page access tokens taken from `/me/accounts` with the long-lived user token. Meta has said such Page tokens do not expire, but that was **not re-checked against the current docs**: if a Page connection stops working, reconnect it. They also stop working if the person loses the Page role or changes their password. Meta Ads uses the long-lived user token itself (about 60 days, no refresh: reconnect).

**First thing to check if Instagram errors live:** the Meta connect picker stores the **Page** access token for Instagram accounts (`oauth/providers.ts`), and the Instagram docs list "User or Page access token" without saying which each insights call takes. If `/{ig-id}/insights` rejects the Page token, keep the user token as a second credential and let `instagram.ts` fall back to it.

### What the numbers are not (read before comparing with the platforms)

* **Facebook Page** — no demographics, link clicks or saves (Meta removed them); impressions and views both mean "media views"; comments/shares/post count are dated by publish day.
* **Instagram** — account insights go back about 90 days; no followers-online-by-hour; `new_followers` is the *net* daily change and `unfollows` is unavailable; audience charts are current followers.
* **YouTube** — no impressions or impressions click-through rate; views by age/gender are estimated from view shares; the subscriber series is rebuilt from today's count, which YouTube rounds down to 3 significant figures.
* **Business Profile** — search terms are monthly; `rating` is the current average on every day.

The same notes appear in each report's "About these numbers" box (`catalog/data-notes.ts`, English and Greek).

