import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeLayout, parsePageList, composeReport } from '../src/lib/layout/compose';
import { sniffImage } from '../src/lib/media/handlers';
import { pdfBaseFor, renderHostAllowed, pdfPageUrl, isServerless } from '../src/lib/services/pdf';
import { pdfAllowed } from '../src/lib/platform';

test('PDF widget: pages typed like a print dialog, only our own uploads, validated in the layout', () => {
  assert.deepEqual(parsePageList('1-3, 5'), [1, 2, 3, 5]);
  assert.deepEqual(parsePageList(' 4 - 2 ,2,9'), [2, 3, 4, 9], 'a reversed range and repeats are tidied');
  assert.equal(parsePageList(''), undefined);
  assert.equal(parsePageList('0, x'), undefined, 'nothing readable means every page');
  assert.equal(parsePageList('1-100000')?.length, 200, 'capped');
  const widget = (custom: Record<string, unknown>) => ({ version: 1, blocks: [{ id: 'b', title: 'Docs', integrationId: 0, slug: 'custom', widgets: [{ id: 'p', slug: 'pdf', key: 'pdf', component: 'pdf_v1', integrationId: 0, x: 0, y: 0, w: 12, h: 9, custom }] }] });
  assert.throws(() => normalizeLayout(widget({ pdfPages: '1;DROP' })), 'pages are digits, commas and dashes only');
  const range = { start: '2026-09-01', end: '2026-09-30' };
  const data = { range, comparison: null, generated_at: '', sources: [], sections: [] } as any;
  const view = (custom: Record<string, unknown>) => composeReport(data, normalizeLayout(widget(custom)), { sources: [], currency: 'EUR', range }).sections[0].blocks[0].widget.value;
  assert.deepEqual(view({ url: '/api/media/abc123', pdfPages: '2-3', caption: 'Media plan' }), { type: 'pdf', url: '/api/media/abc123', pages: [2, 3], caption: 'Media plan' });
  assert.equal(view({ url: 'https://example.com/x.pdf' }).type, 'error', 'a third-party address is not drawn (no cross-origin reads)');
  assert.equal(view({}).type, 'error', 'nothing uploaded yet');
});

test('uploads: a PDF is recognised by its first bytes; a renamed file is not', () => {
  assert.equal(sniffImage(Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj')), 'application/pdf');
  assert.equal(sniffImage(Buffer.from('<html><script>alert(1)</script>')), null);
  assert.equal(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
});

test('PDF download on a serverless host: renders from the address the visitor used, only when it is one of ours', () => {
  const vercel = { VERCEL: '1', APP_URL: 'https://reports.ruler.agency', VERCEL_PROJECT_PRODUCTION_URL: 'reports.ruler.agency' } as unknown as NodeJS.ProcessEnv;
  assert.equal(isServerless(vercel), true);
  assert.equal(pdfBaseFor('https://ruler-report-pi.vercel.app', vercel), 'https://ruler-report-pi.vercel.app', 'the vercel.app address works before the domain is live');
  assert.equal(pdfBaseFor('https://reports.ruler.agency', vercel), 'https://reports.ruler.agency');
  assert.equal(pdfBaseFor('https://evil.example', vercel), 'https://reports.ruler.agency', 'a forged host falls back to the configured address');
  assert.equal(renderHostAllowed('file:///etc/passwd', vercel), false);
  assert.equal(renderHostAllowed('https://api.vercel.app.evil.com', vercel), false);
  assert.equal(pdfBaseFor('https://ruler-report-pi.vercel.app', { ...vercel, PDF_BASE_URL: 'http://internal:3000/' }), 'http://internal:3000', 'PDF_BASE_URL always wins');
  assert.equal(pdfBaseFor('https://ruler-report-pi.vercel.app', { APP_URL: 'http://localhost:3100' } as unknown as NodeJS.ProcessEnv), process.env.PDF_BASE_URL || process.env.APP_URL || 'http://localhost:3100', 'a server with Chromium installed keeps its configured address');
  assert.equal(pdfPageUrl('report', 'tok', { layout: 'pages', lang: 'el' }, 'https://x.vercel.app'), 'https://x.vercel.app/r/tok?print=1&layout=pages&lang=el');
  assert.equal(pdfAllowed({ VERCEL: '1' }), true, 'on by default on Vercel (the serverless Chromium)');
});
