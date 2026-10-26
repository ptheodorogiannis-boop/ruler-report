// Request-level OAuth flow, kept free of next/headers so tests can call it with a plain NextRequest and a
// stand-in Principal. The route files in src/app/api/oauth/* are one-liners around startOAuth / handleCallback.
import { NextRequest, NextResponse } from 'next/server';
import { assertProject, canWrite, type Principal } from '@/lib/auth';
import { getIntegrationDef } from '@/lib/catalog/integrations';
import { encryptJson } from '@/lib/crypto';
import { db } from '@/lib/db';
import { connectIntegration } from '@/lib/services/integrations';
import { PENDING_COOKIE, cookieOptions, sealPending, type Pending } from './pending';
import { OAUTH_SLUGS, PROVIDER_NAME, authUrl, exchangeCode, listAccounts, providerConfigured, storedCredentials } from './providers';
import { signState, verifyState, type Provider } from './state';

const base = (req: NextRequest) => (process.env.APP_URL || req.nextUrl.origin).replace(/\/$/, '');
export const redirectUri = (req: NextRequest, provider: Provider) => `${base(req)}/api/oauth/${provider}/callback`;
const go = (req: NextRequest, path: string) => NextResponse.redirect(new URL(path, base(req) + '/'));
const backToConnect = (req: NextRequest, projectId: number, slug: string, msg: string) => go(req, `/projects/${projectId}/connect/${encodeURIComponent(slug)}?oauth_error=${encodeURIComponent(msg.slice(0, 300))}`);

export async function startOAuth(req: NextRequest, p: Principal | null, provider: Provider): Promise<NextResponse> {
  if (!p) return go(req, '/login');
  const projectId = Number(req.nextUrl.searchParams.get('projectId'));
  const slug = req.nextUrl.searchParams.get('slug') ?? '';
  const def = OAUTH_SLUGS[slug];
  if (!Number.isInteger(projectId) || !def || def.provider !== provider || !getIntegrationDef(slug)) return NextResponse.json({ message: 'Unknown integration for this provider' }, { status: 400 });
  try {
    if (!canWrite(p)) throw new Error('Your role is read-only.');
    await assertProject(p, projectId);
  } catch (e) {
    return NextResponse.json({ message: (e as Error).message }, { status: 403 });
  }
  if (!providerConfigured(provider)) return backToConnect(req, projectId, slug, `${PROVIDER_NAME[provider]} OAuth is not configured on this server — paste credentials instead.`);
  const reconnect = Number(req.nextUrl.searchParams.get('reconnect'));
  let integrationId: number | undefined;
  if (reconnect) {
    const row = await db.integration.findFirst({ where: { id: reconnect, companyId: p.companyId, projectId, slug } });
    if (!row) return backToConnect(req, projectId, slug, 'The integration to reconnect was not found.');
    integrationId = row.id;
  }
  const state = await signState({ provider, companyId: p.companyId, projectId, slug, userId: p.userId, ...(integrationId ? { integrationId } : {}) });
  return NextResponse.redirect(authUrl(provider, slug, state, redirectUri(req, provider)));
}

export async function handleCallback(req: NextRequest, p: Principal | null, provider: Provider): Promise<NextResponse> {
  const q = req.nextUrl.searchParams;
  let state;
  try {
    state = await verifyState(q.get('state'));
  } catch (e) {
    return NextResponse.json({ message: (e as Error).message }, { status: 400 });
  }
  if (state.provider !== provider) return NextResponse.json({ message: 'OAuth state belongs to another provider' }, { status: 400 });
  if (!p) return go(req, '/login');
  // the person finishing the flow must be the person who started it, in the same company
  if (p.companyId !== state.companyId || p.userId !== state.userId) return NextResponse.json({ message: 'This connect link was started by a different user.' }, { status: 403 });
  const { projectId, slug } = state;
  try {
    if (!canWrite(p)) throw new Error('Your role is read-only.');
    await assertProject(p, projectId);
  } catch (e) {
    return NextResponse.json({ message: (e as Error).message }, { status: 403 });
  }
  const denied = q.get('error');
  if (denied) return backToConnect(req, projectId, slug, `${PROVIDER_NAME[provider]} reported: ${q.get('error_description') || denied}`);
  const code = q.get('code');
  if (!code) return backToConnect(req, projectId, slug, 'No authorisation code returned.');
  try {
    const tokens = await exchangeCode(provider, slug, code, redirectUri(req, provider));
    const res = go(req, `/projects/${projectId}/connect/${encodeURIComponent(slug)}/pick`);
    res.cookies.set(PENDING_COOKIE, sealPending({ provider, companyId: p.companyId, projectId, slug, userId: p.userId, credentials: tokens.credentials, account: tokens.account, ...(state.integrationId ? { integrationId: state.integrationId } : {}) }), cookieOptions());
    return res;
  } catch (e) {
    return backToConnect(req, projectId, slug, (e as Error).message);
  }
}

