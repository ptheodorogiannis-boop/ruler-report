// The frame's navigation (docs/DESIGN.md › Ruler glass pass, design-system.md §6.1):
// - PillNav: the daily places in a glass pill in the top bar; the active place is a red pill with white text.
// - SideRail: round glass icon buttons for the secondary places, Settings at the bottom, a tooltip on the right.
// - TabBar: on phones a floating glass tab bar with the daily places and More, which opens a sheet with the rest.
// Server components, no client JavaScript: the More sheet is a <details>.
import clsx from 'clsx';
import Link from 'next/link';
import { MoreHorizontal } from 'lucide-react';
import { NavIcon } from './nav-icons';
import type { NavItem } from './nav-groups';

export function PillNav({ items, active, label }: { items: NavItem[]; active?: string; label: string }) {
  return (
    <nav className="pillnav" aria-label={label}>
      <ul className="pillnav-list">
        {items.map((it) => {
          const on = active === it.href;
          return (
            <li key={it.href}>
              <Link href={it.href} aria-current={on ? 'page' : undefined} className={clsx('pillnav-item', on && 'is-active')}>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SideRail({ items, settings, active, label }: { items: NavItem[]; settings?: NavItem; active?: string; label: string }) {
  if (!items.length && !settings) return null;
  const btn = (it: NavItem) => {
    const on = active === it.href;
    return (
      <li key={it.href}>
        <Link href={it.href} aria-label={it.label} aria-current={on ? 'page' : undefined} className={clsx('icon-btn rail-btn', on && 'is-active')} data-tip={it.label}>
          <NavIcon name={it.icon} />
        </Link>
      </li>
    );
  };
  return (
    <nav className="siderail no-print" aria-label={label}>
      <ul className="siderail-list">{items.map(btn)}</ul>
      {settings && <ul className="siderail-list siderail-foot">{btn(settings)}</ul>}
    </nav>
  );
}

export function TabBar({ daily, more, active, labels }: { daily: NavItem[]; more: NavItem[]; active?: string; labels: { nav: string; more: string } }) {
  const shown = daily.slice(0, more.length ? 4 : 5);
  const rest = [...daily.slice(shown.length), ...more];
  const moreOn = !!active && rest.some((it) => it.href === active);
  return (
    <nav className="tabbar no-print" aria-label={labels.nav}>
      <ul className="tabbar-list">
        {shown.map((it) => {
          const on = active === it.href;
          return (
            <li key={it.href}>
              <Link href={it.href} aria-current={on ? 'page' : undefined} className={clsx('tabbar-item', on && 'is-active')}>
                <NavIcon name={it.icon} size={18} />
                <span>{it.label}</span>
              </Link>
            </li>
          );
        })}
        {rest.length > 0 && (
          <li>
            <details className="tabbar-more">
              <summary className={clsx('tabbar-item', moreOn && 'is-active')}>
                <MoreHorizontal size={18} strokeWidth={1.5} aria-hidden="true" />
                <span>{labels.more}</span>
              </summary>
              <div className="tabbar-sheet overlay">
                <ul>
                  {rest.map((it) => (
                    <li key={it.href}>
                      <Link href={it.href} aria-current={active === it.href ? 'page' : undefined} className={clsx('navlink', active === it.href && 'is-active')}>
                        <NavIcon name={it.icon} />
                        <span>{it.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          </li>
        )}
      </ul>
    </nav>
  );
}
