import { getIntegrationDef } from '@/lib/catalog/integrations';
import { connectorFor } from '@/lib/connectors';
import { invalidateRows } from '@/lib/connectors/custom';
import { encryptJson } from '@/lib/crypto';
import { db } from '@/lib/db';

export interface ConnectInput {
  companyId: number;
  projectId: number;
  slug: string;
  name?: string;
  sourceId: string;
  credentials?: Record<string, any> | null;
  config?: Record<string, any> | null;
  skipValidation?: boolean;
  /** reconnect (spec v3 §1.2): replace the credentials of this row instead of creating one; the sourceId must match */
  replaceId?: number;
}

export async function connectIntegration(inp: ConnectInput) {
  const def = getIntegrationDef(inp.slug);
  if (!def) throw new Error(`Unknown integration slug "${inp.slug}"`);
  const project = await db.project.findFirst({ where: { id: inp.projectId, companyId: inp.companyId } });
  if (!project) throw new Error('Project not found');
  const existing = inp.replaceId ? await db.integration.findFirst({ where: { id: inp.replaceId, companyId: inp.companyId, projectId: inp.projectId, slug: inp.slug } }) : null;
  if (inp.replaceId && !existing) throw new Error('Integration not found');
  if (existing && existing.sourceId !== inp.sourceId) throw new Error(`Pick the same account (${existing.sourceId}) to reconnect, or add a new integration`);
  const credentials = inp.credentials && Object.keys(inp.credentials).length ? inp.credentials : null;
  let config: Record<string, any> = { currency: project.currency, ...((existing?.config as Record<string, any>) ?? {}), ...(inp.config ?? {}) };
  let name = inp.name?.trim() || existing?.name || `${project.name} – ${def.name}`;

  if (!inp.skipValidation) {
    const probe = { id: existing?.id ?? 0, slug: inp.slug, name, sourceId: inp.sourceId, config, credentials };
    const conn = connectorFor(probe);
    if (conn.validate) {
      const res = await conn.validate({ integration: probe });
      if (res?.config) config = { ...config, ...res.config };
      if (res?.name && !inp.name) name = res.name;
    }
  }
  if (existing) {
    const tokenExpiresAt = typeof credentials?.expiresAt === 'number' ? new Date(credentials.expiresAt) : null;
    return db.integration.update({
      where: { id: existing.id },
      data: { name, status: 'active', credentials: credentials ? encryptJson(credentials) : null, config: config as any, health: 'ok', healthError: null, healthCheckedAt: new Date(), tokenExpiresAt, healthAlertKind: null, healthAlertAt: null, lastError: null },
    });
  }
  return db.integration.create({
    data: { companyId: inp.companyId, projectId: project.id, slug: inp.slug, name, sourceId: inp.sourceId, status: 'active', credentials: credentials ? encryptJson(credentials) : null, config: config as any },
  });
}

export async function refreshColumns(id: number) {
  const row = await db.integration.findUnique({ where: { id } });
  if (!row) throw new Error('Integration not found');
  invalidateRows(id);
  const conn = connectorFor({ slug: row.slug, credentials: null });
  const { decryptJson } = await import('@/lib/crypto');
  const probe = { id: row.id, slug: row.slug, name: row.name, sourceId: row.sourceId, config: (row.config as any) ?? {}, credentials: decryptJson(row.credentials) };
  const res = await conn.validate?.({ integration: probe });
  if (res?.config) await db.integration.update({ where: { id }, data: { config: { ...probe.config, ...res.config } as any } });
  return res?.config ?? {};
}
