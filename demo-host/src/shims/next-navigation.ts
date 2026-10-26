// `next/navigation` in the demo: the router is the demo shell (through the bus).
import { useMemo, useSyncExternalStore } from 'react';
import { bus, getLocation, subscribeLocation } from '../bus';

const router = {
  push: (href: string) => bus.navigate(href),
  replace: (href: string) => bus.navigate(href, { replace: true }),
  refresh: () => bus.refresh(),
  back: () => bus.back(),
  forward: () => {},
  prefetch: () => {},
};

/** Plain function (no React state), so it also works outside a component. */
export function useRouter() {
  return router;
}

export function usePathname(): string {
  return useSyncExternalStore(subscribeLocation, () => getLocation().path, () => getLocation().path);
}

export function useSearchParams(): URLSearchParams {
  const search = useSyncExternalStore(subscribeLocation, () => getLocation().search, () => getLocation().search);
  return useMemo(() => new URLSearchParams(search), [search]);
}

export function useParams(): Record<string, string> {
  return {};
}

export function redirect(href: string): never {
  bus.navigate(href, { replace: true });
  const e = new Error('NEXT_REDIRECT');
  (e as any).digest = `NEXT_REDIRECT;replace;${href};307;`;
  throw e;
}

export function notFound(): never {
  const e = new Error('NEXT_NOT_FOUND');
  (e as any).digest = 'NEXT_NOT_FOUND';
  throw e;
}
