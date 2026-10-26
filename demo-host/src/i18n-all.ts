// Every dictionary namespace: the demo ships the whole dictionary to its live views (it is a demo, not a product build).
import { en } from '@/lib/i18n/dicts';

export const ALL_NAMESPACES: string[] = [...new Set(Object.keys(en).map((k) => k.slice(0, k.indexOf('.'))))];

/** "Acme Running Co | Monthly report" → "Monthly report" (copied from src/components/public-report.tsx, a server module). */
export function stripClientPrefix(title: string, client: string): string {
  const t = title.trim();
  const c = client.trim();
  if (!c || !t.toLowerCase().startsWith(c.toLowerCase())) return t;
  const rest = t.slice(c.length).replace(/^\s*[|:–—-]\s*/, '').trim();
  return rest.length >= 3 ? rest : t;
}
