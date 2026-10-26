// Campaign scope (spec v3 §2.2): which campaigns of an ads account a block or a report uses — all, a picked list, or a
// name rule. Pure and browser-safe (the editor's block gear and the wizard import it), so no node:crypto here.
import { z } from 'zod';
import type { Campaign } from './types';

export interface CampaignRule {
  op: 'contains' | 'not_contains';
  text: string;
}
export type CampaignScope = { mode: 'all' } | { mode: 'pick'; ids: string[] } | { mode: 'rule'; rules: CampaignRule[] };

export const scopeSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('all') }),
  z.object({ mode: z.literal('pick'), ids: z.array(z.string().min(1).max(80)).min(1).max(200) }),
  z.object({
    mode: z.literal('rule'),
    rules: z.array(z.object({ op: z.enum(['contains', 'not_contains']), text: z.string().trim().min(1).max(120) })).min(1).max(10),
  }),
]);

/** The campaigns a scope keeps: `pick` in the listed order (unknown ids dropped), `rule` case-insensitive and ANDed. */
export function applyScope(campaigns: Campaign[], scope?: CampaignScope): Campaign[] {
  if (!scope || scope.mode === 'all') return campaigns;
  if (scope.mode === 'pick') return scope.ids.map((id) => campaigns.find((c) => c.id === id)).filter((c): c is Campaign => !!c);
  return campaigns.filter((c) =>
    scope.rules.every((r) => {
      const has = c.name.toLowerCase().includes(r.text.toLowerCase());
      return r.op === 'contains' ? has : !has;
    }),
  );
}

/** The account's default scope (`config.campaigns`), or undefined when none or malformed. */
export function campaignScopeOf(row: { config: unknown }): CampaignScope | undefined {
  const raw = (row.config as Record<string, unknown> | null)?.campaigns;
  if (!raw) return undefined;
  const r = scopeSchema.safeParse(raw);
  return r.success ? r.data : undefined;
}

/** Ids to filter by; undefined means "no filter" (all). */
export function scopeIds(scope: CampaignScope | undefined, campaigns: Campaign[]): string[] | undefined {
  if (!scope || scope.mode === 'all') return undefined;
  return applyScope(campaigns, scope).map((c) => c.id);
}

/** 32-bit FNV-1a as 8 hex chars: enough to keep two scopes of one account apart in store keys. */
export function hashText(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** '' for all/undefined, else a stable 8-hex digest of the canonical scope. */
export function scopeHash(scope?: CampaignScope): string {
  if (!scope || scope.mode === 'all') return '';
  const canon = scope.mode === 'pick' ? `pick:${scope.ids.join(',')}` : `rule:${scope.rules.map((r) => `${r.op}=${r.text.trim().toLowerCase()}`).join('&')}`;
  return hashText(canon);
}

/** The label when the campaign names are not at hand (list rows): counts only. */
export function scopeSummary(scope?: CampaignScope): string {
  if (!scope || scope.mode === 'all') return 'All campaigns';
  if (scope.mode === 'pick') return `${scope.ids.length} ${scope.ids.length === 1 ? 'campaign' : 'campaigns'} picked`;
  return scopeLabel(scope, []);
}

/** What the UI prints next to an account or a block. */
export function scopeLabel(scope: CampaignScope | undefined, campaigns: Campaign[]): string {
  if (!scope || scope.mode === 'all') return 'All campaigns';
  if (scope.mode === 'pick') {
    const kept = applyScope(campaigns, scope);
    return `${kept.length} ${kept.length === 1 ? 'campaign' : 'campaigns'}: ${kept.map((c) => c.name).join(', ')}`;
  }
  return `Name ${scope.rules.map((r) => `${r.op === 'contains' ? 'contains' : 'does not contain'} "${r.text}"`).join(' and ')}`;
}
