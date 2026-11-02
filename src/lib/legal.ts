// Who runs this installation, for the public home page, the privacy policy and the terms. Google's OAuth verification
// asks for all three on a domain the operator owns (docs/GOOGLE-VERIFICATION.md). Overridable per installation.
export const LEGAL = {
  product: 'Ruler Reports',
  entity: process.env.LEGAL_ENTITY || 'Ruler SMPC',
  email: process.env.LEGAL_EMAIL || 'ptheodorogiannis@ruler.agency',
  updated: '2 November 2026',
  authority: { name: 'Hellenic Data Protection Authority', url: 'https://www.dpa.gr' },
};

/** What each Google permission is used for: the privacy policy table and the verification guide share this. */
export const GOOGLE_SCOPE_USES: { scope: string; product: string; reads: string }[] = [
  { scope: 'https://www.googleapis.com/auth/adwords', product: 'Google Ads', reads: 'Campaign, ad group and ad performance (impressions, clicks, cost, conversions) and the list of accounts you can access, to show them in reports. Nothing is created, changed or paused.' },
  { scope: 'https://www.googleapis.com/auth/analytics.readonly', product: 'Google Analytics', reads: 'The properties you can access and their report data (sessions, users, key events, revenue, channels, pages, products).' },
  { scope: 'https://www.googleapis.com/auth/webmasters.readonly', product: 'Google Search Console', reads: 'The sites you can access and their search performance (clicks, impressions, click-through rate, position by query, page, country and device).' },
  { scope: 'https://www.googleapis.com/auth/youtube.readonly', product: 'YouTube', reads: 'The channels you manage and their public details (title, subscriber count, videos).' },
  { scope: 'https://www.googleapis.com/auth/yt-analytics.readonly', product: 'YouTube Analytics', reads: 'Channel and video analytics (views, watch time, subscribers gained, audience age and gender).' },
  { scope: 'https://www.googleapis.com/auth/business.manage', product: 'Google Business Profile', reads: 'The locations you manage and their performance (searches, map views, calls, direction requests) and reviews. Nothing is posted, replied to or edited.' },
];
