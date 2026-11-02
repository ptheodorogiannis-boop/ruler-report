# Letting any client sign in with Google and Meta

While the Google app is in *Testing*, only listed test users can sign in: everyone else gets "Access blocked … has not
completed the Google verification process, Error 403: access_denied". While the Meta app is *Unpublished*, only
people with a role on the app can sign in with Meta. Reportei has neither problem because its Google and Meta apps are
published and reviewed. This guide gets ours there.

Prepared 2 November 2026 for the production deployment of Ruler Reports (branch `main`, same code as `v4`), operated by
Ruler SMPC.

## Where it stands

| Done | What |
|---|---|
| yes | Public pages in the app: home `/`, privacy policy `/privacy`, terms `/terms` (`src/app/page.tsx`, `src/app/privacy`, `src/app/terms`), indexable, linked from each other |
| yes | Google consent screen branding: home page, privacy and terms links on `https://reports.ruler.agency`, authorized domain `ruler.agency` |
| yes | Google Data Access: all scopes the app requests are declared (list below) |
| yes | Google OAuth client: redirect URI `https://reports.ruler.agency/api/oauth/google/callback` added next to the preview one |
| yes | Meta app: app domain `reports.ruler.agency`, privacy and terms links, category *Business and pages*, redirect URI `https://reports.ruler.agency/api/oauth/meta/callback` |
| yes | v4 is production: `main` fast-forwarded to `v4`, `reports.ruler.agency` is a *Production* domain in Vercel (waiting for DNS) |
| yes | Vercel Production variables: `GOOGLE_CLIENT_ID`, `META_APP_ID`, `META_LOGIN_CONFIG_ID`, `APP_URL=https://reports.ruler.agency` |
| yes | Search Console: Domain property `ruler.agency` created, waiting for its DNS record |
| **you** | Add `GOOGLE_CLIENT_SECRET` and `META_APP_SECRET` for *Production* (below) |
| **you** | The two DNS records below |
| **you** | Steps 2 to 4 after DNS |

The legal texts are a working draft written from what the code does. Have them read by whoever handles Ruler SMPC's
legal matters before publishing. Who operates the app and the contact address come from `src/lib/legal.ts` and can be
overridden with `LEGAL_ENTITY` and `LEGAL_EMAIL`.

**Why production.** Preview deployments sit behind Vercel Authentication: anyone not signed in to your Vercel team
gets a Vercel login instead of the page (checked 2 November 2026, the v4 preview answers `302` to `vercel.com/sso-api`).
Google's reviewer, Meta's crawler and clients would all have hit it. Production domains stay public, so v4 was made
production on 2 November 2026. The v4 preview address keeps working for you, behind the login as before. Keep using
the `v4` branch for changes and fast-forward `main` when they should go live, or work on `main` directly.

**The two secrets for Production.** Vercel › Settings › Environment Variables › Add Environment Variable, type
*Secret*, environment *Production*: `GOOGLE_CLIENT_SECRET` and `META_APP_SECRET`, with the same values you pasted for
Preview. Vercel keeps production secrets separate, so they cannot be copied over. Production needs a new deployment
afterwards: redeploy the latest production deployment, or push any commit to `main`. Until then the production site
shows Google and Meta sign-in as not configured.

Check from a terminal with no cookies, once DNS is in; `200` means it is reachable:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://reports.ruler.agency/privacy
```

## 1. DNS records (at the ruler.agency DNS host)

ruler.agency's nameservers are `ns1.rulerhost.com` and `ns2.rulerhost.com`, so the records go in that DNS panel.

| Type | Name / host | Value | For |
|---|---|---|---|
| CNAME | `reports` | `a0c9448cb736e604.vercel-dns-017.com` | Vercel serves the app on reports.ruler.agency |
| TXT | `@` (ruler.agency itself) | `google-site-verification=YWseXWznAyo_dDRexi2rUMfRdylaBXmZPPuApdKz8Xg` | Proves to Google that our account owns ruler.agency |

- Keep the TXT record that is already there (`google-site-verification=GaPRN…`). It belongs to someone else's Search
  Console access to ruler.agency, and a domain can carry several. If you know who that is, they can instead add
  ptheodorogiannis@ruler.agency as an *Owner* of the ruler.agency property in Search Console, and then the TXT record
  above is not needed.
- `reports.ruler.agency` does not exist yet, so the CNAME changes nothing that runs today.

Check from any terminal:

```bash
nslookup reports.ruler.agency
```

```bash
nslookup -type=TXT ruler.agency
```

## 2. Confirm both, then point the app at the domain

1. **Search Console.** Open [Search Console](https://search.google.com/search-console), choose *Already started? finish
   verification* (or the pending ruler.agency property) and press **Verify**. The Google account must be the one that
   owns the Cloud project (ptheodorogiannis@ruler.agency).
2. **Vercel.** Project ruler-report › Settings › Domains: reports.ruler.agency turns to *Valid Configuration*. Press
   *Refresh* if it lags.
3. **APP_URL** is already `https://reports.ruler.agency` for Production. Sign-in on production therefore only works
   on reports.ruler.agency, not on ruler-report-pi.vercel.app, and links in e-mails point there too.
4. **Meta data deletion link.** Meta refused it while the domain did not answer. In the Meta app › App settings ›
   Basic › User data deletion, pick *Data deletion instructions URL* and enter
   `https://reports.ruler.agency/privacy#delete-data`, then Save changes and reload to check it stayed.
5. Open https://reports.ruler.agency/ signed out: the home page should show, with links to the privacy policy and the
   terms. Sign in, connect Google once on a test project, and check the sign-in comes back to reports.ruler.agency.

