import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { db } from '../src/lib/db';
import { makeCompany } from './helpers';
import { MEDIA_MAX_BYTES, deleteMedia, mediaDir, putMedia, readMedia } from '../src/lib/media/store';

// a 1×1 transparent PNG
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ff0f000101010079c0b9890000000049454e44ae426082', 'hex');

test('media store: put writes file + row, read streams it, delete removes both', async () => {
  const { company } = await makeCompany();
  process.env.MEDIA_DIR = 'prisma/test-uploads';
  const m = await putMedia({ companyId: company.id, name: 'dot.png', mime: 'image/png', bytes: PNG, width: 1, height: 1 });
  assert.match(m.url, /^\/api\/media\/[a-z0-9]+$/);
  assert.deepEqual([m.width, m.height], [1, 1]);
  const r = await readMedia(m.id);
  assert.equal(r?.mime, 'image/png');
  assert.ok(r && 'path' in r, 'the disk store returns a path');
  assert.deepEqual(readFileSync(r.path), PNG);
  assert.ok(r.path.startsWith(mediaDir(company.id)), 'file lives under the company folder');
  assert.equal(await deleteMedia(m.id, company.id + 1), false, 'another company cannot delete');
  assert.equal(await deleteMedia(m.id, company.id), true);
  assert.equal(await readMedia(m.id), null);
  assert.equal(await db.media.count({ where: { id: m.id } }), 0);
});

test('media store: rejects svg, unknown mime and oversize', async () => {
  const { company } = await makeCompany();
  process.env.MEDIA_DIR = 'prisma/test-uploads';
  await assert.rejects(putMedia({ companyId: company.id, name: 'a.svg', mime: 'image/svg+xml', bytes: PNG }), /type/i);
  await assert.rejects(putMedia({ companyId: company.id, name: 'a.bin', mime: 'application/octet-stream', bytes: PNG }), /type/i);
  await assert.rejects(putMedia({ companyId: company.id, name: 'a.png', mime: 'image/png', bytes: Buffer.alloc(MEDIA_MAX_BYTES + 1) }), /5 MB/);
});

test('media routes: upload 401/403/201, get streams with immutable cache, list, 422 on size and sniffed type, delete 403/204 then 404', async () => {
  const { company } = await makeCompany();
  process.env.MEDIA_DIR = 'prisma/test-uploads';
  const { principalFor } = await import('./principal');
  const owner = await principalFor(company.id, 'owner', null);
  const viewer = await principalFor(company.id, 'viewer', null);
  const { deleteHandler, getHandler, listHandler, uploadHandler } = await import('../src/lib/media/handlers');
  const form = (bytes: Buffer, type: string, name = 'a.png') => {
    const fd = new FormData();
    fd.set('file', new File([new Uint8Array(bytes)], name, { type }));
    fd.set('width', '1');
    fd.set('height', '1');
    return fd;
  };
  assert.equal((await uploadHandler(null, form(PNG, 'image/png'))).status, 401);
  assert.equal((await uploadHandler(viewer, form(PNG, 'image/png'))).status, 403);
  const res = await uploadHandler(owner, form(PNG, 'image/png'));
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.match(body.url, /^\/api\/media\/[a-z0-9]+$/);
  assert.deepEqual([body.width, body.height], [1, 1]);
  const got = await getHandler(body.id);
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('content-type'), 'image/png');
  assert.match(got.headers.get('cache-control') ?? '', /immutable/);
  assert.deepEqual(Buffer.from(await got.arrayBuffer()), PNG);
  const list = await (await listHandler(owner)).json();
  assert.equal(list.items[0].id, body.id);
  assert.equal((await listHandler(viewer)).status, 403);
  assert.equal((await uploadHandler(owner, form(Buffer.alloc(MEDIA_MAX_BYTES + 1), 'image/png'))).status, 422);
  assert.equal((await uploadHandler(owner, form(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png'))).status, 422, 'the bytes must be a real PNG, whatever the declared type');
  assert.equal((await deleteHandler(viewer, body.id)).status, 403);
  assert.equal((await deleteHandler(owner, body.id)).status, 204);
  assert.equal((await getHandler(body.id)).status, 404);
  assert.equal((await getHandler('nope')).status, 404);
});

test('media route: refuses before reading the body — no session is 401 and an oversized upload is 413, with the body never consumed (review Important 1)', async () => {
  const { NextRequest } = await import('next/server');
  const { POST } = await import('../src/app/api/media/route');
  const { makeCompany } = await import('./helpers');
  let pulled = false;
  const body = () => new ReadableStream({ pull(c) { pulled = true; c.error(new Error('body read')); } }, { highWaterMark: 0 });
  const big = String(50 * 1024 * 1024);
  // the Fetch API drops a content-length set through new Request(); a real request carries it, so the test shadows the headers
  const withHeaders = (h: Record<string, string>) => {
    const req = new NextRequest('http://localhost:3104/api/media', { method: 'POST', body: body(), duplex: 'half' } as any);
    Object.defineProperty(req, 'headers', { value: new Headers(h) });
    return req;
  };
  const anon = withHeaders({ 'content-length': big, 'content-type': 'multipart/form-data; boundary=x' });
  assert.equal((await POST(anon)).status, 401);
  assert.equal(pulled, false, 'anonymous body is not read');
  const { token } = await makeCompany();
  const huge = withHeaders({ authorization: 'Bearer ' + token, 'content-length': big, 'content-type': 'multipart/form-data; boundary=x' });
  assert.equal((await POST(huge)).status, 413);
  assert.equal(pulled, false, 'oversized body is not read');
});
