// Menu rows of the account menu: a line icon and a label; hover is a quiet fill (no motion beyond colour).
import clsx from 'clsx';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { NavIcon, type NavIconName } from './nav-icons';

export function NavLink({ href, label, icon, active, trailing }: { href: string; label: string; icon: NavIconName; active?: boolean; trailing?: ReactNode }) {
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={clsx('navlink', active && 'is-active')}>
      <NavIcon name={icon} />
      <span className="truncate">{label}</span>
      {trailing}
    </Link>
  );
}

/** Same row for the sign-out button. */
export function NavButton({ label, icon, children }: { label: string; icon: NavIconName; children?: ReactNode }) {
  return (
    <button type="submit" className="navlink w-full">
      <NavIcon name={icon} />
      <span>{label}</span>
      {children}
    </button>
  );
}
