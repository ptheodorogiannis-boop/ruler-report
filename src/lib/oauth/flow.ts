// Request-level OAuth flow, kept free of next/headers so tests can call it with a plain NextRequest and a
// stand-in Principal. The route files in src/app/api/oauth/* are one-liners around startOAuth / handleCallback.
import { NextRequest, NextResponse } from 'next/server';
import { assertProject, canWrite, type Principal } from '@/lib/auth';
import { getIntegrationDef } from '@/lib/catalog/integrations';
import { encryptJson } from '@/lib/crypto';
import { db } from '@/lib/db';
import { connectIntegration } from '@/lib/services/integrations';
import { PENDING_COOKIE, cookieOptions, sealPending, type Pending } from './pending';
import { OAUTH_SLUGS, PROVIDER_NAME, PROVIDER_SLUGS, authUrl, bundleSlugs, exchangeCode, listAccounts, providerConfigured, storedCredentials, type AccountOption } from './providers';
import { signState, verifyState, type Provider } from './state';

const base = (req: NextRequest) => (process.env.APP_URL || req.nextUrl.origin).replace(/\/$/, '');
export const redirectUri = (req: NextRequest, provider: Provider) => `${base(req)}/api/oauth/${provider}/callback`;
const go = (req: NextRequest, path: string) => NextResponse.redirect(new URL(path, base(req) + '/'));
// '' = the user started from "Connect with Google/Meta" on the catalog, so errors go back there
const backToConnect = (req: NextRequest, projectId: number, slug: string, msg: string) => go(req, `/projects/${projectId}/connect${slug ? `/${encodeURIComponent(slug)}` : ''}?oauth_error=${encodeURIComponent(msg.slice(0, 300))}`);
/** Where the one-consent picker lives. */
export const accountsPath = (projectId: number, provider: Provider) => `/projects/${projectId}/connect/accounts?provider=${provider}`;

/**
 * One consent for every network of the provider ("Connect with Google" / "Connect with Meta", and the
 * Continue button on a single integration page): Google Ads, Analytics, Search Console, YouTube and Business
 * Profile in one Google sign-in; Meta Ads, Facebook Pages and Instagram in one Meta sign-in.
 */
async function startBundle(req: NextRequest, p: Principal, provider: Provider): Promise<NextResponse> {
  const projectId = Number(req.nextUrl.searchParams.get('projectId'));
  const entry = req.nextUrl.searchParams.get('slug') ?? '';
  if (!Number.isInteger(projectId) || (entry && !PROVIDER_SLUGS[provider].includes(entry))) return NextResponse.json({ message: 'Unknown integration for this provider' }, { status: 400 });
  try {
    if (!canWrite(p)) throw new Error('Your role is read-only.');
    await assertProject(p, projectId);
  } catch (e) {
    return NextResponse.json({ message: (e as Error).message }, { status: 403 });
  }
  if (!providerConfigured(provider)) return backToConnect(req, projectId, entry, `${PROVIDER_NAME[provider]} sign-in is not set up on this server yet. An admin adds it once in Settings → System.`);
  const slugs = bundleSlugs(provider);
  if (!slugs.length) return backToConnect(req, projectId, entry, `No ${PROVIDER_NAME[provider]} network can be connected on this server yet.`);
  const state = await signState({ provider, companyId: p.companyId, projectId, slug: entry, userId: p.userId, slugs });
  return NextResponse.redirect(authUrl(provider, slugs, state, redirectUri(req, provider)));
}

export async function startOAuth(req: NextRequest, p: Principal | null, provider: Provider): Promise<NextResponse> {
  if (!p) return go(req, '/login');
  if (req.nextUrl.searchParams.get('bundle') === '1') return startBundle(req, p, provider);
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
  // no usable state: nothing ties this callback to a project, so explain on the projects page what went wrong. A
  // provider that refused the request (a misconfigured app, say) usually says why in error_description.
  const lost = (why: string) => {
    const said = q.get('error_description') || q.get('error_message') || q.get('error_reason');
    const reason = (said || why).trim().replace(/[.\s]*$/, '.');
    const msg = `The ${PROVIDER_NAME[provider]} sign-in could not be completed: ${reason} Start again from the project's Connect page.`;
    return go(req, `/projects?oauth_error=${encodeURIComponent(msg.slice(0, 300))}`);
  };
  let state;
  try {
    state = await verifyState(q.get('state'));
  } catch (e) {
    return lost((e as Error).message);
  }
  if (state.provider !== provider) return lost('the sign-in link belongs to another provider.');
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
  if (state.slugs) {
    try {
      const tokens = await exchangeCode(provider, slug, code, redirectUri(req, provider), state.slugs);
      const res = go(req, accountsPath(projectId, provider));
      res.cookies.set(PENDING_COOKIE, sealPending({ provider, companyId: p.companyId, projectId, slug, userId: p.userId, credentials: tokens.credentials, account: tokens.account, slugs: state.slugs, granted: tokens.granted ?? state.slugs }), cookieOptions());
      return res;
    } catch (e) {
      return backToConnect(req, projectId, slug, (e as Error).message);
    }
  }
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
  return !!pending && !pending.slugs && pending.companyId === p.companyId && pending.userId === p.userId && pending.projectId === projectId && pending.slug === slug;
}
/** The one-consent equivalent: same user, company and project, and the provider the picker was opened for. */
export function bundleMatches(pending: Pending | null, p: Principal, projectId: number, provider: Provider): pending is Pending & { slugs: string[]; granted: string[] } {
  return !!pending && !!pending.slugs && !!pending.granted && pending.provider === provider && pending.companyId === p.companyId && pending.userId === p.userId && pending.projectId === projectId;
}

