// Snapshots keep their own copy of creative and post thumbnails (docs/superpowers/specs/2026-11-04-ads-previews-sources-matomo-design.md §1):
// one media row per image (whatever the signed query string), never in the media library, failures leave the placeholder.
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import test, { after, before } from 'node:test';
import { db } from '../src/lib/db';
import { makeCompany } from './helpers';
import type { ReportData } from '../src/lib/engine/types';

process.env.MEDIA_DIR = path.join('E:/Claude/tmp', 'test-media-thumbs');
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AP//Z', 'base64');
let server: http.Server;
let base = '';
let requests = 0;

before(async () => {
  server = http.createServer((req, res) => {
    requests++;
    const u = new URL(req.url!, 'http://x');
    if (u.pathname === '/a.jpg') return res.writeHead(200, { 'content-type': 'image/jpeg' }).end(JPEG);
    if (u.pathname === '/page') return res.writeHead(200, { 'content-type': 'text/html' }).end('<html>expired</html>');
    if (u.pathname === '/big.jpg') return res.writeHead(200, { 'content-type': 'image/jpeg' }).end(Buffer.alloc(400 * 1024, 1));
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

const data = (): ReportData =>
  ({
    range: { start: '2026-10-01', end: '2026-10-31' },
    generated_at: '',
    sources: [],
    sections: [
      {
        id: 's',
        title: 'Meta Ads',
        blocks: [
          {
            integrationId: 1,
            platform: 'Meta Ads',
            slug: 'facebook_ads',
            account_name: 'Acme',
            widget: {
              reference_key: 'container',
              key: 'campaigns',
              label: 'Ads',
              format: 'number',
              diff_type: 'neutral',
              value: {
                type: 'container',
                level: 'ad',
                metrics: [{ key: 'spend', label: 'Spend', format: 'currency' }],
                truncated: 0,
                rows: [
                  { id: 'a1', name: 'A1', status: 'active', values: [1], thumb: `${base}/a.jpg?sig=1` },
                  { id: 'a2', name: 'A2', status: 'active', values: [1], thumb: `${base}/a.jpg?sig=2` },
                  { id: 'a3', name: 'A3', status: 'active', values: [1], thumb: `${base}/page` },
                  { id: 'a4', name: 'A4', status: 'active', values: [1], thumb: `${base}/missing.jpg` },
                  { id: 'a5', name: 'A5', status: 'active', values: [1], thumb: `${base}/big.jpg` },
                  { id: 'a6', name: 'A6', status: 'active', values: [1], thumb: '/demo/creative-1.svg' },
                ],
              },
            },
          },
        ],
      },
    ],
    widgets: {
      '2:top_posts': {
        integrationId: 2,
        platform: 'Facebook Page',
        slug: 'facebook',
        account_name: 'Acme',
        widget: { reference_key: 'fb:top_posts', key: 'top_posts', label: 'Top posts', format: 'number', diff_type: 'neutral', value: { type: 'table', columns: ['post', 'reach'], columnLabels: ['Post', 'Reach'], columnFormats: ['text', 'number'], rows: [['Launch', 10]], total_rows: 1, thumbs: [`${base}/a.jpg?sig=3`], links: ['https://facebook.com/p'] } },
      },
    },
  }) as any;

test('one stored copy per image, the rows point at it; failures keep the placeholder; local paths stay', async () => {
  const { keepThumbnails, THUMB_PREFIX } = await import('../src/lib/media/thumbs');
  const { company } = await makeCompany('Thumbs Co');
  const out = await keepThumbnails(data(), company.id);
  const rows = (out.sections[0].blocks[0].widget.value as any).rows;
  assert.match(rows[0].thumb, /^\/api\/media\//);
  // the full address names a copy: proxied images differ only in their query, so two queries are two copies (final review)
  assert.match(rows[1].thumb, /^\/api\/media\//);
  assert.notEqual(rows[1].thumb, rows[0].thumb, 'another query is another image');
  assert.equal(rows[2].thumb, null, 'an HTML answer');
  assert.equal(rows[3].thumb, null, 'a 404');
  assert.equal(rows[4].thumb, null, 'over 300 KB');
  assert.equal(rows[5].thumb, '/demo/creative-1.svg');
  assert.match((out.widgets!['2:top_posts'].widget.value as any).thumbs[0], /^\/api\/media\//);
  assert.equal(await db.media.count({ where: { companyId: company.id, name: { startsWith: THUMB_PREFIX } } }), 3);
});

test('the media library never lists stored thumbnails, and a second snapshot fetches nothing new', async () => {
  const { keepThumbnails } = await import('../src/lib/media/thumbs');
  const { listMedia } = await import('../src/lib/media/store');
  const { company } = await makeCompany('Thumbs Again Co');
  await keepThumbnails(data(), company.id);
  assert.equal((await listMedia(company.id)).length, 0);
  const before = requests;
  const again = await keepThumbnails(data(), company.id);
  // the stored image is reused; only the URLs that failed before are asked again
  assert.equal(requests - before, 3);
  assert.match((again.sections[0].blocks[0].widget.value as any).rows[0].thumb, /^\/api\/media\//);
});
