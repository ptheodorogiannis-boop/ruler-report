// Matomo goals (docs/superpowers/specs/2026-11-04-ads-previews-sources-matomo-design.md §3): read from Matomo into the
// integration's config, shown under Matomo's own name unless the agency renamed it in the tool. Each goal becomes its own
// metrics (conversions, per day, rate, revenue) in a Goals group, plus one table of all goals.
import type { WidgetSpec } from '@/lib/engine/types';
import { MONEY, PCT, num, series, sum, table } from './helpers';

/** The longest "Show as" name a goal can get. */
export const GOAL_NAME_MAX = 60;

export interface MatomoGoal {
  id: string;
  name: string;
}
export interface MatomoGoalConfig {
  goals?: MatomoGoal[];
  goalNames?: Record<string, string>;
}

/** The name a goal is shown with: the agency's rename, else Matomo's name, else "Goal <id>". */
export function goalName(config: MatomoGoalConfig | null | undefined, id: string): string {
  const rename = config?.goalNames?.[id]?.trim();
  if (rename) return rename;
  return config?.goals?.find((g) => g.id === id)?.name?.trim() || `Goal ${id}`;
}

/** Per goal: conversions, conversions per day, conversion rate, revenue; plus "Conversions by goal" when there are goals. */
export function goalWidgets(config: MatomoGoalConfig | null | undefined): WidgetSpec[] {
  const goals = config?.goals ?? [];
  if (!goals.length) return [];
  const out: WidgetSpec[] = [];
  for (const goal of goals) {
    const name = goalName(config, goal.id);
    const conv = `goal_${goal.id}_conversions`;
    out.push(
      sum(conv, `${name} – conversions`, conv, { group: 'Goals', desc: `Conversions of the Matomo goal "${name}" (id ${goal.id}).` }),
      series(`goal_${goal.id}_conversions_by_date`, `${name} – conversions per day`, [conv], { group: 'Goals' }),
      num(`goal_${goal.id}_conversion_rate`, `${name} – conversion rate`, { kind: 'ratio', num: conv, den: 'sessions', mult: 100 }, { ...PCT, agg: false, group: 'Goals' }),
      sum(`goal_${goal.id}_revenue`, `${name} – revenue`, `goal_${goal.id}_revenue`, { ...MONEY, group: 'Goals' })
    );
  }
  out.push(table('conversions_by_goal', 'Conversions by goal', 'goal', ['conversions', 'revenue', 'goal_conversion_rate'], { group: 'Tables', sortBy: 'conversions' }));
  return out;
}

/** The message for a metric an account no longer has: a Matomo goal deleted in Matomo says so. */
export function missingMetricMessage(slug: string, key: string, platform: string): string {
  if (slug === 'matomo' && /^goal_\d+_/.test(key)) return 'This goal no longer exists in Matomo.';
  return `Unknown metric "${key}" for ${platform}.`;
}
