// `state` for the OAuth round-trip: a short-lived signed JWT (jose + APP_SECRET) that remembers which
// company / project / integration the user started from and which user did it, so the callback can't be
// replayed by someone else or against another project.
import { SignJWT, jwtVerify } from 'jose';

const key = () => new TextEncoder().encode(process.env.APP_SECRET || 'dev-insecure-secret-change-me-please-0000');
const AUD = 'oauth-state';

export type Provider = 'google' | 'meta';
export interface OAuthState {
  provider: Provider;
  companyId: number;
  projectId: number;
  slug: string;
  userId: number | null;
  /** reconnect: the integration whose credentials the callback replaces (spec v3 §1.2) */
  integrationId?: number;
}

export async function signState(s: OAuthState): Promise<string> {
  return new SignJWT({ ...s }).setProtectedHeader({ alg: 'HS256' }).setAudience(AUD).setIssuedAt().setExpirationTime('10m').sign(key());
}

export async function verifyState(token: string | null | undefined): Promise<OAuthState> {
  if (!token) throw new Error('Missing OAuth state');
  try {
    const { payload } = await jwtVerify(token, key(), { audience: AUD });
    const { provider, companyId, projectId, slug, userId, integrationId } = payload as any;
    if ((provider !== 'google' && provider !== 'meta') || !Number.isInteger(companyId) || !Number.isInteger(projectId) || typeof slug !== 'string') throw new Error('malformed');
    return { provider, companyId, projectId, slug, userId: userId ?? null, ...(Number.isInteger(integrationId) ? { integrationId } : {}) };
  } catch {
    throw new Error('The connect link expired or is invalid — start again.');
  }
}
