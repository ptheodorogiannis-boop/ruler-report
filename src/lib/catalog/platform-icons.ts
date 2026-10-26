// Brand marks for the integration catalog (spec §4). Paths come from simple-icons (CC0); brands the set does not carry
// (LinkedIn, Microsoft, Amazon, most Brazilian tools) get a lettermark in the platform colour, and generic sources
// (uploads, APIs, calls) a glyph by category. Only named imports: the whole set is several megabytes.
import type { Category } from './integrations';
import {
  siApple,
  siBigcommerce,
  siBrevo,
  siFacebook,
  siGoogle,
  siGoogleads,
  siGoogleanalytics,
  siGooglesearchconsole,
  siGooglesheets,
  siHubspot,
  siIfood,
  siInstagram,
  siMailchimp,
  siMake,
  siMatomo,
  siMeta,
  siN8n,
  siPinterest,
  siPlausibleanalytics,
  siPrestashop,
  siReddit,
  siSalesforce,
  siShopify,
  siSnapchat,
  siSpotify,
  siStripe,
  siThreads,
  siTiktok,
  siWoocommerce,
  siX,
  siYoutube,
  siZapier,
  siZoho,
} from 'simple-icons';

type Icon = { title: string; hex: string; path: string };

const ICONS: Record<string, Icon> = {
  facebook: siFacebook,
  instagram_business: siInstagram,
  youtube: siYoutube,
  tiktok: siTiktok,
  pinterest: siPinterest,
  threads: siThreads,
  twitter: siX,
  facebook_ads: siMeta,
  google_adwords: siGoogleads,
  tiktok_ads: siTiktok,
  pinterest_ads: siPinterest,
  twitter_ads: siX,
  spotify_ads: siSpotify,
  snapchat_ads: siSnapchat,
  reddit_ads: siReddit,
  apple_search_ads: siApple,
  google_analytics_4: siGoogleanalytics,
  search_console: siGooglesearchconsole,
  google_my_business: siGoogle,
  matomo: siMatomo,
  plausible: siPlausibleanalytics,
  hubspot_crm: siHubspot,
  salesforce: siSalesforce,
  zoho_crm: siZoho,
  mailchimp: siMailchimp,
  brevo: siBrevo,
  shopify: siShopify,
  woo_commerce: siWoocommerce,
  ifood: siIfood,
  stripe: siStripe,
  bigcommerce: siBigcommerce,
  prestashop: siPrestashop,
  google_sheets: siGooglesheets,
  make: siMake,
  n8n: siN8n,
  zapier: siZapier,
};

/** The brand mark for an integration slug, or null when the set has none (then a lettermark or a category glyph is drawn). */
export function platformIcon(slug: string): Icon | null {
  const i = ICONS[slug];
  return i ? { title: i.title, hex: i.hex, path: i.path } : null;
}

export type Glyph = 'table' | 'phone' | 'plug' | 'mail' | 'cart';

/** Generic sources have no brand: a small glyph by category. */
export function fallbackGlyph(category: Category): Glyph {
  switch (category) {
    case 'custom':
      return 'table';
    case 'calls':
      return 'phone';
    case 'email':
      return 'mail';
    case 'ecommerce':
      return 'cart';
    default:
      return 'plug';
  }
}

/** Two letters for a brand the icon set does not carry: the brand word, not the product qualifier ("LinkedIn Ads" → "Li", "RD Station CRM" → "RD"). */
const QUALIFIERS = new Set(['page', 'ads', 'crm', 'marketing', 'business', 'profile', 'web', 'api', 'pro', 'app', 'analytics']);
export function lettermark(name: string): string {
  const words = name
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const brand = words.filter((w) => !QUALIFIERS.has(w.toLowerCase()));
  const list = brand.length ? brand : words;
  if (!list.length) return '?';
  const letters = (w: string) => w.replace(/[^\p{L}\p{N}]/gu, '');
  const first = letters(list[0]);
  if (first.length <= 3 && first === first.toUpperCase() && /\p{L}/u.test(first)) return first;
  if (list.length === 1) return first.slice(0, 2) || '?';
  return first[0] + (letters(list[1])[0] ?? '') || first.slice(0, 2);
}
