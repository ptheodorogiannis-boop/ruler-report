import bcrypt from 'bcryptjs';
import { resolveLocale, type Locale } from '@/lib/i18n';
import { SignJWT, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { sha256 } from '@/lib/crypto';

const COOKIE = 'rr_session';
const key = () => new TextEncoder().encode(process.env.APP_SECRET || 'dev-insecure-secret-change-me-please-0000');

export type Role = 'owner' | 'admin' | 'editor' | 'viewer' | 'client';
export interface Principal {
  kind: 'user' | 'token';
  companyId: number;
  userId: number | null;
  name: string;
  email?: string;
  role: Role;
  /** null = all projects of the company */
  projectIds: number[] | null;
  /** the UI language (spec v3 §5): the user's override, else the company's setting */
  locale?: Locale;
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const checkPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export async function createSession(userId: number) {
  const jwt = await new SignJWT({ uid: userId }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('14d').setIssuedAt().sign(key());
  const c = await cookies();
  c.set(COOKIE, jwt, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 14 * 86400 });
}
export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

async function principalFromUser(userId: number): Promise<Principal | null> {
  const u = await db.user.findUnique({ where: { id: userId }, include: { access: true, company: { select: { locale: true } } } });
  if (!u) return null;
  const restricted = u.role === 'client' || (!['owner', 'admin'].includes(u.role) && u.access.length > 0);
  return { kind: 'user', companyId: u.companyId, userId: u.id, name: u.name, email: u.email, role: u.role as Role, projectIds: restricted ? u.access.map((a) => a.projectId) : null, locale: resolveLocale({ user: u.locale, company: u.company.locale }) };
}

export async function getPrincipal(): Promise<Principal | null> {
  try {
    const c = await cookies();
    const tok = c.get(COOKIE)?.value;
    if (!tok) return null;
    const { payload } = await jwtVerify(tok, key());
    return await principalFromUser(Number(payload.uid));
  } catch {
    return null;
  }
}

export async function requirePrincipal(): Promise<Principal> {
  const p = await getPrincipal();
  if (!p) redirect('/login');
  return p;
}

/** Bearer-token principal for the public API (full company access, like a Reportei token). */
export async function tokenPrincipal(authorization: string | null): Promise<Principal | null> {
  const m = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const t = await db.apiToken.findUnique({ where: { tokenHash: sha256(m[1].trim()) } });
  if (!t) return null;
  db.apiToken.update({ where: { id: t.id }, data: { lastUsedAt: new Date() } }).catch(() => null);
  return { kind: 'token', companyId: t.companyId, userId: null, name: `API token ${t.name}`, role: 'admin', projectIds: null };
}

export const canWrite = (p: Principal) => ['owner', 'admin', 'editor'].includes(p.role);
export const canAdmin = (p: Principal) => ['owner', 'admin'].includes(p.role);

export function projectScope(p: Principal) {
  return { companyId: p.companyId, ...(p.projectIds ? { id: { in: p.projectIds } } : {}) };
}
export async function assertProject(p: Principal, projectId: number) {
  // AND, not a spread: projectScope() carries its own `id` filter for restricted users and would overwrite `id: projectId`
  const proj = await db.project.findFirst({ where: { AND: [{ id: projectId }, projectScope(p)] } });
  if (!proj) throw new Error('Project not found');
  return proj;
}
export async function requestHost() {
  return (await headers()).get('host') ?? '';
}
