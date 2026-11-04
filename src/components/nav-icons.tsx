// Navigation icons: Lucide line icons only, 1.5px stroke (design-system.md §7). The names are the nav model's keys plus
// the three the account menu uses.
import { Bell, BookOpen, Braces, Blend, FileText, FolderOpen, LayoutDashboard, LayoutGrid, LayoutTemplate, LogOut, Plug, Settings, Target, Zap, type LucideIcon } from 'lucide-react';

export const NAV_ICONS = {
  overview: LayoutDashboard,
  projects: FolderOpen,
  reports: FileText,
  dashboards: LayoutGrid,
  goals: Target,
  templates: LayoutTemplate,
  automations: Zap,
  blended: Blend,
  integrations: Plug,
  metrics: BookOpen,
  api: Braces,
  settings: Settings,
  notifications: Bell,
  // account menu
  bell: Bell,
  gear: Settings,
  exit: LogOut,
} satisfies Record<string, LucideIcon>;
export type NavIconName = keyof typeof NAV_ICONS;

export function NavIcon({ name, size = 18 }: { name: NavIconName; size?: number }) {
  const Icon = NAV_ICONS[name];
  return <Icon size={size} strokeWidth={1.5} aria-hidden="true" />;
}
