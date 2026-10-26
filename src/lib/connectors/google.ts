// Google OAuth helper shared by GA4 / Search Console / Sheets.
import { endpoints } from '@/lib/oauth/endpoints';
import { fetchJson } from './http';

const cache = new Map<string, { token: string; exp: number }>();

export async function googleAccessToken(creds: Record<string, any> | null): Promise<string> {
  if (!creds) throw new Error('invalid_token: no credentials stored');
  if (creds.accessToken && !creds.refreshToken) return creds.accessToken as string;
  const rt = creds.refreshToken as string | undefined;
  if (!rt) throw new Error('invalid_token: missing refresh token — reconnect Google');
  const hit = cache.get(rt);
  if (hit && hit.exp > Date.now() + 30_000) return hit.token;
  const clientId = (creds.clientId as string) || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = (creds.clientSecret as string) || process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured');
  const j = await fetchJson<{ access_token: string; expires_in: number }>(endpoints.google.token, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: rt, grant_type: 'refresh_token' }),
  });
  cache.set(rt, { token: j.access_token, exp: Date.now() + j.expires_in * 1000 });
  return j.access_token;
}

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/business.manage',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/adwords',
];
