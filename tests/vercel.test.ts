// Hosting on Vercel with a hosted Postgres database: the build picks its path from the environment, text search stays
// case-insensitive on Postgres, uploads can live in the database (Vercel functions have no lasting disk), and the
// scheduler and PDFs default off on Vercel.
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readdirSync } from 'node:fs';
import { db } from '../src/lib/db';
import { makeCompany } from './helpers';
import { buildPlan, pgSchema } from '../scripts/build.mjs';
import { containsText, mediaStore, pdfAllowed, schedulerEnabled } from '../src/lib/platform';

const PG = 'postgresql://u:p@host.example/db?sslmode=require';
const SECRET = 'x'.repeat(32);
// a 1×1 transparent PNG
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ff0f000101010079c0b9890000000049454e44ae426082', 'hex');

test('build plan: SQLite builds as before; Postgres generates its own schema, syncs it, seeds only when asked, then builds', () => {
  assert.deepEqual(buildPlan({}), ['prisma generate', 'next build']);
  assert.deepEqual(buildPlan({ DATABASE_URL: 'file:./dev.db' }), ['prisma generate', 'next build']);
  const pg = buildPlan({ DATABASE_URL: PG, APP_SECRET: SECRET });
  assert.deepEqual(pg, ['write prisma/postgres/schema.prisma', 'prisma generate --schema prisma/postgres/schema.prisma', 'prisma db push --skip-generate --schema prisma/postgres/schema.prisma', 'next build']);
  assert.ok(!pg.some((s) => s.includes('accept-data-loss')), 'a schema change that would drop data stops the build instead');
  assert.deepEqual(buildPlan({ DATABASE_URL: PG, APP_SECRET: SECRET, SEED_DEMO: '1' }).slice(-2), ['tsx prisma/seed.ts', 'next build']);
});

test('build plan: on Vercel it refuses to build without a Postgres database or a real APP_SECRET', () => {
  assert.throws(() => buildPlan({ VERCEL: '1' }), /DATABASE_URL.*Postgres/s);
  assert.throws(() => buildPlan({ VERCEL: '1', DATABASE_URL: 'file:./dev.db', APP_SECRET: SECRET }), /Postgres/);
  assert.throws(() => buildPlan({ VERCEL: '1', DATABASE_URL: PG }), /APP_SECRET/);
  assert.throws(() => buildPlan({ DATABASE_URL: PG, APP_SECRET: 'short' }), /APP_SECRET/);
});

test('pg schema: the SQLite schema with the Postgres provider, plus the direct connection when the integration provides one', () => {
  const src = 'datasource db {\n  provider = "sqlite"\n  url      = env("DATABASE_URL")\n}\n\nmodel A {\n  id Int @id\n}\n';
  const out = pgSchema(src, {});
  assert.match(out, /provider = "postgresql"/);
  assert.doesNotMatch(out, /sqlite|directUrl/);
  assert.match(out, /model A \{\n  id Int @id\n\}/);
  assert.match(pgSchema(src, { DATABASE_URL_UNPOOLED: PG }), /url\s+= env\("DATABASE_URL"\)\n\s+directUrl = env\("DATABASE_URL_UNPOOLED"\)/);
});

test('text search: case-insensitive on Postgres, unchanged on SQLite (which matches ASCII case-insensitively already)', () => {
  assert.deepEqual(containsText('acme', PG), { contains: 'acme', mode: 'insensitive' });
  assert.deepEqual(containsText('acme', 'postgres://h/db'), { contains: 'acme', mode: 'insensitive' });
  assert.deepEqual(containsText('acme', 'file:./dev.db'), { contains: 'acme' });
});

test('platform defaults: on Vercel uploads go to the database and the scheduler and PDFs are off; each can be set explicitly', () => {
  assert.equal(mediaStore({}), 'disk');
  assert.equal(mediaStore({ VERCEL: '1' }), 'db');
  assert.equal(mediaStore({ VERCEL: '1', MEDIA_STORE: 'disk' }), 'disk');
  assert.equal(mediaStore({ MEDIA_STORE: 'db' }), 'db');
  assert.equal(schedulerEnabled({}), true);
  assert.equal(schedulerEnabled({ ENABLE_SCHEDULER: '0' }), false);
  assert.equal(schedulerEnabled({ VERCEL: '1' }), false);
  assert.equal(schedulerEnabled({ VERCEL: '1', ENABLE_SCHEDULER: '1' }), true);
  assert.equal(pdfAllowed({}), true);
  assert.equal(pdfAllowed({ PDF_ENABLED: 'off' }), false);
  assert.equal(pdfAllowed({ VERCEL: '1' }), false);
  assert.equal(pdfAllowed({ VERCEL: '1', PDF_ENABLED: 'auto' }), true);
});

test('media in the database: the bytes live in the row, nothing is written to disk, the route serves them, lists leave them out', async () => {
  const { company } = await makeCompany();
  const before = { ...process.env };
  process.env.MEDIA_STORE = 'db';
  process.env.MEDIA_DIR = 'prisma/test-uploads-db';
  try {
    const { putMedia, readMedia, deleteMedia, listMedia, mediaMaxBytes } = await import('../src/lib/media/store');
    const { getHandler } = await import('../src/lib/media/handlers');
    const m = await putMedia({ companyId: company.id, name: 'dot.png', mime: 'image/png', bytes: PNG, width: 1, height: 1 });
    assert.ok(!existsSync('prisma/test-uploads-db') || readdirSync('prisma/test-uploads-db').length === 0, 'no file on disk');
    const row = await db.media.findUnique({ where: { id: m.id }, select: { data: true } });
    assert.deepEqual(Buffer.from(row!.data!), PNG);
    const r = await readMedia(m.id);
    assert.deepEqual(r && 'bytes' in r ? Buffer.from(r.bytes) : null, PNG);
    const res = await getHandler(m.id);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.equal(res.headers.get('content-length'), String(PNG.length));
    assert.match(res.headers.get('cache-control') ?? '', /immutable/);
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), PNG);
    const listed = await listMedia(company.id);
    assert.equal(listed.length, 1);
    assert.ok(!('data' in listed[0]), 'lists do not carry the bytes');
    // Vercel caps a function's request body at 4.5 MB, so the database store keeps uploads under that
    assert.equal(mediaMaxBytes(), 4 * 1024 * 1024);
    await assert.rejects(putMedia({ companyId: company.id, name: 'big.png', mime: 'image/png', bytes: Buffer.alloc(mediaMaxBytes() + 1) }), /4 MB/);
    assert.equal(await deleteMedia(m.id, company.id), true);
    assert.equal(await readMedia(m.id), null);
  } finally {
    process.env = before;
  }
});
