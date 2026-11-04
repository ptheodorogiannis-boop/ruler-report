// Matomo goals (docs/superpowers/specs/2026-11-04-ads-previews-sources-matomo-design.md §3): read from Matomo into the
// integration's config, shown under Matomo's own name unless the agency renamed it in the tool.

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
