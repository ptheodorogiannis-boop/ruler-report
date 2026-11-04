// Variables in text cards (competitor research: AgencyAnalytics' dynamic variables, Reportei's message tokens). A template's
// commentary stays right every month and for every client: {client}, {report}, {period}, {period_start}, {period_end},
// {comparison}, and live metrics written like formulas, {fb_ads:spend} (the sum over the report's accounts of that
// platform) or {12:spend} (one account), with .change (the percentage against the comparison) or .previous. Pure: the
// engine asks `tokenRefs` what to fetch, compose fills the text with `applyTokens`.

export const TEXT_VARS = ['client', 'report', 'period', 'period_start', 'period_end', 'comparison'] as const;
export type TextVar = (typeof TEXT_VARS)[number];
export interface MetricToken {
  /** a platform prefix (fb_ads) or an account id ("12") */
  prefix: string;
  key: string;
  part: 'value' | 'change' | 'previous';
}

const TOKEN = /\{([a-z0-9_]+(?::[a-z0-9_]+(?:\.(?:change|previous))?)?)\}/gi;

/** Every metric token in a text, in order of first appearance, without repeats. */
export function tokenRefs(text: string | undefined): MetricToken[] {
  if (!text) return [];
  const out: MetricToken[] = [];
  for (const m of text.matchAll(TOKEN)) {
    const parsed = parseToken(m[1]);
    if (parsed && typeof parsed !== 'string' && !out.some((o) => o.prefix === parsed.prefix && o.key === parsed.key && o.part === parsed.part)) out.push(parsed);
  }
  return out;
}

/** "client" → the variable; "fb_ads:spend.change" → a metric token; anything else → null (left as typed). */
export function parseToken(body: string): TextVar | MetricToken | null {
  const lower = body.toLowerCase();
  if ((TEXT_VARS as readonly string[]).includes(lower)) return lower as TextVar;
  const m = lower.match(/^([a-z0-9_]+):([a-z0-9_]+)(?:\.(change|previous))?$/);
  if (!m) return null;
  return { prefix: m[1], key: m[2], part: (m[3] as MetricToken['part']) ?? 'value' };
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Replace every token the resolver knows (HTML-escaped); unknown tokens stay as typed, so a typo is visible, not blank. */
export function applyTokens(text: string, resolve: (token: TextVar | MetricToken) => string | null | undefined): string {
  return text.replace(TOKEN, (whole, body: string) => {
    const t = parseToken(body);
    if (!t) return whole;
    const v = resolve(t);
    return v == null ? whole : escape(v);
  });
}
