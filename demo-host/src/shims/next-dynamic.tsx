// `next/dynamic` in the demo: React.lazy with the loading placeholder as the Suspense fallback.
import { lazy, Suspense, type ComponentType } from 'react';

type Loader = () => Promise<ComponentType<any> | { default: ComponentType<any> }>;

export default function dynamic(loader: Loader, opts: { loading?: () => any; ssr?: boolean } = {}) {
  const Lazy = lazy(async () => {
    const m = await loader();
    return { default: (typeof m === 'function' ? m : (m as { default: ComponentType<any> }).default) as ComponentType<any> };
  });
  return function DynamicComponent(props: Record<string, unknown>) {
    return (
      <Suspense fallback={opts.loading ? opts.loading() : null}>
        <Lazy {...props} />
      </Suspense>
    );
  };
}
