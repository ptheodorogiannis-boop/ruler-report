'use client';

import { MotionConfig } from 'motion/react';

/**
 * One motion configuration for the signed-in app (rendered by the shell): honours the visitor's reduced-motion setting
 * everywhere motion is used. Public pages (report, dashboard, login, 404) have no animated component and ship no motion
 * runtime, so this must not wrap the root layout (docs/DESIGN.md › Pass 5).
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
