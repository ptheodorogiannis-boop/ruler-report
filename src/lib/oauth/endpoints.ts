// Provider endpoints used by the OAuth flows (and the Google token refresh in connectors/google.ts).
// A plain mutable object so tests can point it at a local mock server, and so a self-hoster behind a
// corporate proxy could override a host at boot.
const V = process.env.META_API_VERSION || 'v21.0';

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
  },
  meta: {
    dialog: `https://www.facebook.com/${V}/dialog/oauth`,
    graph: `https://graph.facebook.com/${V}`,
  },
};
