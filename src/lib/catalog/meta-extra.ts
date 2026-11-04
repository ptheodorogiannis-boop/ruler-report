// Meta Ads widgets beyond the shared ads archetype (docs/superpowers/specs/2026-11-04-ads-previews-sources-matomo-design.md §1):
// Results and Cost per result. Each ad or ad set counts the event its ad set optimises for, so they only mean something per
// row of the campaign table (Ads or Ad sets level).
import type { WidgetSpec } from '@/lib/engine/types';
import { BAD, MONEY, num, sum } from './helpers';

export const metaExtraWidgets = (): WidgetSpec[] => [
  { ...sum('results', 'Results', 'results', { group: 'Results', desc: 'The event each ad set optimises for (purchase, add to cart, lead…), counted per ad or ad set.' }), containerOnly: true },
  { ...num('cost_per_result', 'Cost per result', { kind: 'ratio', num: 'spend', den: 'results' }, { ...MONEY, ...BAD, group: 'Results', agg: false, desc: 'Amount spent / results, per ad or ad set.' }), containerOnly: true },
];
