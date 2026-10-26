'use client';

// Re-fetches the live dashboard every `seconds` while the tab is visible (spec v3 §3.5). Uses the app router when it
// is mounted (a soft refresh keeps scroll and state); outside it (tests, static render) falls back to a reload.
import { useContext, useEffect } from 'react';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';

export function AutoRefresh({ seconds = 120 }: { seconds?: number }) {
  const router = useContext(AppRouterContext);
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (router) router.refresh();
      else window.location.reload();
    }, Math.max(30, seconds) * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return <span hidden data-auto-refresh={seconds} />;
}