## 3. Google: publish and submit for verification

Google Cloud console › Google Auth Platform, project `ruler-reports`.

1. **Remove the vercel.app entries first.** Google only accepts a submission when every authorized domain is verified,
   and `ruler-report-git-v4-ptheodorogiannis-boop.vercel.app` cannot be. Once sign-in works on reports.ruler.agency,
   delete that domain under Branding › Authorized domains and its redirect URI under Clients › Ruler Reports web.
   Leave them until then: today's preview sign-in depends on them.
2. **Audience › Publish app** (moves it from Testing to In production). Ask before you press it if someone else
   manages the project.
3. **Verification Center › Prepare for verification.** Google re-checks the branding, then asks for the items below.
4. Submit. Google first verifies the brand (app name, logo if any, home page, domain), then reviews the sensitive
   scopes. The reviewer writes to the developer contact email (ptheodorogiannis@ruler.agency) and may ask follow-up
   questions there. Answer in that thread.

### Scopes the app requests

What each is used for is shared with the privacy policy table (`GOOGLE_SCOPE_USES` in `src/lib/legal.ts`).

| Scope | Google's class | Product |
|---|---|---|
| `openid`, `.../auth/userinfo.email` | non-sensitive | Shows which Google account a connection belongs to |
| `.../auth/webmasters.readonly` | non-sensitive | Search Console |
| `.../auth/yt-analytics.readonly` | non-sensitive | YouTube Analytics |
| `.../auth/business.manage` | non-sensitive in the console | Business Profile |
| `.../auth/analytics.readonly` | **sensitive** | Google Analytics |
| `.../auth/adwords` | **sensitive** | Google Ads |
| `.../auth/youtube.readonly` | **sensitive** | YouTube |

None is *restricted*, so no third-party security assessment is needed.

### Justification text (paste per sensitive scope)

- **analytics.readonly.** "Ruler Reports is a reporting tool used by the agency Ruler SMPC for its clients. After the
  user connects Google, the app lists the Google Analytics properties the user can access, the user picks the ones to
  connect, and the app reads report data (sessions, users, key events, revenue, channels, pages) to show it in the
  client's reports and dashboards. Read-only; nothing is written to Analytics. This is the narrowest scope that allows
  running reports."
- **adwords.** "The app lists the Google Ads accounts the user can access (including client accounts under the
  agency's manager account) and reads campaign, ad group and ad performance (impressions, clicks, cost, conversions)
  for reports and dashboards. The Google Ads API offers no read-only scope, so this scope is required; the app only
  sends search (GAQL) requests and never creates, changes or pauses anything."
- **youtube.readonly.** "The app lists the YouTube channels the user manages so they can choose which to report on,
  and reads the channel's public details (title, subscriber count, videos) to label and complete the YouTube Analytics
  report. Read-only."

### Demo video (unlisted YouTube link)

Google wants one continuous screen recording, in English, of the real app on reports.ruler.agency. About 3 minutes:

1. The browser address bar on `https://reports.ruler.agency/` signed out: the home page, then the privacy policy link.
2. Sign in to Ruler Reports. Open a project › Connect › **Connect with Google**.
3. On Google's consent screen, show the app name *Ruler Reports*, then click into the address bar so the `client_id`
   in the URL is readable. Grant the permissions.
4. The *accounts found* page: Google Ads accounts, Analytics properties, Search Console sites, YouTube channels.
   Pick some and connect.
5. For each sensitive scope, show where its data appears: a report block with Google Ads campaign figures, one with
   Analytics sessions and channels, one with the YouTube channel.
6. Remove one connected account in the app and show it is gone, then show myaccount.google.com/permissions where
   access can be withdrawn.

### Until Google has verified the app

- **Testing mode, as now.** Add each client's Google email under Audience › Test users (100 at most). They can sign
  in, but their connection must be renewed every 7 days because Google expires refresh tokens in Testing.
- **Published but not yet verified.** Sign-in works for anyone, but they first see "Google hasn't verified this app"
  and must click *Advanced › Go to Ruler Reports*. Google caps an unverified app at 100 users.
- Verification removes both limits. Brand checks usually take a few business days, the sensitive-scope review longer.
  Answering the reviewer's emails quickly is what shortens it.

### Google Ads specifically

Google Ads data also needs a developer token: apply in the agency manager account's API Center and set
`GOOGLE_ADS_DEVELOPER_TOKEN` in Vercel. *Basic access* is enough for reporting. This is a separate review from the
OAuth verification and can run at the same time.

## 4. Meta: go live

Meta for Developers › app *Ruler Reports* (1124258923391079).

1. **Business verification.** Verify Ruler SMPC in Meta Business Suite › Business settings › Security center, with the
   company's documents. App Review for business permissions requires it.
2. **App Review.** Request *Advanced access* for each permission the app uses, each with a short description and a
   screencast like the Google one: `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`,
   `read_insights`, `instagram_basic`, `instagram_manage_insights`. Meta may also ask for *access verification*,
   since the app reads other businesses' Pages and ad accounts.
3. **Publish** the app once the permissions are approved. Until then, only people with a role on the app (App roles ›
   Roles) can sign in with Meta.

## 5. Keep it true

The privacy policy states what the code does. When a connector starts reading something new, or a new processor sees
the data, update `src/app/privacy/page.tsx`, the date in `src/lib/legal.ts`, and `GOOGLE_SCOPE_USES`. The test
`tests/legal.test.ts` fails if the app requests a Google scope the policy does not explain.