export interface FinalizeResult {
  created: number;
  reconnected: number;
}

/** Creates one integration per selected account (or refreshes credentials when that account is already
 *  connected to the project). The selection is re-validated against a fresh account listing. */
export async function finalizeSelection(pending: Pending, keys: string[], deps: { listAccounts?: typeof listAccounts; onConnected?: (integrationId: number) => void; nameFor?: (o: AccountOption) => string } = {}): Promise<FinalizeResult> {
  const wanted = new Set(keys);
  if (!wanted.size) throw new Error('Select at least one account.');
  const chosen = (await (deps.listAccounts ?? listAccounts)(pending.slug, pending.credentials)).filter((o) => wanted.has(o.key) && !o.blocked);
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
    deps.onConnected?.(row.id);
    out.reconnected = 1;
    return out;
  }
  for (const o of chosen) {
    const credentials = { ...stored, ...(o.credentials ?? {}) };
    const existing = await db.integration.findFirst({ where: { companyId: pending.companyId, projectId: pending.projectId, slug: pending.slug, sourceId: o.sourceId } });
    if (existing) {
      await db.integration.update({ where: { id: existing.id }, data: { credentials: encryptJson(credentials), status: 'active', lastError: null, health: 'ok', healthError: null, healthAlertKind: null, healthAlertAt: null, healthCheckedAt: new Date(), tokenExpiresAt: typeof credentials.expiresAt === 'number' ? new Date(credentials.expiresAt) : null } });
      deps.onConnected?.(existing.id);
      out.reconnected++;
      continue;
    }
    // the accounts were just listed with these very tokens, so a second validation round-trip is skipped
    const created = await connectIntegration({ companyId: pending.companyId, projectId: pending.projectId, slug: pending.slug, name: deps.nameFor ? deps.nameFor(o) : o.name, sourceId: o.sourceId, credentials, config: o.config ?? {}, skipValidation: true });
    deps.onConnected?.(created.id);
    out.created++;
  }
  return out;
}

/** One sign-in can add "Acme" as a Meta Ads account, a Page and an Instagram account: say which, unless the name already does. */
export function nameWithPlatform(name: string, platform: string): string {
  return name.toLowerCase().includes(platform.toLowerCase()) ? name : `${name} – ${platform}`;
}

/** Picker values are `<slug>:<account key>`; slugs never contain ':' so the first one splits them. */
export const pickValue = (slug: string, key: string) => `${slug}:${key}`;
export function splitPick(v: string): { slug: string; key: string } | null {
  const i = v.indexOf(':');
  return i > 0 ? { slug: v.slice(0, i), key: v.slice(i + 1) } : null;
}

export interface BundleResult extends FinalizeResult {
  /** networks whose accounts could not be added; the others were */
  errors: { slug: string; message: string }[];
  /** the integrations created or refreshed, in pick order */
  ids: number[];
}

/** One-consent submit: the picks are grouped per network and each group goes through finalizeSelection, which
 *  re-lists that network's accounts with the pending tokens and keeps only ones still accessible. */
export async function finalizeBundle(pending: Pending, picks: string[], deps: { listAccounts?: typeof listAccounts } = {}): Promise<BundleResult> {
  const groups = new Map<string, string[]>();
  for (const v of picks) {
    const sp = splitPick(v);
    if (!sp || !pending.granted?.includes(sp.slug)) continue;
    groups.set(sp.slug, [...(groups.get(sp.slug) ?? []), sp.key]);
  }
  if (!groups.size) throw new Error('Select at least one account.');
  const out: BundleResult = { created: 0, reconnected: 0, errors: [], ids: [] };
  for (const [slug, keys] of groups) {
    try {
      const r = await finalizeSelection({ ...pending, slug, slugs: undefined, granted: undefined, integrationId: undefined }, keys, { ...deps, onConnected: (id) => out.ids.push(id), nameFor: (o) => nameWithPlatform(o.name, getIntegrationDef(slug)?.name ?? slug) });
      out.created += r.created;
      out.reconnected += r.reconnected;
    } catch (e) {
      out.errors.push({ slug, message: (e as Error).message });
    }
  }
  if (!out.created && !out.reconnected) throw new Error(out.errors.map((e) => `${getIntegrationDef(e.slug)?.name ?? e.slug}: ${e.message}`).join(' · '));
  return out;
}
