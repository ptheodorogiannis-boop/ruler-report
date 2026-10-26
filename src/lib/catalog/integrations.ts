// Integration catalog. Slugs that exist in Reportei keep the same slug (docs/EVIDENCE.md §9) so
// templates, API clients and Make/Zapier scenarios written for Reportei map 1:1.
// `connector` says how data is fetched:
//   meta | ga4 | gsc | woo | sheets | csv | rest | ingest | facebook | instagram | youtube | gbp  → real connector code in src/lib/connectors
//   demo                                                   → deterministic synthetic data until a real connector is written

export type Category = 'social' | 'ads' | 'analytics' | 'seo' | 'crm' | 'email' | 'ecommerce' | 'local' | 'calls' | 'custom';
export type ConnectorId = 'demo' | 'meta' | 'ga4' | 'gsc' | 'woo' | 'sheets' | 'csv' | 'rest' | 'ingest' | 'facebook' | 'instagram' | 'youtube' | 'gbp';
export type AuthKind = 'oauth_google' | 'oauth_meta' | 'api_key' | 'basic' | 'token' | 'url' | 'none';

export interface IntegrationDef {
  slug: string;
  name: string;
  category: Category;
  archetype: string; // key of ARCHETYPES, or 'custom'
  prefix: string; // reference_key prefix
  connector: ConnectorId;
  auth: AuthKind;
  color: string;
  /** fields the connect form asks for (credentials + sourceId hint) */
  fields?: { name: string; label: string; secret?: boolean; placeholder?: string; help?: string }[];
  sourceIdLabel?: string;
  currency?: boolean;
  /** present in Reportei's public list? false = our extension */
  inReportei: boolean;
  region?: string;
}

const d = (
  slug: string,
  name: string,
  category: Category,
  archetype: string,
  prefix: string,
  connector: ConnectorId,
  auth: AuthKind,
  color: string,
  inReportei = true,
  extra: Partial<IntegrationDef> = {}
): IntegrationDef => ({ slug, name, category, archetype, prefix, connector, auth, color, inReportei, ...extra });

const TOKEN = [{ name: 'accessToken', label: 'Access token', secret: true }];
const APIKEY = [{ name: 'apiKey', label: 'API key', secret: true }];

/** Ads accounts carry campaigns (spec v3 §2); the category the catalog uses for them. */
export const ADS_CATEGORY: Category = 'ads';

