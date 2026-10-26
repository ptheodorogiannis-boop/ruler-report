// The demo's data: the seed in memory, plus what this viewer created or edited, kept in their browser (localStorage) so a
// reload keeps it. "Reset demo" goes back to the seed. Storage is optional: blocked or failing storage only means edits
// last for the session.
import type { Row, Seed } from '../seed/types';
import { createMemDb, type MemDb } from './memdb';
import { setDb } from '../shims/db';

export const STORE_KEY = 'rr-demo-v1';
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Tables a viewer can change in the live parts; everything else is read-only seed. */
const PERSISTED = ['report', 'template'] as const;
/** Demo-only data adjustments (spec: the client links show the period picker). */
const DEMO_CLIENT_PRESETS = ['last_7d', 'last_30d', 'this_month', 'previous_month'];

let seedRef: Seed | null = null;
let storage: StorageLike | null = null;
let persistOk = false;
let db: MemDb | null = null;
let seedMax: Record<string, number> = {};

function withOverrides(seed: Seed): Seed {
  return { ...seed, reports: seed.reports.map((r) => (r.kind === 'dashboard' && !(Array.isArray(r.clientPresets) && r.clientPresets.length) ? { ...r, clientPresets: DEMO_CLIENT_PRESETS } : r)) };
}

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function probe(s: StorageLike | null): boolean {
  if (!s) return false;
  try {
    s.setItem(`${STORE_KEY}:probe`, '1');
    s.removeItem(`${STORE_KEY}:probe`);
    return true;
  } catch {
    return false;
  }
}

function fresh(): MemDb {
  const next = createMemDb(withOverrides(seedRef!));
  seedMax = Object.fromEntries(PERSISTED.map((t) => [t, next.$tables[t].reduce((m, r) => Math.max(m, Number(r.id) || 0), 0)]));
  return next;
}

/** Load the seed and this viewer's saved changes, and install the database for the app's modules. */
export function initStore(seed: Seed, store: StorageLike | null | undefined = defaultStorage()): void {
  seedRef = seed;
  storage = store ?? null;
  persistOk = probe(storage);
  db = fresh();
  if (persistOk) {
    try {
      const raw = storage!.getItem(STORE_KEY);
      const saved = raw ? (JSON.parse(raw) as { version: number; seed?: string; tables: Record<string, Row[]>; highWater?: Record<string, number> }) : null;
      if (saved && saved.seed !== seed.exportedAt) {
        // saved against another published version (review I7): its tables would hide the new seed
        storage!.removeItem(STORE_KEY);
      } else if (saved?.version === 1) {
        for (const t of PERSISTED) if (Array.isArray(saved.tables?.[t])) db.$replace(t, saved.tables[t]);
        db.$setHighWater(saved.highWater ?? {});
      }
    } catch {
      // unreadable copy: start from the seed
    }
  }
  setDb(db);
}

export function getDb(): MemDb {
  if (!db) throw new Error('initStore has not run');
  return db;
}

export const canPersist = () => persistOk;

/** Save this viewer's changes; quietly does nothing when storage is unavailable or full. */
export function persist(): void {
  if (!persistOk || !db) return;
  try {
    storage!.setItem(STORE_KEY, JSON.stringify({ version: 1, seed: seedRef?.exportedAt, tables: Object.fromEntries(PERSISTED.map((t) => [t, db!.$tables[t]])), highWater: db.$highWater }));
  } catch {
    // quota or blocked: the session keeps the changes
  }
}

/** Back to the seed: forget this viewer's changes. */
export function resetDemo(): void {
  if (persistOk) {
    try {
      storage!.removeItem(STORE_KEY);
    } catch {
      // ignore
    }
  }
  db = fresh();
  setDb(db);
}

// password-protected client links opened in this session (the app keeps this in a cookie)
const unlocked = new Set<string>();
export const isUnlocked = (token: string) => unlocked.has(token);
export const unlock = (token: string) => void unlocked.add(token);

/** Reports or dashboards created in the demo (newest first), for the lists. */
export function createdIds(kind: 'report' | 'dashboard'): number[] {
  if (!db) return [];
  return db.$tables.report
    .filter((r) => Number(r.id) > (seedMax.report ?? 0) && r.kind === kind)
    .map((r) => Number(r.id))
    .sort((a, b) => b - a);
}
