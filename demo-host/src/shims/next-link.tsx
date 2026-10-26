// `next/link` in the demo: an anchor whose internal targets route inside the demo.
import { forwardRef, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { bus } from '../bus';

type Href = string | { pathname?: string; query?: Record<string, string | number> };
type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: Href; prefetch?: boolean; replace?: boolean; scroll?: boolean; children?: ReactNode };

const toString = (h: Href) => (typeof h === 'string' ? h : `${h.pathname ?? ''}${h.query ? `?${new URLSearchParams(Object.entries(h.query).map(([k, v]) => [k, String(v)]))}` : ''}`);

const Link = forwardRef<HTMLAnchorElement, Props>(function Link({ href, prefetch: _p, replace, scroll: _s, onClick, children, ...rest }, ref) {
  const target = toString(href);
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!target.startsWith('/') || rest.target === '_blank') return;
    e.preventDefault();
    bus.navigate(target, { replace });
  };
  return (
    <a ref={ref} href={target} onClick={handle} {...rest}>
      {children}
    </a>
  );
});

export default Link;
