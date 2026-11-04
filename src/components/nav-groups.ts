// The navigation model (docs/DESIGN.md › Ruler glass pass): the daily places in the glass pill menu, the secondary ones
// on the icon rail, Settings at the bottom of the rail. Translated per request (spec v3 §5). Server-safe.
import { t, type Locale } from '@/lib/i18n';
import type { NavIconName } from './nav-icons';

export interface NavItem {
  href: string;
  label: string;
  icon: NavIconName;
}
export interface NavModel {
  /** the pill menu (top bar) and, on phones, the first tabs of the floating tab bar */
  daily: NavItem[];
  /** the icon rail; on phones they move into the More sheet */
  secondary: NavItem[];
  /** bottom of the rail; absent for roles that cannot open settings */
  settings?: NavItem;
}

export function navModel(locale: Locale, role: string): NavModel {
  const tt = (k: string) => t(locale, k);
  const daily: NavItem[] = [
    { href: '/overview', label: tt('nav.overview'), icon: 'overview' },
    { href: '/projects', label: tt('nav.projects'), icon: 'projects' },
    { href: '/reports', label: tt('nav.reports'), icon: 'reports' },
    { href: '/dashboards', label: tt('nav.dashboards'), icon: 'dashboards' },
    { href: '/goals', label: tt('nav.goals'), icon: 'goals' },
  ];
  if (role === 'client') return { daily: daily.filter((n) => ['/dashboards', '/reports'].includes(n.href)), secondary: [] };
  const secondary: NavItem[] = [
    { href: '/templates', label: tt('nav.templates'), icon: 'templates' },
    { href: '/automations', label: tt('nav.automations'), icon: 'automations' },
    { href: '/custom-metrics', label: tt('nav.blendedMetrics'), icon: 'blended' },
    { href: '/integrations', label: tt('nav.integrations'), icon: 'integrations' },
    { href: '/metrics', label: tt('nav.metricCatalog'), icon: 'metrics' },
    { href: '/api-docs', label: tt('nav.apiMcp'), icon: 'api' },
  ];
  const settings: NavItem | undefined = role !== 'viewer' ? { href: '/settings', label: tt('common.settings'), icon: 'settings' } : undefined;
  return { daily, secondary, settings };
}

/** The place a path belongs to: the longest matching prefix wins (design-system.md §6.2). */
export function activeHref(pathname: string | undefined, items: NavItem[]): string | undefined {
  if (!pathname) return undefined;
  let best: string | undefined;
  for (const it of items) if ((pathname === it.href || pathname.startsWith(it.href + '/')) && (!best || it.href.length > best.length)) best = it.href;
  return best;
}
