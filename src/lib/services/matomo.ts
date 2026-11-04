// Connecting Matomo (docs/superpowers/specs/2026-11-04-ads-previews-sources-matomo-design.md §3): the agency types its Matomo
// address and token once, picks sites, and each site becomes its own integration whose validation reads the goals. Goal
// names can be changed in the tool ("Show as"); Matomo's own names stay in config.goals.
import { GOAL_NAME_MAX } from '@/lib/catalog/matomo-goals';
import { listMatomoSites } from '@/lib/connectors/matomo';
import { decryptJson } from '@/lib/crypto';
import { db } from '@/lib/db';
import { connectIntegration } from './integrations';

export { GOAL_NAME_MAX };

/** "https://m.example/", "https://m.example/index.php" and "https://m.example" are one Matomo. */
const sameAddress = (a: string) => a.trim().toLowerCase().replace(/\/index\.php$/, '').replace(/\/+$/, '');

/** The sites of this Matomo already in the project: site id → integration id (a site id alone could be another Matomo's). */
export async function matomoSitesInProject(companyId: number, projectId: number, baseUrl: string): Promise<Map<string, number>> {
  const rows = await db.integration.findMany({ where: { companyId, projectId, slug: 'matomo' }, select: { id: true, sourceId: true, credentials: true }, orderBy: { id: 'asc' } });
  const want = sameAddress(baseUrl);
  const out = new Map<string, number>();
  for (const r of rows) if (!out.has(r.sourceId) && sameAddress(String(decryptJson<{ baseUrl?: string }>(r.credentials)?.baseUrl ?? '')) === want) out.set(r.sourceId, r.id);
  return out;
}

export async function connectMatomoSites(inp: { companyId: number; projectId: number; baseUrl: string; tokenAuth: string; siteIds: string[] }): Promise<number[]> {
  const siteIds = [...new Set(inp.siteIds.map((s) => String(s).trim()).filter((s) => /^\d+$/.test(s)))];
  if (!siteIds.length) throw new Error('Pick at least one site');
  const credentials = { baseUrl: inp.baseUrl.trim(), tokenAuth: inp.tokenAuth.trim() };
  // one read first, so a wrong token or a site it cannot see connects nothing
  const visible = new Set((await listMatomoSites(credentials)).map((s) => s.id));
  const missing = siteIds.find((s) => !visible.has(s));
  if (missing) throw new Error(`Matomo: this token cannot see site ${missing}`);
  const have = await matomoSitesInProject(inp.companyId, inp.projectId, credentials.baseUrl);
  const ids: number[] = [];
  for (const sourceId of siteIds) {
    // a site already in the project gets the new token on its row, so its reports and automations keep working
    const row = await connectIntegration({ companyId: inp.companyId, projectId: inp.projectId, slug: 'matomo', sourceId, credentials, replaceId: have.get(sourceId) });
    ids.push(row.id);
  }
  return ids;
}

/** "Show as" for each goal id: trimmed, empty removes the rename, longer than 60 characters is refused. Stored as text. */
export async function saveGoalNames(companyId: number, integrationId: number, names: Record<string, string>): Promise<Record<string, string>> {
  const row = await db.integration.findFirst({ where: { id: integrationId, companyId, slug: 'matomo' } });
  if (!row) throw new Error('Integration not found');
  const config = (row.config as Record<string, any>) ?? {};
  const next: Record<string, string> = { ...(config.goalNames ?? {}) };
  for (const [id, raw] of Object.entries(names)) {
    if (!/^\d+$/.test(id)) continue;
    const name = String(raw ?? '').trim();
    if (name.length > GOAL_NAME_MAX) throw new Error(`Goal names are at most ${GOAL_NAME_MAX} characters`);
    if (name) next[id] = name;
    else delete next[id];
  }
  await db.integration.update({ where: { id: row.id }, data: { config: { ...config, goalNames: next } as any } });
  return next;
}
