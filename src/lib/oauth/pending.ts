// Tokens obtained by the callback live here between "user consented" and "user picked accounts":
// AES-GCM encrypted (same key as stored integration credentials) in a short-lived httpOnly cookie, so no
// half-finished connection ever touches the database.
import { decryptJson, encryptJson } from '@/lib/crypto';
import type { Provider } from './state';

export const PENDING_COOKIE = 'rr_oauth_pending';
export const PENDING_TTL_S = 15 * 60;

export interface Pending {
  provider: Provider;
  companyId: number;
  projectId: number;
  slug: string;
  userId: number | null;
  /** tokens exactly as the provider returned them (access + refresh) */
  credentials: Record<string, any>;
  /** human label of the authorising account (email), shown in the picker */
  account?: string;
  /** reconnect: only the account of this integration may be picked */
  integrationId?: number;
  exp: number;
}

export const sealPending = (p: Omit<Pending, 'exp'>): string => encryptJson({ ...p, exp: Date.now() + PENDING_TTL_S * 1000 });

export function openPending(blob: string | null | undefined): Pending | null {
  const p = decryptJson<Pending>(blob);
  if (!p || typeof p.exp !== 'number' || p.exp < Date.now()) return null;
  return p;
}

export const cookieOptions = () => ({ httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: PENDING_TTL_S });