/** A pending connection is only usable by the user/company/project/integration it was created for. */
export function pendingMatches(pending: Pending | null, p: Principal, projectId: number, slug: string): pending is Pending {
  return !!pending && pending.companyId === p.companyId && pending.userId === p.userId && pending.projectId === projectId && pending.slug === slug;
}

export interface FinalizeResult {
  created: number;
  reconnected: number;
}

/** Creates one integration per selected account (or refreshes credentials when that account is already
 *  connected to the project). The selection is re-validated against a fresh account listing. */
export async function finalizeSelection(pending: Pending, keys: string[], deps: { listAccounts?: typeof listAccounts } = {}): Promise<FinalizeResult> {
  const wanted = new Set(keys);
  if (!wanted.size) throw new Error('Select at least one account.');
  const chosen = (await (deps.listAccounts ?? listAccounts)(pending.slug, pending.credentials)).filter((o) => wanted.has(o.key));
  if (!chosen.length) throw new Error('None of the selected accounts is accessible any more.');
  const stored = storedCredentials(pending.provider, pending.credentials, pending.account);
  const out: FinalizeResult = { created: 0, reconnected: 0 };
  if (pending.integrationId) {
    // reconnect: only the account already stored on that row may be picked (spec v3 §1.2)
    const row = await db.integration.findFirst({ where: { id: pending.integrationId, companyId: pending.companyId, projectId: pending.projectId, slug: pending.slug } });
    if (!row) throw new Error('The integration to reconnect was not found.');
    const match = chosen.find((o) => o.sourceId === row.sourceId);
    if (!match) throw new Error(`Pick the same account (${row.sourceId}) to reconnect, or add a new integration`);
    if (chosen.length > 1) throw new Error(`Pick only the account being reconnected (${row.sourceId}); other accounts can be added afterwards`);
    await connectIntegration({ companyId: pending.companyId, projectId: pending.projectId, slug: pending.slug, sourceId: match.sourceId, credentials: { ...stored, ...(match.credentials ?? {}) }, config: match.config ?? {}, skipValidation: true, replaceId: row.id });
    out.reconnected = 1;
    return out;
  }
  for (const o of chosen) {
    const credentials = { ...stored, ...(o.credentials ?? {}) };
    const existing = await db.integration.findFirst({ where: { companyId: pending.companyId, projectId: pending.projectId, slug: pending.slug, sourceId: o.sourceId } });
    if (existing) {
      await db.integration.update({ where: { id: existing.id }, data: { credentials: encryptJson(credentials), status: 'active', lastError: null, health: 'ok', healthError: null, healthAlertKind: null, healthAlertAt: null, healthCheckedAt: new Date(), tokenExpiresAt: typeof credentials.expiresAt === 'number' ? new Date(credentials.expiresAt) : null } });
      out.reconnected++;
      continue;
    }
    // the accounts were just listed with these very tokens, so a second validation round-trip is skipped
    await connectIntegration({ companyId: pending.companyId, projectId: pending.projectId, slug: pending.slug, name: o.name, sourceId: o.sourceId, credentials, config: o.config ?? {}, skipValidation: true });
    out.created++;
  }
  return out;
}
