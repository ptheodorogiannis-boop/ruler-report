// A Prisma stand-in over in-memory tables, enough for the app's own services to run in a browser on the demo seed.
// It supports the query shapes those services use; anything else throws MemDbUnsupported so a gap shows up in tests
// instead of as wrong data.
import type { Row, Seed } from '../seed/types';

export class MemDbUnsupported extends Error {
  constructor(what: string) {
    super(`MemDbUnsupported: ${what}`);
    this.name = 'MemDbUnsupported';
  }
}

type Args = Record<string, any>;
interface Rel {
  kind: 'one' | 'many';
  model: string;
  /** field on this row */
  local: string;
  /** field on the related row */
  foreign: string;
}

const one = (model: string, local: string, foreign = 'id'): Rel => ({ kind: 'one', model, local, foreign });
const many = (model: string, foreign: string, local = 'id'): Rel => ({ kind: 'many', model, local, foreign });

const RELATIONS: Record<string, Record<string, Rel>> = {
  company: { projects: many('project', 'companyId'), users: many('user', 'companyId'), templates: many('template', 'companyId') },
  project: {
    company: one('company', 'companyId'),
    integrations: many('integration', 'projectId'),
    reports: many('report', 'projectId'),
    goals: many('goal', 'projectId'),
    timelineEvents: many('timelineEvent', 'projectId'),
    automations: many('automation', 'projectId'),
  },
  integration: { company: one('company', 'companyId'), project: one('project', 'projectId') },
  template: { company: one('company', 'companyId'), reports: many('report', 'templateId') },
  report: { company: one('company', 'companyId'), project: one('project', 'projectId'), template: one('template', 'templateId') },
  customMetric: { company: one('company', 'companyId'), project: one('project', 'projectId') },
  goal: { project: one('project', 'projectId'), integration: one('integration', 'integrationId') },
  timelineEvent: { project: one('project', 'projectId') },
  user: { company: one('company', 'companyId') },
  automation: { project: one('project', 'projectId') },
  notification: { company: one('company', 'companyId'), project: one('project', 'projectId') },
};

const TABLE_OF: Record<string, keyof Seed | 'company'> = {
  project: 'projects',
  integration: 'integrations',
  template: 'templates',
  report: 'reports',
  customMetric: 'customMetrics',
  goal: 'goals',
  timelineEvent: 'timelineEvents',
  user: 'users',
};

/** The `@default(...)` values of prisma/schema.prisma the app's creates rely on (review C1): a new report is shared, etc. */
const DEFAULTS: Record<string, Row> = {
  report: { kind: 'report', subtitle: 'Performance analysis', preset: 'custom', shareEnabled: true, views: 0 },
  template: { description: '', kind: 'report', isDefault: false, usedCount: 0 },
};

const OPS = new Set(['equals', 'in', 'notIn', 'not', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith', 'endsWith', 'mode']);
const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));
const cmpVal = (v: unknown) => (v instanceof Date ? v.getTime() : v);
const isPlain = (v: unknown): v is Args => !!v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v);

export interface MemModel {
  findMany(args?: Args): Promise<Row[]>;
  findFirst(args?: Args): Promise<Row | null>;
  findUnique(args: Args): Promise<Row | null>;
  findFirstOrThrow(args?: Args): Promise<Row>;
  findUniqueOrThrow(args: Args): Promise<Row>;
  create(args: Args): Promise<Row>;
  createMany(args: Args): Promise<{ count: number }>;
  update(args: Args): Promise<Row>;
  updateMany(args: Args): Promise<{ count: number }>;
  upsert(args: Args): Promise<Row>;
  delete(args: Args): Promise<Row>;
  deleteMany(args?: Args): Promise<{ count: number }>;
  count(args?: Args): Promise<number>;
}

export type MemDb = Record<string, MemModel> & {
  $transaction<T>(arg: Promise<T>[] | ((tx: MemDb) => Promise<T>)): Promise<T | T[]>;
  $disconnect(): Promise<void>;
  /** the live tables, for persistence */
  $tables: Record<string, Row[]>;
  /** replace a table with rows read back from storage (ISO dates revived) */
  $replace(model: string, rows: Row[]): void;
  /** the highest id each table has handed out (ids are never reused) */
  $highWater: Record<string, number>;
  $setHighWater(marks: Record<string, number>): void;
};

