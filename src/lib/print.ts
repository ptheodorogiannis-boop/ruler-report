// Print mode of the public pages (spec v3 §4.1): `?print=1` hides the chrome like `.no-print` does and `?layout=pages`
// starts every block on a new page. Pure, so the page and the tests agree on the attributes.
export type PrintLayout = 'flow' | 'pages';

export function printAttrs(sp: { print?: string; layout?: string }): { 'data-print'?: '1'; 'data-print-layout'?: PrintLayout } {
  const layout: PrintLayout | null = sp.layout === 'pages' ? 'pages' : sp.layout === 'flow' ? 'flow' : null;
  const print = sp.print === '1';
  if (!print && !layout) return {};
  return { ...(print ? { 'data-print': '1' as const } : {}), 'data-print-layout': layout ?? 'flow' };
}
