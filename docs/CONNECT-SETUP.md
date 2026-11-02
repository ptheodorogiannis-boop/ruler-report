# One sign-in for Google and Meta: the admin setup

Once these values are set, anyone in the workspace connects a client's accounts like this: open the project, choose
**Connect with Google** (or Meta), sign in, tick accounts. The sign-in covers Google Ads, Analytics, Search Console,
YouTube and Business Profile in one step, or Meta Ads, Facebook Pages and Instagram in the other. Nobody copies a
refresh token, a GA4 property ID or a customer ID.

This needs one Google Cloud OAuth client, one Google Ads developer token and one Meta app. The agency sets them up once.
Reportei has its own verified apps, which is why it needs no setup. A self-hosted copy needs its own.

Settings → System shows which of the three are set, with the exact redirect URIs to copy.

## Checklist

| What | Where | Environment variables |
|---|---|---|
| Google OAuth client (Web application) | Google Cloud Console → APIs & Services → Credentials | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Google Ads developer token | Google Ads → Tools → API Center, in the agency's manager (MCC) account | `GOOGLE_ADS_DEVELOPER_TOKEN` |
| Meta app (Business type, Facebook Login for Business) | developers.facebook.com → My Apps | `META_APP_ID`, `META_APP_SECRET`, optionally `META_LOGIN_CONFIG_ID` |

Redirect URIs, pasted into the Google client and the Meta app exactly as written (both providers compare them
character by character):

```
<APP_URL>/api/oauth/google/callback
<APP_URL>/api/oauth/meta/callback
```

Restart the server after setting the variables. On Vercel, set them in Project → Settings → Environment Variables and
redeploy.

## Google

1. Create the OAuth client and the consent screen as described in [CONNECTORS.md › Going live › Google](CONNECTORS.md#google-youtube-business-profile-ga4-search-console).
2. Enable these APIs on the same Google Cloud project: Google Ads API, Google Analytics Admin API, Google Analytics
   Data API, Google Search Console API, YouTube Data API v3, YouTube Analytics API, and the Business Profile APIs
   listed in CONNECTORS.md.
3. **Consent screen status.** While the app is in *Testing*, only listed test users can sign in and refresh tokens
   expire after 7 days. For clients, publish the app. Three of the scopes it asks for (`adwords`,
   `analytics.readonly`, `youtube.readonly`) are *sensitive*, so Google reviews the app before everyone can use it
   without a warning. Every step, from the domain to the demo video, is in [GOOGLE-VERIFICATION.md](GOOGLE-VERIFICATION.md).
4. **Google Ads developer token.** Apply in the API Center of the manager account. A *test* token only reaches test
   accounts. *Basic access* (granted after Google's review) is enough for reporting. Without a token the Google sign-in
   still works for the other four networks, and Google Ads shows a note instead of accounts.
5. **Business Profile** needs Google's separate approval before its APIs answer (0 requests per minute until then).
   The picker shows that error inside the Business Profile group only; the other networks still list.

Client accounts under the agency's manager account are found automatically: the picker lists them with the manager's
name, and every later call sends the manager's ID in the `login-customer-id` header.

## Meta

1. Create a **Business** app with **Facebook Login for Business** and add the redirect URI above
   ([CONNECTORS.md › Going live › Meta](CONNECTORS.md#meta-facebook-page-instagram-meta-ads)).
2. Login for Business apps define their permissions in a *configuration*. Create one with `ads_read`,
   `pages_show_list`, `pages_read_engagement`, `read_insights`, `instagram_basic`, `instagram_manage_insights` and
   `business_management`, and put its ID in `META_LOGIN_CONFIG_ID`. Without it the app sends classic `scope=`
   permissions, which older app types accept. `business_management` lists the Pages and ad accounts you reach through a
   Business Portfolio (owned and client assets); without it only the ones assigned to you directly appear. A business
   Page you can see but have no Page access to is shown greyed out with the reason: give yourself access to it in Meta
   Business settings and sign in again.
3. In Development mode only people with a role on the app can connect. For client accounts outside the agency's own
   business, request **advanced access** for those permissions through App Review.

## What the person signing in sees

1. A consent screen listing the networks. Unticking one drops only that network: the picker says it was not allowed
   and offers to sign in again.
2. The **accounts found** page: one group per network, a search box, already-connected accounts marked, and one button
   that adds every ticked account across every network.
3. Back on the project: how many accounts were added, and which network failed, if any.

## Testing on a Vercel preview

Every pushed branch gets a stable preview address, `https://ruler-report-git-<branch>-<scope>.vercel.app` (for the v4
branch: `https://ruler-report-git-v4-ptheodorogiannis-boop.vercel.app`). Without `APP_URL`, a preview uses that address
for its own links and redirect URIs, so:

1. Add the keys above in Vercel → Settings → Environment Variables with **Preview** ticked (or scoped to the branch),
   then redeploy the branch.
2. Add the preview's two redirect URIs to the Google OAuth client and the Meta app, next to the production ones:
   `https://ruler-report-git-v4-ptheodorogiannis-boop.vercel.app/api/oauth/google/callback` and
   `…/api/oauth/meta/callback`.
3. Open the preview while signed in to Vercel (previews are protected by Vercel Authentication by default).
4. Check which database the Preview environment uses: if it shares production's `DATABASE_URL`, accounts connected
   while testing land in the production data.

## Trying it without real accounts

`scripts/dev-mock.mjs` runs fake Google and Meta servers and a dev server wired to them, on its own port (3106),
build folder (`.next-mock`) and database copy (`prisma/mock.db`), so nothing touches real accounts or your dev data:

```bash
node scripts/dev-mock.mjs
```

Open http://localhost:3106, sign in with the demo account and use **Connect with Google** or **Connect with Meta** on
any project. The fake consent screens let you untick permissions. `MOCK_GBP_QUOTA=1` makes Business Profile answer
with the "not approved yet" quota error. The mock refuses to run inside a production build.

## Not covered

- Verified against Google's and Meta's public documentation and local mock servers only; no live account has signed
  in yet. Expect small adjustments when the first real responses arrive.
- Meta tokens last about 60 days and are not refreshed; reconnect when the integration says it is expiring.
- Tokens are not revoked at Google or Meta when an integration is deleted.
- A client who does not have a login to this tool cannot connect their own accounts yet; someone in the workspace
  signs in with an account that has access. An invite link for clients would be a separate feature.
