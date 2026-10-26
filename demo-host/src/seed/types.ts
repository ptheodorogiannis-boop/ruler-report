// The demo company's data, exported from prisma/dev.db by demo-host/export-seed.ts and loaded by the in-memory database.
// Dates travel as ISO strings; `dateFields` names, per table, the fields to revive as Date objects.

export type Row = Record<string, any>;

export const SEED_TABLES = ['projects', 'integrations', 'templates', 'reports', 'customMetrics', 'goals', 'timelineEvents', 'users'] as const;
export type SeedTable = (typeof SEED_TABLES)[number];

export interface Seed {
  version: 1;
  exportedAt: string;
  company: Row;
  projects: Row[];
  integrations: Row[];
  templates: Row[];
  reports: Row[];
  customMetrics: Row[];
  goals: Row[];
  timelineEvents: Row[];
  /** the demo admin only, without a password hash (the demo checks the shown credentials itself) */
  users: Row[];
  /** per table (and `company`), the fields that held Date values at export */
  dateFields: Record<SeedTable | 'company', string[]>;
}
