'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { NAV_ICONS, type NavIconName } from './nav-icons';

const MotionLink = motion.create(Link);

/** Sidebar item: a marker slides in on the left and the icon's moving part travels (one treatment for the nav role). */
export function NavLink({ href, label, icon, active, trailing }: { href: string; label: string; icon: NavIconName; active?: boolean; trailing?: ReactNode }) {
  const Icon = NAV_ICONS[icon];
  return (
    <MotionLink href={href} aria-current={active ? 'page' : undefined} className={clsx('navlink', active && 'is-active')} initial="rest" animate="rest" whileHover="hover" whileFocus="hover">
      <Icon />
      <span className="truncate">{label}</span>
      {trailing}
    </MotionLink>
  );
}

/** Same treatment for the sign-out button. */
export function NavButton({ label, icon, children }: { label: string; icon: NavIconName; children?: ReactNode }) {
  const Icon = NAV_ICONS[icon];
  return (
    <motion.button type="submit" className="navlink w-full" initial="rest" animate="rest" whileHover="hover" whileFocus="hover">
      <Icon />
      <span>{label}</span>
      {children}
    </motion.button>
  );
}
