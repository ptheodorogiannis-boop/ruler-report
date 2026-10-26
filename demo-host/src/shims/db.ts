// `@/lib/db` in the demo: the in-memory database the store installs with setDb.
import type { MemDb } from '../server/memdb';

let current: MemDb | null = null;

export function setDb(next: MemDb): void {
  current = next;
}

export const db: MemDb = new Proxy({} as MemDb, {
  get(_t, prop) {
    if (!current) throw new Error('The demo database is not ready yet');
    return (current as any)[prop];
  },
});
