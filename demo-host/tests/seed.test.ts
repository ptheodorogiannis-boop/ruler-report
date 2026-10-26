// Task 1: the seed of the demo company exported from prisma/dev.db.
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import type { Seed } from '../src/seed/types';

const file = 'demo-host/capture-out/seed.json';

test('seed has the demo company only', () => {
  assert.ok(existsSync(file), `${file} exists`);
  assert.ok(statSync(file).size <= 1_000_000, `seed ≤ 1 MB (${statSync(file).size} bytes)`);
  const seed = JSON.parse(readFileSync(file, 'utf8')) as Seed;
  assert.equal(seed.version, 1);
  assert.equal(seed.company.id, 1);
  assert.equal(seed.reports.length, 11, 'twelve reports less the scratch one');
  assert.ok(!seed.reports.some((r) => r.id === 7), 'report 7 left out');
  assert.ok(seed.reports.every((r) => r.companyId === 1));
  assert.equal(seed.projects.length, 6, 'six sample clients; the empty scratch projects are left out');
  assert.ok(!seed.projects.some((p) => /^test$/i.test(String(p.name).trim())), 'no scratch project');
  assert.equal(seed.integrations.length, 42);
  assert.ok(seed.integrations.every((i) => JSON.stringify(i.credentials) === JSON.stringify({ demo: true })), 'no credentials leave the database');
  assert.equal(seed.templates.length, 11);
  assert.equal(seed.users.length, 1);
  assert.equal(seed.users[0].email, 'admin@demo.local');
  assert.equal(seed.users[0].passwordHash, '');
  assert.ok(Array.isArray(seed.dateFields.reports) && seed.dateFields.reports.includes('createdAt'), 'date fields recorded');
});
