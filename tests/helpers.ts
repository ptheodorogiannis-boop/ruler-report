import { db } from '../src/lib/db';
import { encryptJson, randomToken, sha256 } from '../src/lib/crypto';
// the shared components read strings through the request store; importing the i18n index registers the dictionaries
// for this process the way the app's root layout does
import '../src/lib/i18n';
import { PLATFORM_TEMPLATES } from '../src/lib/templates/defaults';

export async function ensureTemplates() {
  if (await db.template.count({ where: { companyId: null } })) return;
  for (const t of PLATFORM_TEMPLATES) await db.template.create({ data: { companyId: null, title: t.title, description: t.description, kind: t.kind, isDefault: !!t.isDefault, sections: t.sections as any } });
}

export async function makeCompany(name = 'Test Co') {
  await ensureTemplates();
  const company = await db.company.create({ data: { name: `${name} ${randomToken(4)}` } });
  const token = `rr_${randomToken(16)}`;
  await db.apiToken.create({ data: { companyId: company.id, name: 't', prefix: token.slice(0, 7), tokenHash: sha256(token) } });
  const project = await db.project.create({ data: { companyId: company.id, name: 'Client A', timezone: 'Europe/Athens', currency: 'EUR' } });
  return { company, token, project };
}

export async function addIntegration(companyId: number, projectId: number, slug: string, extra: { sourceId?: string; demo?: boolean; credentials?: object; config?: object } = {}) {
  return db.integration.create({
    data: {
      companyId,
      projectId,
      slug,
      name: `${slug} test`,
      sourceId: extra.sourceId ?? `src-${randomToken(4)}`,
      credentials: extra.demo === false ? (extra.credentials ? encryptJson(extra.credentials) : null) : encryptJson({ demo: true }),
      config: { currency: 'EUR', ...(extra.config ?? {}) },
    },
  });
}

export async function api(token: string, method: string, path: string, body?: unknown) {
  const { NextRequest } = await import('next/server');
  const mod = await import('../src/app/api/v2/[...path]/route');
  const url = `http://localhost:3100/api/v2${path}`;
  const req = new NextRequest(url, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const segs = path.split('?')[0].split('/').filter(Boolean);
  const res = await (mod as any)[method](req, { params: Promise.resolve({ path: segs }) });
  const text = await res.text();
  let json: any = text;
  try {
    json = JSON.parse(text);
  } catch {
    /* csv */
  }
  return { status: res.status as number, json, headers: res.headers as Headers };
}