/** Build the database. `dateFields` per model name revive ISO strings as Dates. */
export function createMemDb(seed: Seed): MemDb {
  const tables: Record<string, Row[]> = {};
  const dates: Record<string, string[]> = {};
  const revive = (model: string, r: Row): Row => {
    const o = { ...r };
    for (const f of dates[model] ?? []) if (typeof o[f] === 'string') o[f] = new Date(o[f]);
    return o;
  };
  dates.company = seed.dateFields.company ?? [];
  tables.company = [revive('company', seed.company)];
  for (const [model, table] of Object.entries(TABLE_OF)) {
    dates[model] = (seed.dateFields as Record<string, string[]>)[table as string] ?? [];
    tables[model] = ((seed as unknown as Record<string, Row[]>)[table as string] ?? []).map((r) => revive(model, r));
  }
  const tableOf = (model: string) => (tables[model] ??= []);

  // ───────── matching ─────────
  function matchField(model: string, value: unknown, cond: unknown, key: string): boolean {
    if (cond === null) return value == null;
    if (!isPlain(cond)) return cmpVal(value) === cmpVal(cond);
    for (const op of Object.keys(cond)) if (!OPS.has(op)) throw new MemDbUnsupported(`${model}.where.${key}.${op}`);
    const insensitive = cond.mode === 'insensitive';
    const s = (x: unknown) => (insensitive ? String(x ?? '').toLowerCase() : String(x ?? ''));
    for (const [op, arg] of Object.entries(cond)) {
      if (op === 'mode') continue;
      const v = cmpVal(value) as any;
      const a = cmpVal(arg) as any;
      const ok =
        op === 'equals' ? (arg === null ? value == null : v === a)
        : op === 'in' ? (arg as unknown[]).map(cmpVal).includes(v)
        : op === 'notIn' ? !(arg as unknown[]).map(cmpVal).includes(v)
        : op === 'not' ? (isPlain(arg) ? !matchField(model, value, arg, key) : arg === null ? value != null : v !== a)
        : op === 'gt' ? v != null && v > a
        : op === 'gte' ? v != null && v >= a
        : op === 'lt' ? v != null && v < a
        : op === 'lte' ? v != null && v <= a
        : op === 'contains' ? s(value).includes(s(arg))
        : op === 'startsWith' ? s(value).startsWith(s(arg))
        : op === 'endsWith' ? s(value).endsWith(s(arg))
        : false;
      if (!ok) return false;
    }
    return true;
  }

  function related(model: string, row: Row, rel: Rel): Row | Row[] | null {
    if (rel.kind === 'one') return row[rel.local] == null ? null : tableOf(rel.model).find((r) => r[rel.foreign] === row[rel.local]) ?? null;
    return tableOf(rel.model).filter((r) => r[rel.foreign] === row[rel.local]);
  }

  function matches(model: string, row: Row, where: Args | undefined): boolean {
    if (!where) return true;
    for (const [k, cond] of Object.entries(where)) {
      if (cond === undefined) continue;
      if (k === 'AND') {
        if (!(Array.isArray(cond) ? cond : [cond]).every((w) => matches(model, row, w))) return false;
        continue;
      }
      if (k === 'OR') {
        if (!(cond as Args[]).some((w) => matches(model, row, w))) return false;
        continue;
      }
      if (k === 'NOT') {
        if ((Array.isArray(cond) ? cond : [cond]).some((w) => matches(model, row, w))) return false;
        continue;
      }
      const rel = RELATIONS[model]?.[k];
      if (rel) {
        const target = related(model, row, rel);
        if (rel.kind === 'one') {
          if (cond === null) {
            if (target != null) return false;
            continue;
          }
          const inner = isPlain(cond) && ('is' in cond || 'isNot' in cond) ? cond : { is: cond };
          if ('is' in inner && !(inner.is === null ? target == null : target != null && matches(rel.model, target as Row, inner.is))) return false;
          if ('isNot' in inner && (inner.isNot === null ? target == null : target != null && matches(rel.model, target as Row, inner.isNot))) return false;
        } else {
          const list = target as Row[];
          if (!isPlain(cond)) throw new MemDbUnsupported(`${model}.where.${k}`);
          if (cond.some && !list.some((r) => matches(rel.model, r, cond.some))) return false;
          if (cond.every && !list.every((r) => matches(rel.model, r, cond.every))) return false;
          if (cond.none && list.some((r) => matches(rel.model, r, cond.none))) return false;
        }
        continue;
      }
      if (!matchField(model, row[k], cond, k)) return false;
    }
    return true;
  }

  // ───────── ordering, shaping ─────────
  function sort(model: string, rows: Row[], orderBy: Args | Args[] | undefined): Row[] {
    if (!orderBy) return rows;
    const keys = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap((o) => Object.entries(o));
    for (const [k, dir] of keys) if (typeof dir !== 'string') throw new MemDbUnsupported(`${model}.orderBy.${k}`);
    return [...rows].sort((a, b) => {
      for (const [k, dir] of keys) {
        const x = cmpVal(a[k]) as any;
        const y = cmpVal(b[k]) as any;
        if (x === y) continue;
        if (x == null) return 1;
        if (y == null) return -1;
        return (x < y ? -1 : 1) * (dir === 'desc' ? -1 : 1);
      }
      return 0;
    });
  }

  function countOf(model: string, row: Row, spec: Args | true): Record<string, number> {
    const sel = spec === true ? Object.fromEntries(Object.keys(RELATIONS[model] ?? {}).filter((k) => RELATIONS[model][k].kind === 'many').map((k) => [k, true])) : spec.select ?? {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(sel)) {
      const rel = RELATIONS[model]?.[k];
      if (!rel || rel.kind !== 'many') throw new MemDbUnsupported(`${model}._count.${k}`);
      const list = related(model, row, rel) as Row[];
      out[k] = isPlain(v) && v.where ? list.filter((r) => matches(rel.model, r, v.where)).length : list.length;
    }
    return out;
  }

  function resolveRel(model: string, row: Row, k: string, v: unknown): unknown {
    const rel = RELATIONS[model]?.[k];
    if (!rel) throw new MemDbUnsupported(`${model}.include.${k}`);
    const target = related(model, row, rel);
    const nested = isPlain(v) ? v : {};
    if (rel.kind === 'one') return target == null ? null : shape(rel.model, target as Row, nested);
    let list = (target as Row[]).filter((r) => matches(rel.model, r, nested.where));
    list = sort(rel.model, list, nested.orderBy);
    if (nested.skip) list = list.slice(nested.skip);
    if (nested.take != null) list = list.slice(0, nested.take);
    return list.map((r) => shape(rel.model, r, nested));
  }

  function shape(model: string, row: Row, args: Args): Row {
    if (args.select) {
      const out: Row = {};
      for (const [k, v] of Object.entries(args.select)) {
        if (!v) continue;
        if (k === '_count') out._count = countOf(model, row, v);
        else if (RELATIONS[model]?.[k]) out[k] = resolveRel(model, row, k, v);
        else out[k] = clone(row[k]);
      }
      return out;
    }
    const out = clone(row);
    for (const [k, v] of Object.entries(args.include ?? {})) {
      if (!v) continue;
      if (k === '_count') out._count = countOf(model, row, v);
      else out[k] = resolveRel(model, row, k, v);
    }
    return out;
  }

  // ───────── writes ─────────
  const now = () => new Date();
  function applyData(model: string, row: Row, data: Args, creating: boolean): Row {
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      if (RELATIONS[model]?.[k]) throw new MemDbUnsupported(`${model}.data.${k} (nested write)`);
      if (isPlain(v) && ('increment' in v || 'decrement' in v || 'set' in v || 'multiply' in v)) {
        if ('set' in v) row[k] = clone(v.set);
        else if ('increment' in v) row[k] = (Number(row[k]) || 0) + Number(v.increment);
        else if ('decrement' in v) row[k] = (Number(row[k]) || 0) - Number(v.decrement);
        else row[k] = (Number(row[k]) || 0) * Number(v.multiply);
        continue;
      }
      row[k] = clone(v);
    }
    if ('updatedAt' in row || (dates[model] ?? []).includes('updatedAt')) row.updatedAt = now();
    if (creating && !row.createdAt && (dates[model] ?? []).includes('createdAt')) row.createdAt = now();
    return row;
  }
  // ids are never reused, even after a delete (review M8): a high-water mark per table, kept across reloads by the store
  const highWater: Record<string, number> = {};
  const maxId = (model: string) => tableOf(model).reduce((m, r) => Math.max(m, Number(r.id) || 0), 0);
  const nextId = (model: string) => {
    const n = Math.max(highWater[model] ?? 0, maxId(model)) + 1;
    highWater[model] = n;
    return n;
  };
  const seen = (model: string, id: unknown) => {
    if (Number(id) > (highWater[model] ?? 0)) highWater[model] = Number(id);
  };
  for (const m of Object.keys(tables)) highWater[m] = maxId(m);
  const findIndex = (model: string, where: Args) => tableOf(model).findIndex((r) => matches(model, r, where));

  function model(name: string): MemModel {
    const many_ = (args: Args = {}): Row[] => {
      let rows = tableOf(name).filter((r) => matches(name, r, args.where));
      rows = sort(name, rows, args.orderBy);
      if (args.distinct) throw new MemDbUnsupported(`${name}.distinct`);
      if (args.skip) rows = rows.slice(args.skip);
      if (args.take != null) rows = args.take >= 0 ? rows.slice(0, args.take) : rows.slice(args.take);
      return rows.map((r) => shape(name, r, args));
    };
    const first = (args: Args = {}) => many_({ ...args, take: 1 })[0] ?? null;
    const orThrow = (r: Row | null) => {
      if (!r) {
        const e = new Error(`No ${name} found`);
        (e as any).code = 'P2025';
        throw e;
      }
      return r;
    };
    return {
      findMany: async (a) => many_(a),
      findFirst: async (a) => first(a),
      findUnique: async (a) => first(a),
      findFirstOrThrow: async (a) => orThrow(first(a)),
      findUniqueOrThrow: async (a) => orThrow(first(a)),
      async create(a) {
        const id = a.data?.id ?? nextId(name);
        seen(name, id);
        const row = applyData(name, { id, ...clone(DEFAULTS[name] ?? {}) }, a.data ?? {}, true);
        tableOf(name).push(row);
        return shape(name, row, a);
      },
      async createMany(a) {
        for (const d of a.data ?? []) {
          const id = d.id ?? nextId(name);
          seen(name, id);
          tableOf(name).push(applyData(name, { id, ...clone(DEFAULTS[name] ?? {}) }, d, true));
        }
        return { count: (a.data ?? []).length };
      },
      async update(a) {
        const i = findIndex(name, a.where);
        const row = orThrow(i < 0 ? null : tableOf(name)[i]);
        applyData(name, row, a.data ?? {}, false);
        return shape(name, row, a);
      },
      async updateMany(a) {
        const rows = tableOf(name).filter((r) => matches(name, r, a.where));
        for (const r of rows) applyData(name, r, a.data ?? {}, false);
        return { count: rows.length };
      },
      async upsert(a) {
        const i = findIndex(name, a.where);
        if (i >= 0) return this.update({ where: a.where, data: a.update, select: a.select, include: a.include });
        return this.create({ data: a.create, select: a.select, include: a.include });
      },
      async delete(a) {
        const i = findIndex(name, a.where);
        const row = orThrow(i < 0 ? null : tableOf(name)[i]);
        tableOf(name).splice(i, 1);
        return shape(name, row, a);
      },
      async deleteMany(a = {}) {
        const keep = tableOf(name).filter((r) => !matches(name, r, a.where));
        const count = tableOf(name).length - keep.length;
        tables[name] = keep;
        return { count };
      },
      count: async (a = {}) => tableOf(name).filter((r) => matches(name, r, a.where)).length,
    };
  }

  const models = new Map<string, MemModel>();
  const target = {
    async $transaction(arg: any) {
      return typeof arg === 'function' ? arg(proxy) : Promise.all(arg);
    },
    async $disconnect() {},
    $tables: tables,
    $replace(model: string, rows: Row[]) {
      tables[model] = rows.map((r) => revive(model, r));
      for (const r of rows) seen(model, r.id);
    },
    $highWater: highWater,
    $setHighWater(marks: Record<string, number>) {
      for (const [m, n] of Object.entries(marks ?? {})) seen(m, n);
    },
  };
  const proxy: MemDb = new Proxy(target as unknown as MemDb, {
    get(t, prop: string) {
      if (prop in t) return (t as any)[prop];
      if (typeof prop !== 'string' || prop.startsWith('$') || prop === 'then') return undefined;
      if (!models.has(prop)) models.set(prop, model(prop));
      return models.get(prop);
    },
  });
  return proxy;
}
