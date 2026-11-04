// Starred table rows (docs/superpowers/specs/2026-11-04-editor-report-management-design.md §5): row names kept on the widget.

/** Longest row name that can be starred: the layout schema allows it, so one long name never blocks a save. */
export const STAR_NAME_MAX = 1000;
/** Most names one widget keeps (the oldest goes first). */
export const STARS_MAX = 100;

/** Star `name` if it is not starred, unstar it if it is; a name longer than STAR_NAME_MAX is left alone. */
export function nextStarred(current: string[], name: string): string[] {
  if (name.length > STAR_NAME_MAX) return current;
  return current.includes(name) ? current.filter((n) => n !== name) : [...current, name].slice(-STARS_MAX);
}
