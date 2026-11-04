// The order of the metric groups in the editor's picker (docs/superpowers/specs/2026-11-04-editor-report-management-design.md §3),
// per archetype: numbers first in the order a reader thinks about them, then charts, then tables. A group not listed sorts last.

/** "By platform" → "by_platform", "E-commerce" → "e_commerce": the id of a group (and of its i18n key, catalog.group.<id>). */
export const groupId = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export const GROUP_ORDER: Record<string, string[]> = {
  ads: ['investment', 'delivery', 'engagement', 'efficiency', 'results', 'funnel', 'by_platform', 'audience', 'charts', 'tables'],
  social: ['audience', 'delivery', 'engagement', 'content', 'conversion', 'charts', 'tables'],
  web: ['traffic', 'engagement', 'conversion', 'goals', 'e_commerce', 'acquisition', 'audience', 'funnel', 'charts', 'tables'],
  seo: ['performance', 'audience', 'charts', 'tables'],
  ecom: ['sales', 'customers', 'funnel', 'audience', 'charts', 'tables'],
  crm: ['leads', 'deals', 'value', 'team', 'funnel', 'charts', 'tables'],
  email: ['delivery', 'engagement', 'list', 'revenue', 'charts', 'tables'],
  local: ['visibility', 'actions', 'reputation', 'charts', 'tables'],
  video: ['performance', 'engagement', 'audience', 'acquisition', 'charts', 'tables'],
  calls: ['calls', 'quality', 'acquisition', 'charts', 'tables'],
};

/** Stable sort by the archetype's group order; widgets keep their catalog order inside a group. */
export function sortByGroup<T extends { group?: string }>(archetype: string, items: T[]): T[] {
  const order = GROUP_ORDER[archetype] ?? [];
  const rank = (t: T) => {
    const i = order.indexOf(groupId(t.group ?? 'Other'));
    return i < 0 ? order.length : i;
  };
  return items.map((t, i) => ({ t, i, r: rank(t) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.t);
}
