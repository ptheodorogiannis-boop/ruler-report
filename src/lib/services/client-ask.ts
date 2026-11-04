// Whether a shared link shows the client Ask tile (docs/superpowers/specs/2026-11-04-map-search-ask-layout-design.md §3),
// and what it offers: only when the agency switched Ask on for the report and the server has an Anthropic key.
import { aiConfigured, suggestedQuestions } from '@/lib/ai/insights';
import type { ReportData } from '@/lib/engine/types';
import type { Locale } from '@/lib/i18n';

export function clientAskTile(report: { clientAsk: boolean; shareToken: string }, data: ReportData, locale: Locale): { token: string; suggestions: string[] } | null {
  if (!report.clientAsk || !aiConfigured()) return null;
  return { token: report.shareToken, suggestions: suggestedQuestions(data, locale) };
}
