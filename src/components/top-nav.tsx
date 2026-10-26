// The top navigation (docs/DESIGN.md › v2 — navigation): the three groups as a plain wrapping list, the active item
// underlined by CSS alone. No measured marker, no fade masks, no client JavaScript: nothing to lag or cut off.
import clsx from 'clsx';
import Link from 'next/link';

export interface NavGroup {
  label: string;
  items: { href: string; label: string }[];
}

export function TopNav({ groups, active }: { groups: NavGroup[]; active?: string }) {
  return (
    <nav className="topnav" aria-label="Main">
      <ul className="topnav-list">
        {groups.map((g, gi) => (
          <li key={g.label} className="topnav-group" role="group" aria-label={g.label}>
            {gi > 0 && groups.length > 1 && <span className="topnav-sep" aria-hidden="true" />}
            {g.items.map((it) => {
              const on = active === it.href;
              return (
                <Link key={it.href} href={it.href} aria-current={on ? 'page' : undefined} className={clsx('topnav-item', on && 'is-active')}>
                  {it.label}
                </Link>
              );
            })}
          </li>
        ))}
      </ul>
    </nav>
  );
}
