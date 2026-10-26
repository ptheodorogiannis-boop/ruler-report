// The top navigation groups, translated (spec v3 §5). Server-safe; the shell builds them per request.
import { t, type Locale } from '@/lib/i18n';
import type { NavGroup } from './top-nav';

export function navGroups(locale: Locale, role: string): NavGroup[] {
  const tt = (k: string) => t(locale, k);
  const work: NavGroup = {
    label: tt('nav.work'),
    items: [
      { href: '/overview', label: tt('nav.overview') },
      { href: '/projects', label: tt('nav.projects') },
      { href: '/reports', label: tt('nav.reports') },
      { href: '/dashboards', label: tt('nav.dashboards') },
    ],
  };
  if (role === 'client') return [{ label: work.label, items: work.items.filter((n) => ['/dashboards', '/reports'].includes(n.href)) }];
  return [
    work,
    {
      label: tt('nav.build'),
      items: [
        { href: '/templates', label: tt('nav.templates') },
        { href: '/automations', label: tt('nav.automations') },
        { href: '/goals', label: tt('nav.goals') },
        { href: '/custom-metrics', label: tt('nav.blendedMetrics') },
      ],
    },
    {
      label: tt('nav.connect'),
      items: [
        { href: '/integrations', label: tt('nav.integrations') },
        { href: '/metrics', label: tt('nav.metricCatalog') },
        { href: '/api-docs', label: tt('nav.apiMcp') },
      ],
    },
  ];
}
