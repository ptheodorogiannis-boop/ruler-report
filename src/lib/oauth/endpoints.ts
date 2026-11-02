// Provider endpoints used by the OAuth flows (and the Google token refresh in connectors/google.ts).
// A plain mutable object so tests can point it at a local mock server, and so a self-hoster behind a
// corporate proxy could override a host at boot.
//
// API versions (checked 2026-11-02): Graph / Marketing API v26.0 is the latest (July 2026); Google Ads API v26
// (October 2026). Both are overridable without a code change.
export const META_API_VERSION = process.env.META_API_VERSION || 'v26.0';
export const GOOGLE_ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v26';
const V = META_API_VERSION;

export const endpoints = {
  google: {
    auth: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    analyticsAdmin: 'https://analyticsadmin.googleapis.com/v1beta',
    searchConsole: 'https://www.googleapis.com/webmasters/v3',
    businessAccounts: 'https://mybusinessaccountmanagement.googleapis.com/v1',
    businessInfo: 'https://mybusinessbusinessinformation.googleapis.com/v1',
    youtube: 'https://www.googleapis.com/youtube/v3',
    youtubeAnalytics: 'https://youtubeanalytics.googleapis.com/v2',
    businessPerformance: 'https://businessprofileperformance.googleapis.com/v1',
    businessReviews: 'https://mybusiness.googleapis.com/v4',
    ads: `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`,
  },
  meta: {
    dialog: `https://www.facebook.com/${V}/dialog/oauth`,
    graph: `https://graph.facebook.com/${V}`,
  },
};

/**
 * Local-only switch for clicking through the whole connect flow without real Google or Meta accounts:
 * `OAUTH_MOCK_BASE=http://localhost:3198` points every host above at `scripts/mock-providers.mjs`.
 * Refused in production builds so it can never ship by accident.
 */
const mock = process.env.OAUTH_MOCK_BASE;
if (mock && process.env.NODE_ENV !== 'production') {
  const b = mock.replace(/\/$/, '');
  Object.assign(endpoints.google, {
    auth: `${b}/g/auth`,
    token: `${b}/g/token`,
    analyticsAdmin: `${b}/g/ga`,
    searchConsole: `${b}/g/gsc`,
    businessAccounts: `${b}/g/gbp-acc`,
    businessInfo: `${b}/g/gbp-info`,
    youtube: `${b}/g/yt`,
    youtubeAnalytics: `${b}/g/yta`,
    businessPerformance: `${b}/g/gbp-perf`,
    businessReviews: `${b}/g/gbp-rev`,
    ads: `${b}/g/ads`,
  });
  Object.assign(endpoints.meta, { dialog: `${b}/m/dialog`, graph: `${b}/m` });
}
