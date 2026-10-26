// `next/dist/shared/lib/app-router-context.shared-runtime` in the demo: the context AutoRefresh reads, holding the demo router.
import { createContext } from 'react';
import { useRouter } from './next-navigation';

export const AppRouterContext = createContext<ReturnType<typeof useRouter> | null>(useRouter());
export const LayoutRouterContext = createContext<unknown>(null);
export const GlobalLayoutRouterContext = createContext<unknown>(null);
