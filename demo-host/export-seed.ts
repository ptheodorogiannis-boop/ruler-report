// Task 1: export the demo company (id 1) from prisma/dev.db to demo-host/capture-out/seed.json.
// Credentials never leave the database: every integration becomes a demo integration. Report 7 ("dsd") is a scratch
// report and is left out. Run from the repository root: npx tsx demo-host/export-seed.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { SEED_TABLES, type Row, type Seed, type SeedTable } from './src/seed/types';

const COMPANY_ID = 1;
const LEFT_OUT_REPORTS = [7];
const OUT_DIR = 'demo-host/capture-out';

const db = new PrismaClient();

/** ISO strings for Date values, and the names of the fields that held them. */
function plain(rows: Row[]): { rows: Row[]; dates: string[] } {
  const dates = new Set<string>();
  const out = rows.map((r) => {
    const o: Row = {};
    for (const [k, v] of Object.entries(r)) {
      if (v instanceof Date) {
        dates.add(k);
        o[k] = v.toISOString();
      } else o[k] = v;
    }
    return o;
  });
  return { rows: out, dates: [...dates].sort() };
}

/** Empty scratch projects ("test", no accounts) are not sample clients; the demo leaves them out. */
export async function leftOutProjects(client = db): Promise<number[]> {
  const rows = await client.project.findMany({ where: { companyId: COMPANY_ID }, select: { id: true, name: true, _count: { select: { integrations: true } } } });
  return rows.filter((p) => /^test$/i.test(p.name.trim()) && p._count.integrations === 0).map((p) => p.id);
}

async function main() {
  const company = await db.company.findUniqueOrThrow({ where: { id: COMPANY_ID } });
  const skip = await leftOutProjects();
  const projectIds = (await db.project.findMany({ where: { companyId: COMPANY_ID, id: { notIn: skip } }, select: { id: true } })).map((p) => p.id);
  const raw: Record<SeedTable, Row[]> = {
    projects: await db.project.findMany({ where: { companyId: COMPANY_ID, id: { notIn: skip } }, orderBy: { id: 'asc' } }),
    integrations: (await db.integration.findMany({ where: { companyId: COMPANY_ID }, orderBy: { id: 'asc' } })).map((i) => ({ ...i, credentials: { demo: true } })),
    templates: await db.template.findMany({ where: { OR: [{ companyId: null }, { companyId: COMPANY_ID }] }, orderBy: { id: 'asc' } }),
    reports: await db.report.findMany({ where: { companyId: COMPANY_ID, id: { notIn: LEFT_OUT_REPORTS } }, orderBy: { id: 'asc' } }),
    customMetrics: await db.customMetric.findMany({ where: { companyId: COMPANY_ID }, orderBy: { id: 'asc' } }),
    goals: await db.goal.findMany({ where: { projectId: { in: projectIds } }, orderBy: { id: 'asc' } }),
    timelineEvents: await db.timelineEvent.findMany({ where: { projectId: { in: projectIds } }, orderBy: { id: 'asc' } }),
    users: (await db.user.findMany({ where: { email: 'admin@demo.local' } })).map((u) => ({ ...u, passwordHash: '' })),
  };
  const dateFields = {} as Seed['dateFields'];
  const tables = {} as Record<SeedTable, Row[]>;
  for (const t of SEED_TABLES) {
    const p = plain(raw[t]);
    tables[t] = p.rows;
    dateFields[t] = p.dates;
  }
  const c = plain([company as Row]);
  dateFields.company = c.dates;
  const seed: Seed = { version: 1, exportedAt: new Date().toISOString(), company: c.rows[0], ...tables, dateFields };
  mkdirSync(OUT_DIR, { recursive: true });
  const json = JSON.stringify(seed);
  writeFileSync(`${OUT_DIR}/seed.json`, json);
  console.log(`seed.json: ${(json.length / 1024).toFixed(0)} KB — ${SEED_TABLES.map((t) => `${t} ${tables[t].length}`).join(', ')}`);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('demo-host/export-seed.ts')) {
  main()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
