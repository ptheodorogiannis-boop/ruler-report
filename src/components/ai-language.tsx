'use client';

// One AI language per page (review I5 of plan G): the analysis panel's select sets it, the per-block controls read it,
// and until someone picks, the workspace locale decides. A module store rather than context, because the panel and the
// editor are siblings rendered by a server component.
import { useSyncExternalStore } from 'react';
import { defaultAiLanguage } from '@/lib/ai/language';
import { useLocale } from '@/components/i18n-provider';

let current: string | null = null;
const listeners = new Set<() => void>();

export const aiLanguageStore = {
  get: () => current,
  set(value: string | null) {
    current = value;
    for (const l of listeners) l();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

/** [language, setLanguage]: the picked language, else the locale's default. */
export function useAiLanguage(): [string, (value: string) => void] {
  const locale = useLocale();
  const fallback = defaultAiLanguage(locale);
  const value = useSyncExternalStore(
    aiLanguageStore.subscribe,
    () => aiLanguageStore.get() ?? fallback,
    () => fallback,
  );
  return [value, aiLanguageStore.set];
}
