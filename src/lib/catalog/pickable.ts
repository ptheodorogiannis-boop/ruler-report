// What the editor's picker offers for an account (docs/superpowers/specs/2026-11-04-editor-report-management-design.md §3):
// the catalog without the widgets its connector says it cannot provide, in the archetype's group order. The API's
// /metrics keeps every entry unless it is asked for `pickable=1`.
import { getConnector } from '@/lib/connectors';
import { planPrims, widgetPrims } from '@/lib/engine/resolve';
import type { CatalogWidget } from './build';
import { sortByGroup } from './groups';
import { getIntegrationDef } from './integrations';

export function pickableMetrics(slug: string, widgets: CatalogWidget[]): CatalogWidget[] {
  const def = getIntegrationDef(slug);
  if (!def || def.archetype === 'custom') return widgets;
  const unsupported = new Set(getConnector(def.connector).unsupported ?? []);
  const loads = (w: CatalogWidget) => !unsupported.size || !planPrims(slug, widgetPrims(w.calc)).real.some((p) => unsupported.has(p));
  // Results / Cost per result only exist per row of the campaign table
  return sortByGroup(def.archetype, widgets.filter((w) => !w.containerOnly && loads(w)));
}