export const INTEGRATIONS: IntegrationDef[] = [
  // ── Organic social
  d('facebook', 'Facebook Page', 'social', 'social', 'fb', 'facebook', 'oauth_meta', '#1877f2', true, {
    sourceIdLabel: 'Page ID',
    fields: [{ name: 'accessToken', label: 'Page access token', secret: true, help: 'A Page access token with pages_read_engagement and read_insights (Graph API Explorer: choose the Page, then copy its token)' }],
  }),
  d('instagram_business', 'Instagram Business', 'social', 'social', 'ig', 'instagram', 'oauth_meta', '#e1306c', true, {
    sourceIdLabel: 'Instagram account ID',
    fields: [{ name: 'accessToken', label: 'Access token', secret: true, help: 'The linked Page access token (or a user token) with instagram_basic, instagram_manage_insights and pages_read_engagement' }],
  }),
  d('youtube', 'YouTube', 'social', 'video', 'yt', 'youtube', 'oauth_google', '#ff0000', true, { sourceIdLabel: 'Channel ID' }),
  d('linkedin', 'LinkedIn Page', 'social', 'social', 'li', 'demo', 'token', '#0a66c2', true, { sourceIdLabel: 'Organization ID', fields: TOKEN }),
  d('tiktok', 'TikTok', 'social', 'social', 'tt', 'demo', 'token', '#111111', true, { fields: TOKEN }),
  d('pinterest', 'Pinterest', 'social', 'social', 'pin', 'demo', 'token', '#e60023', true, { fields: TOKEN }),
  d('threads', 'Threads', 'social', 'social', 'thr', 'demo', 'oauth_meta', '#000000', true),
  d('twitter', 'X (Twitter)', 'social', 'social', 'x', 'demo', 'token', '#0f1419', true, { fields: TOKEN }),
  // ── Paid media
  d('facebook_ads', 'Meta Ads', 'ads', 'ads', 'fb_ads', 'meta', 'oauth_meta', '#0668e1', true, {
    sourceIdLabel: 'Ad account ID (act_…)',
    currency: true,
    fields: [{ name: 'accessToken', label: 'Marketing API access token', secret: true, help: 'System-user token with ads_read' }],
  }),
  d('google_adwords', 'Google Ads', 'ads', 'ads', 'gads', 'demo', 'oauth_google', '#4285f4', true, { sourceIdLabel: 'Customer ID', currency: true }),
  d('tiktok_ads', 'TikTok Ads', 'ads', 'ads', 'tt_ads', 'demo', 'token', '#010101', true, { currency: true, fields: TOKEN }),
  d('linkedin_ads', 'LinkedIn Ads', 'ads', 'ads', 'li_ads', 'demo', 'token', '#0a66c2', true, { currency: true, fields: TOKEN }),
  d('pinterest_ads', 'Pinterest Ads', 'ads', 'ads', 'pin_ads', 'demo', 'token', '#e60023', true, { currency: true, fields: TOKEN }),
  d('microsoft_ads', 'Microsoft Ads', 'ads', 'ads', 'ms_ads', 'demo', 'token', '#00a4ef', true, { currency: true, fields: TOKEN }),
  d('twitter_ads', 'X Ads', 'ads', 'ads', 'x_ads', 'demo', 'token', '#0f1419', true, { currency: true, fields: TOKEN }),
  d('spotify_ads', 'Spotify Ads', 'ads', 'ads', 'sp_ads', 'demo', 'token', '#1db954', true, { currency: true, fields: TOKEN }),
  d('kwai_ads', 'Kwai Ads', 'ads', 'ads', 'kwai_ads', 'demo', 'token', '#ff5000', true, { currency: true, fields: TOKEN }),
  d('snapchat_ads', 'Snapchat Ads', 'ads', 'ads', 'snap_ads', 'demo', 'token', '#fffc00', false, { currency: true, fields: TOKEN }),
  d('reddit_ads', 'Reddit Ads', 'ads', 'ads', 'rd_ads', 'demo', 'token', '#ff4500', false, { currency: true, fields: TOKEN }),
  d('amazon_ads', 'Amazon Ads', 'ads', 'ads', 'amz_ads', 'demo', 'token', '#ff9900', false, { currency: true, fields: TOKEN }),
  d('apple_search_ads', 'Apple Ads', 'ads', 'ads', 'apple_ads', 'demo', 'token', '#555555', false, { currency: true, fields: TOKEN }),
  // ── Analytics & search
  d('google_analytics_4', 'Google Analytics 4', 'analytics', 'web', 'ga4', 'ga4', 'oauth_google', '#e37400', true, { sourceIdLabel: 'GA4 property ID', currency: true }),
  d('search_console', 'Google Search Console', 'seo', 'seo', 'gsc', 'gsc', 'oauth_google', '#458cf5', true, { sourceIdLabel: 'Site URL (https://… or sc-domain:…)' }),
  d('google_my_business', 'Google Business Profile', 'local', 'local', 'gbp', 'gbp', 'oauth_google', '#34a853', true, { sourceIdLabel: 'Location (accounts/…/locations/…)' }),
  d('matomo', 'Matomo', 'analytics', 'web', 'matomo', 'demo', 'token', '#3152a0', false, { fields: [{ name: 'baseUrl', label: 'Matomo URL' }, { name: 'tokenAuth', label: 'token_auth', secret: true }] }),
  d('plausible', 'Plausible', 'analytics', 'web', 'plausible', 'demo', 'api_key', '#5850ec', false, { fields: APIKEY, sourceIdLabel: 'Site domain' }),
  d('ruler_attribution', 'Ruler Attribution', 'analytics', 'web', 'ruler_attr', 'demo', 'api_key', '#4f46e5', false, { fields: [{ name: 'baseUrl', label: 'Attribution server URL' }, ...APIKEY] }),
  // ── CRM
  d('hubspot_crm', 'HubSpot CRM', 'crm', 'crm', 'hs', 'demo', 'token', '#ff7a59', true, { fields: [{ name: 'accessToken', label: 'Private app token', secret: true }] }),
  d('pipedrive', 'Pipedrive', 'crm', 'crm', 'pd', 'demo', 'api_key', '#017737', true, { fields: APIKEY }),
  d('rd_station_crm', 'RD Station CRM', 'crm', 'crm', 'rdcrm', 'demo', 'token', '#0c2eff', true, { fields: TOKEN }),
  d('kommo', 'Kommo', 'crm', 'crm', 'kommo', 'demo', 'token', '#0a56d8', true, { fields: TOKEN }),
  d('gohighlevel', 'GoHighLevel', 'crm', 'crm', 'ghl', 'demo', 'token', '#1fa2ff', true, { fields: TOKEN }),
  d('activecampaign', 'ActiveCampaign', 'crm', 'crm', 'ac', 'demo', 'api_key', '#356ae6', true, { fields: [{ name: 'baseUrl', label: 'Account URL' }, ...APIKEY] }),
  d('salesforce', 'Salesforce', 'crm', 'crm', 'sf', 'demo', 'token', '#00a1e0', false, { fields: TOKEN }),
  d('zoho_crm', 'Zoho CRM', 'crm', 'crm', 'zoho', 'demo', 'token', '#e42527', false, { fields: TOKEN }),
  // ── Email
  d('mailchimp', 'Mailchimp', 'email', 'email', 'mc', 'demo', 'api_key', '#ffe01b', true, { fields: APIKEY }),
  d('rd_station_marketing', 'RD Station Marketing', 'email', 'email', 'rdm', 'demo', 'token', '#0c2eff', true, { fields: TOKEN }),
  d('egoi', 'E-goi', 'email', 'email', 'egoi', 'demo', 'api_key', '#0099ff', true, { fields: APIKEY }),
  d('klaviyo', 'Klaviyo', 'email', 'email', 'klaviyo', 'demo', 'api_key', '#1d1d1d', false, { fields: APIKEY }),
  d('omnisend', 'Omnisend', 'email', 'email', 'omni', 'demo', 'api_key', '#6c4fff', false, { fields: APIKEY }),
  d('brevo', 'Brevo', 'email', 'email', 'brevo', 'demo', 'api_key', '#0b996e', false, { fields: APIKEY }),
  d('greatpages', 'GreatPages', 'email', 'crm', 'gp', 'demo', 'token', '#00c389', true, { fields: TOKEN }),
  // ── E-commerce & sales
  d('shopify', 'Shopify', 'ecommerce', 'ecom', 'shop', 'demo', 'token', '#95bf47', true, { currency: true, sourceIdLabel: 'Shop domain (xxx.myshopify.com)', fields: [{ name: 'accessToken', label: 'Admin API access token', secret: true }] }),
  d('woo_commerce', 'WooCommerce', 'ecommerce', 'ecom', 'woo', 'woo', 'basic', '#7f54b3', true, {
    currency: true,
    sourceIdLabel: 'Store URL',
    fields: [{ name: 'consumerKey', label: 'Consumer key', secret: true }, { name: 'consumerSecret', label: 'Consumer secret', secret: true }],
  }),
  d('nuvemshop', 'Nuvemshop', 'ecommerce', 'ecom', 'nuvem', 'demo', 'token', '#2d6cdf', true, { currency: true, fields: TOKEN }),
  d('magazord', 'Magazord', 'ecommerce', 'ecom', 'magazord', 'demo', 'basic', '#ff6b00', true, { currency: true }),
  d('olist', 'Olist', 'ecommerce', 'ecom', 'olist', 'demo', 'token', '#0a5cff', true, { currency: true, fields: TOKEN }),
  d('hotmart', 'Hotmart', 'ecommerce', 'ecom', 'hotmart', 'demo', 'token', '#f04e23', true, { currency: true, fields: TOKEN }),
  d('kiwify', 'Kiwify', 'ecommerce', 'ecom', 'kiwify', 'demo', 'token', '#16a34a', true, { currency: true, fields: TOKEN }),
  d('eduzz', 'Eduzz', 'ecommerce', 'ecom', 'eduzz', 'demo', 'token', '#f5a623', true, { currency: true, fields: TOKEN }),
  d('ifood', 'iFood', 'ecommerce', 'ecom', 'ifood', 'demo', 'token', '#ea1d2c', true, { currency: true, fields: TOKEN }),
  d('cardapio_web', 'Cardápio Web', 'ecommerce', 'ecom', 'cardapio', 'demo', 'token', '#00a859', true, { currency: true, fields: TOKEN }),
  d('repediu', 'Repediu', 'ecommerce', 'ecom', 'repediu', 'demo', 'token', '#ff3d00', true, { currency: true, fields: TOKEN }),
  d('stripe', 'Stripe', 'ecommerce', 'ecom', 'stripe', 'demo', 'api_key', '#635bff', false, { currency: true, fields: [{ name: 'apiKey', label: 'Restricted key (rk_…)', secret: true }] }),
  d('bigcommerce', 'BigCommerce', 'ecommerce', 'ecom', 'bc', 'demo', 'token', '#34313f', false, { currency: true, fields: TOKEN }),
  d('prestashop', 'PrestaShop', 'ecommerce', 'ecom', 'presta', 'demo', 'api_key', '#df0067', false, { currency: true, fields: APIKEY }),
  // ── Call tracking
  d('phonetrack', 'Phonetrack', 'calls', 'calls', 'phonetrack', 'demo', 'token', '#0ea5e9', true, { fields: TOKEN }),
  d('callrail', 'CallRail', 'calls', 'calls', 'callrail', 'demo', 'api_key', '#1f6feb', false, { fields: APIKEY }),
  d('ruler_click_to_call', 'Ruler Click-to-Call', 'calls', 'calls', 'r2c', 'demo', 'api_key', '#4f46e5', false, { fields: [{ name: 'baseUrl', label: 'Tracker URL' }, ...APIKEY] }),
  // ── Custom data & automation platforms
  d('google_sheets', 'Google Sheets', 'custom', 'custom', 'sheet', 'sheets', 'url', '#0f9d58', true, { sourceIdLabel: 'spreadsheetId|||gid|||tab name' }),
  d('csv_url', 'CSV / TSV URL', 'custom', 'custom', 'csv', 'csv', 'url', '#64748b', false, { sourceIdLabel: 'CSV URL' }),
  d('rest_api', 'REST / JSON API', 'custom', 'custom', 'rest', 'rest', 'url', '#0891b2', false, { sourceIdLabel: 'JSON URL' }),
  d('webhook_ingest', 'Push API (webhook ingest)', 'custom', 'custom', 'push', 'ingest', 'none', '#9333ea', false, { sourceIdLabel: 'Source name' }),
  d('make', 'Make', 'custom', 'custom', 'make', 'ingest', 'none', '#6d00cc', true),
  d('n8n', 'n8n', 'custom', 'custom', 'n8n', 'ingest', 'none', '#ea4b71', true),
  d('zapier', 'Zapier', 'custom', 'custom', 'zap', 'ingest', 'none', '#ff4a00', true),
  d('pluga', 'Pluga', 'custom', 'custom', 'pluga', 'ingest', 'none', '#00b8a9', true),
];

const BY_SLUG = new Map(INTEGRATIONS.map((i) => [i.slug, i]));
export const getIntegrationDef = (slug: string) => BY_SLUG.get(slug);
export const CATEGORY_LABEL: Record<Category, string> = {
  social: 'Organic social',
  ads: 'Paid media',
  analytics: 'Web analytics',
  seo: 'Search / SEO',
  crm: 'CRM & leads',
  email: 'Email marketing',
  ecommerce: 'E-commerce & sales',
  local: 'Local',
  calls: 'Call tracking',
  custom: 'Custom data & automation',
};
/** True for slugs whose accounts have campaigns (Meta Ads, Google Ads, TikTok Ads…). */
export function isAdsSlug(slug: string): boolean {
  return getIntegrationDef(slug)?.category === ADS_CATEGORY;
}
