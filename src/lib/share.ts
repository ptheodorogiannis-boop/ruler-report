import { sha256 } from '@/lib/crypto';

/** Value of the cookie that proves a visitor typed the share-link password (hash of the stored password hash). */
export const unlockCookie = (reportId: number, pwHash: string) => sha256(`unlock:${reportId}:${pwHash}`);
/** Same for the project's public goals page (spec v3 §3.4). */
export const goalsUnlockCookie = (projectId: number, pwHash: string) => sha256(`unlock:goals:${projectId}:${pwHash}`);

/** The path of a public page with the client's view kept (`?lang=`, `?embed=1`); anything else is dropped. */
export function publicPath(kind: 'report' | 'dashboard' | 'goals', token: string, q: { lang?: string | null; embed?: boolean | string | null } = {}): string {
  const p = new URLSearchParams();
  if (q.lang === 'en' || q.lang === 'el') p.set('lang', q.lang);
  if (q.embed === true || q.embed === '1') p.set('embed', '1');
  const s = p.toString();
  return `/${kind === 'report' ? 'r' : kind === 'dashboard' ? 'd' : 'g'}/${token}${s ? `?${s}` : ''}`;
}

/**
 * Public base URL as the current visitor reaches the app (reverse proxy / tunnel aware), falling back to APP_URL.
 * Used by the internal pages for "Copy link" / "Open client view", so links are right even when the public
 * hostname changes (free tunnels rotate it). Background jobs keep using APP_URL.
 */
export async function requestBaseUrl(): Promise<string> {
  const fallback = process.env.APP_URL || 'http://localhost:3100';
  try {
    const { headers } = await import('next/headers');
    const h = await headers();
    const host = h.get('x-forwarded-host')?.split(',')[0].trim() || h.get('host');
    if (!host) return fallback;
    const proto = h.get('x-forwarded-proto')?.split(',')[0].trim() || (/^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host) ? 'http' : 'https');
    return `${proto}://${host}`;
  } catch {
    return fallback;
  }
}
