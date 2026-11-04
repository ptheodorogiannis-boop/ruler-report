// Country matching for the map widget (docs/superpowers/specs/2026-11-04-map-search-ask-layout-design.md §1): connectors
// name countries differently (GA4 sends English names such as "Türkiye", Meta and WooCommerce alpha-2 codes, Search
// Console alpha-3 codes), and the world map is keyed by ISO numeric ids. Everything resolves to ISO alpha-2 here; a label
// that does not ("(not set)", "Other") returns null and the map lists it apart instead of dropping it.
import { COUNTRY_CODES } from './country-codes';

/** Names connectors return that neither the ISO table nor the CLDR names carry. */
const ALIASES: Record<string, string> = {
  'south korea': 'KR',
  'north korea': 'KP',
  russia: 'RU',
  vietnam: 'VN',
  laos: 'LA',
  iran: 'IR',
  syria: 'SY',
  moldova: 'MD',
  tanzania: 'TZ',
  bolivia: 'BO',
  venezuela: 'VE',
  brunei: 'BN',
  'cape verde': 'CV',
  'ivory coast': 'CI',
  macedonia: 'MK',
  swaziland: 'SZ',
  'the netherlands': 'NL',
  holland: 'NL',
  uk: 'GB',
  usa: 'US',
};

/** Lower case, no accents, "&" read as "and", single spaces: "  Türkiye " → "turkiye". */
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\s+/g, ' ')
    .trim();

const byLabel = new Map<string, string>();
const numeric = new Map<string, string>();
const english = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
for (const [a2, a3, num, ...names] of COUNTRY_CODES) {
  numeric.set(a2, num);
  for (const label of [a2, a3, ...names]) byLabel.set(norm(label), a2);
  const cldr = english?.of(a2);
  if (cldr && cldr !== a2) byLabel.set(norm(cldr), a2);
}
for (const [label, a2] of Object.entries(ALIASES)) byLabel.set(norm(label), a2);

/** ISO 3166-1 alpha-2 (upper case) for a connector's country label, or null when it names no country. */
export function toCountryCode(label: string): string | null {
  const key = norm(label ?? '');
  return key ? (byLabel.get(key) ?? null) : null;
}

/** The zero-padded ISO numeric id the world map uses ("300" for GR), or null for an unknown code. */
export function numericOf(code: string): string | null {
  return numeric.get(code.toUpperCase()) ?? null;
}

/** The country's name in `locale` (Intl.DisplayNames), the code itself when the runtime cannot name it. */
export function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}
