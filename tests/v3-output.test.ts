// Plan G: PDF service and route, print layouts, cover editor, block options, per-block AI.
import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../src/lib/db';
import { sha256 } from '../src/lib/crypto';
import { unlockCookie } from '../src/lib/share';
import { addIntegration, api, makeCompany } from './helpers';

async function withEnv(name: string, value: string | undefined, fn: () => Promise<void> | void) {
  const prev = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    await fn();
  } finally {
    if (prev === undefined) delete process.env[name];
    else process.env[name] = prev;
  }
}

test('pdf service: PDF_ENABLED=off disables it; at most two renders run at once; a crash or a timeout frees its slot; filenames are ASCII-safe', async () => {
  const { pdfAvailable, renderPdf, pdfQueueStats, pdfFilename } = await import('../src/lib/services/pdf');
  await withEnv('PDF_ENABLED', 'off', () => assert.equal(pdfAvailable(), false));
  let peak = 0;
  const slow = async () => {
    peak = Math.max(peak, pdfQueueStats().active);
    await new Promise((r) => setTimeout(r, 50));
    return Buffer.from('%PDF-fake');
  };
  const results = await Promise.all([1, 2, 3].map(() => renderPdf({ url: 'http://x' }, { render: slow })));
  assert.equal(results.length, 3);
  assert.ok(results.every((b) => b.toString().startsWith('%PDF')));
  assert.equal(peak, 2, `never more than two concurrent renders (peak ${peak})`);
  assert.deepEqual(pdfQueueStats(), { active: 0, waiting: 0 });
  await assert.rejects(renderPdf({ url: 'http://x' }, { render: async () => { throw new Error('chromium crashed'); } }), /chromium crashed/);
  assert.deepEqual(pdfQueueStats(), { active: 0, waiting: 0 }, 'a crash releases its slot');
  assert.equal((await renderPdf({ url: 'http://x' }, { render: async () => Buffer.from('%PDF-ok') })).toString(), '%PDF-ok', 'the next render still runs');
  await assert.rejects(renderPdf({ url: 'http://x', timeoutMs: 30 }, { render: () => new Promise((r) => setTimeout(() => r(Buffer.from('late')), 300)) }), /timed out/i);
  assert.deepEqual(pdfQueueStats(), { active: 0, waiting: 0 }, 'a timeout releases its slot');
  assert.equal(pdfFilename('Acme | Monthly report: Sept'), 'Acme - Monthly report- Sept.pdf');
  assert.equal(pdfFilename('  Ελληνικά   x '), 'x.pdf', 'non-ASCII dropped, whitespace collapsed and trimmed');
  assert.equal(pdfFilename('a'.repeat(100)), 'a'.repeat(80) + '.pdf');
  assert.equal(pdfFilename(''), 'report.pdf');
});

test('pdf route: unknown token 404; a password report without the unlock cookie 401 and never rendered; service off 503; with the cookie the print URL and cookie reach the renderer', async () => {
  const { NextRequest } = await import('next/server');
  const mod = await import('../src/app/api/pdf/[token]/route');
  const { setPdfRenderer } = await import('../src/lib/services/pdf');
  const { createReport } = await import('../src/lib/services/reports');
  const get = (token: string, q = '', cookie?: string) => mod.GET(new NextRequest(`http://localhost:3100/api/pdf/${token}${q}`, { headers: cookie ? { cookie } : {} }), { params: Promise.resolve({ token }) });
  assert.equal((await get('nope')).status, 404);
  const { company, project } = await makeCompany();
  const meta = await addIntegration(company.id, project.id, 'facebook_ads');
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  const created = await createReport({ companyId: company.id, projectId: project.id, kind: 'report', title: 'Acme | Sept', start: '2026-09-01', end: '2026-09-30', templateId: tpl.id, integrationIds: [meta.id] });
  const hash = sha256('pw');
  await db.report.update({ where: { id: created.id }, data: { password: hash } });
  const cookie = `rr_pw_${created.id}=${unlockCookie(created.id, hash)}`;
  let rendered = 0;
  let seen: { url: string; cookies?: { name: string; value: string }[] } | undefined;
  setPdfRenderer(async (o) => {
    rendered++;
    seen = o;
    return Buffer.from('%PDF-1.4 fake');
  });
  try {
    const locked = await get(created.shareToken);
    assert.equal(locked.status, 401);
    assert.match((await locked.json()).message, /Unlock the report first/);
    assert.equal(rendered, 0, 'a locked report is never rendered');
    await withEnv('PDF_ENABLED', 'off', async () => assert.equal((await get(created.shareToken, '', cookie)).status, 503));
    const ok = await get(created.shareToken, '?layout=pages', cookie);
    assert.equal(ok.status, 200, ok.status === 200 ? '' : await ok.text());
    assert.equal(ok.headers.get('content-type'), 'application/pdf');
    assert.equal(ok.headers.get('content-disposition'), `attachment; filename="Acme - Sept.pdf"; filename*=UTF-8''Acme%20-%20Sept.pdf`);
    assert.ok((await ok.arrayBuffer()).byteLength > 0);
    assert.match(seen!.url, new RegExp(`/r/${created.shareToken}\\?print=1&layout=pages$`), seen!.url);
    assert.deepEqual(seen!.cookies?.map((c) => c.name), [`rr_pw_${created.id}`], 'the unlock cookie is forwarded');
    await db.report.update({ where: { id: created.id }, data: { shareEnabled: false } });
    assert.equal((await get(created.shareToken, '', cookie)).status, 404, 'a disabled link is gone');
  } finally {
    setPdfRenderer(null);
  }
  if (process.env.NAV_BASE) {
    // a real render through Chromium against the running dev server
    const { pdfAvailable } = await import('../src/lib/services/pdf');
    assert.equal(pdfAvailable(), true, 'Chromium is installed');
    const flow = await get('ZqssQLL4Hx7JXQaFkIeUxHbJrkLPZTOj', '?layout=flow');
    assert.equal(flow.status, 200, flow.status === 200 ? '' : await flow.text());
    const fb = Buffer.from(await flow.arrayBuffer());
    assert.equal(fb.subarray(0, 4).toString(), '%PDF');
    assert.ok(fb.length > 10_000, `a real PDF (${fb.length} bytes)`);
    const pages = Buffer.from(await (await get('ZqssQLL4Hx7JXQaFkIeUxHbJrkLPZTOj', '?layout=pages')).arrayBuffer());
    // the two files are within a few KB of each other (fonts dominate); what "one block per page" changes is the page count
    const pageCount = (b: Buffer) => (b.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    assert.ok(pageCount(pages) > pageCount(fb), `one block per page has more pages: ${pageCount(pages)} > ${pageCount(fb)}`);
    // the Chromium this process launched would otherwise keep it alive until the five-minute idle close
    const { closeBrowserIfIdle } = await import('../src/lib/services/pdf');
    closeBrowserIfIdle();
  }
});

test('print button and print attributes: the PDF menu appears only with a token; ?print=1&layout=pages become data attributes on the public root', async () => {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { PrintButton } = await import('../src/components/action-form');
  const { printAttrs } = await import('../src/lib/print');
  const plain = renderToStaticMarkup(createElement(PrintButton));
  assert.doesNotMatch(plain, /pdf-menu/);
  assert.match(plain, /Print \/ PDF/);
  const menu = renderToStaticMarkup(createElement(PrintButton, { pdf: { token: 'abc' } }));
  assert.match(menu, /<details[^>]*class="[^"]*pdf-menu[^"]*no-print/);
  assert.match(menu, /href="\/api\/pdf\/abc\?layout=flow"/);
  assert.match(menu, /href="\/api\/pdf\/abc\?layout=pages"/);
  assert.match(menu, /Browser print/);
  const dash = renderToStaticMarkup(createElement(PrintButton, { pdf: { token: 'abc', query: { preset: 'last_7_days', compare: '1', lang: 'el', empty: undefined } } }));
  assert.match(dash, /href="\/api\/pdf\/abc\?layout=flow&amp;preset=last_7_days&amp;compare=1&amp;lang=el"/, "the links carry the client's period, comparison and language");
  assert.match(dash, /href="\/api\/pdf\/abc\?layout=pages&amp;preset=last_7_days&amp;compare=1&amp;lang=el"/);
  assert.deepEqual(printAttrs({ print: '1', layout: 'pages' }), { 'data-print': '1', 'data-print-layout': 'pages' });
  assert.deepEqual(printAttrs({ layout: 'bogus' }), {}, 'unknown layouts are ignored');
  assert.deepEqual(printAttrs({ print: '1' }), { 'data-print': '1', 'data-print-layout': 'flow' });
  assert.deepEqual(printAttrs({}), {});
});

const range = { start: '2026-09-01', end: '2026-09-30' };

test('pdf attachments: an automation with attachPdf mails the PDF when the service is up and says why when it cannot', async () => {
  const { runAutomation } = await import('../src/lib/services/automations');
  const { setPdfRenderer } = await import('../src/lib/services/pdf');
  const { company, project } = await makeCompany();
  const meta = await addIntegration(company.id, project.id, 'facebook_ads');
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  const a = await db.automation.create({ data: { projectId: project.id, title: 'With PDF', frequency: 'monthly', dayOfMonth: 1, hour: 8, channels: ['email'], emails: ['client@x.test'], templateId: tpl.id, integrationIds: [meta.id], enabled: true, attachPdf: true, holdOnFailure: false, nextRunAt: new Date() } });
  setPdfRenderer(async () => Buffer.alloc(3000, 37));
  try {
    const first = await runAutomation(a.id);
    assert.equal(first.status, 'ok');
    assert.match(String(first.detail.pdf), /^attached \(.+\.pdf\)$/, JSON.stringify(first.detail));
    const mail = await db.outbox.findFirst({ where: { companyId: company.id, toAddr: 'client@x.test' }, orderBy: { id: 'desc' } });
    assert.ok(mail, 'the e-mail was queued');
    assert.deepEqual(mail!.attachmentNames, [String(first.detail.pdf).slice('attached ('.length, -1)], 'the Outbox row names the attachment');
    await withEnv('PDF_ENABLED', 'off', async () => {
      const second = await runAutomation(a.id);
      assert.equal(second.detail.pdf, 'not attached: PDF service unavailable');
    });
    setPdfRenderer(async () => Buffer.alloc(16 * 1024 * 1024));
    const big = await runAutomation(a.id);
    assert.equal(big.detail.pdf, 'not attached: larger than 15 MB');
    setPdfRenderer(async () => { throw new Error('browser gone'); });
    const broken = await runAutomation(a.id);
    assert.equal(broken.status, 'ok', 'a failed PDF never blocks the delivery');
    assert.equal(broken.detail.pdf, 'not attached: browser gone');
  } finally {
    setPdfRenderer(null);
  }
});

test('cover editor: themeSchema accepts the cover fields and rejects bad ones; cleanTheme drops defaults; the cover renders banner / header / none and hides the period; the Look panel keeps the picker', async () => {
  const { themeSchema } = await import('../src/lib/layout/compose');
  const { cleanTheme, themeVars } = await import('../src/lib/layout/theme');
  assert.ok(themeSchema.safeParse({ coverLayout: 'header', coverText: '#112233', showPeriod: false }).success);
  assert.equal(themeSchema.safeParse({ coverLayout: 'big' }).success, false);
  assert.equal(themeSchema.safeParse({ coverText: 'red' }).success, false);
  assert.deepEqual(cleanTheme({ coverLayout: 'banner', showPeriod: true, coverText: '#112233' }), { coverText: '#112233' });
  assert.deepEqual(cleanTheme({ coverLayout: 'none', showPeriod: false }), { coverLayout: 'none', showPeriod: false });
  assert.equal((themeVars({ coverText: '#112233' }, '#000000') as Record<string, string>)['--cover-text'], '#112233');
  assert.equal((themeVars({}, '#000000') as Record<string, string>)['--cover-text'], undefined, 'no cover colour → inherits the ink');
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { ReportCover } = await import('../src/components/report-cover');
  const base = { projectName: 'Acme', title: 'Monthly', subtitle: 'Performance', logo: null, brandColor: '#1a36e6', range, comparison: null, dateFormat: 'DD/MM/YYYY', cover: '/api/media/1' };
  const banner = renderToStaticMarkup(createElement(ReportCover, { ...base, theme: {} }));
  assert.match(banner, /cover-banner/);
  assert.doesNotMatch(banner, /cover-hero/);
  assert.match(banner, /class="rband/);
  const header = renderToStaticMarkup(createElement(ReportCover, { ...base, theme: { coverLayout: 'header' } }));
  assert.match(header, /cover-hero/);
  assert.doesNotMatch(header, /cover-banner/);
  assert.match(header, /Monthly/);
  const none = renderToStaticMarkup(createElement(ReportCover, { ...base, theme: { coverLayout: 'none' } }));
  assert.doesNotMatch(none, /<img|cover-hero|cover-banner|\/api\/media\/1/);
  assert.match(none, /Monthly/);
  const noPeriod = renderToStaticMarkup(createElement(ReportCover, { ...base, theme: { showPeriod: false } }));
  assert.doesNotMatch(noPeriod, /class="rband/);
  const { LookPanel } = await import('../src/components/look-panel');
  // client components read their words from the provider the shell mounts; outside one they render keys
  const { I18nProvider } = await import('../src/components/i18n-provider');
  const { dictFor } = await import('../src/lib/i18n');
  const panel = renderToStaticMarkup(createElement(I18nProvider, { locale: 'en', dict: dictFor('en', ['look', 'media', 'common', 'editor']), children: createElement(LookPanel, { theme: { coverLayout: 'none' }, clientColor: '#1a36e6', onChange: () => {}, onClose: () => {} }) }));
  assert.equal((panel.match(/name="coverLayout"/g) ?? []).length, 3, 'three layout radios');
  assert.match(panel, /Choose cover/, 'the picker stays so the user can switch back');
  assert.match(panel, /name="showPeriod"/);
  assert.match(panel, /name="coverText"/);
});

test('block options: layoutSchema accepts icon/subtitle/hideHeader and rejects unknown icons and long subtitles; compose and templates carry them; the header renders the icon, hides on request but keeps the block colour; the editor shows "hidden"', async () => {
  const { layoutSchema, layoutToSections, composeReport } = await import('../src/lib/layout/compose');
  const { ICON_NAMES } = await import('../src/components/infographic');
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { ReportBody, BlockHeader } = await import('../src/components/widgets');
  const icon = ICON_NAMES.includes('target') ? 'target' : ICON_NAMES[0];
  const block = (extra: object) => ({ version: 1, blocks: [{ id: 'b', title: 'Meta', integrationId: 5, slug: 'facebook_ads', widgets: [], ...extra }] });
  assert.ok(layoutSchema.safeParse(block({ icon, subtitle: 'Paid social', hideHeader: true })).success);
  assert.equal(layoutSchema.safeParse(block({ icon: 'nope' })).success, false);
  assert.equal(layoutSchema.safeParse(block({ subtitle: 'x'.repeat(121) })).success, false);
  const data = { range, comparison: null, sections: [], sources: [], generated_at: '2026-10-22T00:00:00Z' } as any;
  const ctx = { sources: [{ id: 5, slug: 'facebook_ads', name: 'Acme' }], currency: 'EUR', range, comparison: null };
  const hidden = composeReport(data, block({ icon, subtitle: 'Paid social', hideHeader: true }) as any, ctx);
  assert.equal(hidden.sections[0].icon, icon);
  assert.equal(hidden.sections[0].subtitle, 'Paid social');
  assert.equal(hidden.sections[0].hideHeader, true);
  const tplSec = layoutToSections(block({ icon, subtitle: 'Paid social', hideHeader: true }) as any)[0];
  assert.deepEqual([tplSec.icon, tplSec.subtitle, tplSec.hideHeader], [icon, 'Paid social', true], 'templates keep the block options');
  const fmt = { decimalSeparatorFormat: 'comma_dot' as const };
  const html = renderToStaticMarkup(createElement(ReportBody, { data: hidden, fmt }));
  assert.doesNotMatch(html, /<h2/, 'no title row');
  assert.match(html, /--block:/, 'the block colour still applies');
  const shown = composeReport(data, block({ icon, subtitle: 'Paid social' }) as any, ctx);
  const html2 = renderToStaticMarkup(createElement(ReportBody, { data: shown, fmt }));
  assert.match(html2, new RegExp(`data-icon="${icon}"`));
  assert.match(html2, /class="block-sub[^"]*">Paid social</);
  const editor = renderToStaticMarkup(createElement(BlockHeader, { s: hidden.sections[0], editor: true }));
  assert.match(editor, /Meta/);
  assert.match(editor, /hidden/i);
});

test('per-block AI: facts scoped to a section, tones shape the heuristic, a block without numbers says so, block cards sit after their block, the API accepts block_id and tone', async () => {
  const { extractFacts, heuristicBlock, analyseBlock, TONE_PROMPTS } = await import('../src/lib/ai/insights');
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { ReportBody } = await import('../src/components/widgets');
  const num = (key: string, label: string, value: number, prev: number, diff = 'positive_good') => ({ integrationId: 1, platform: 'Meta Ads', slug: 'facebook_ads', account_name: 'Acme', id: key, layout: { x: 0, y: 0, w: 3, h: 2 }, widget: { reference_key: key, key, label, format: 'number', diff_type: diff, value: { type: 'number', value, comparison: { value: prev, change_pct: Math.round(((value - prev) / prev) * 1000) / 10, absolute: value - prev } } } });
  const source = { integrationId: 1, slug: 'facebook_ads', platform: 'Meta Ads', account_name: 'Acme' };
  const chart = { integrationId: 1, platform: 'Meta Ads', slug: 'facebook_ads', account_name: 'Acme', id: 'ch', layout: { x: 0, y: 0, w: 6, h: 3 }, widget: { reference_key: 'spend_by_date', key: 'spend_by_date', label: 'Spend by day', format: 'currency', diff_type: 'neutral', value: { type: 'chart', labels: ['2026-09-01'], series: [[1]] } } };
  const data = { range, comparison: { start: '2026-08-01', end: '2026-08-31' }, sources: [], generated_at: '2026-10-22T00:00:00Z', sections: [{ id: 'meta', title: 'Meta', source, blocks: [num('clicks', 'Clicks', 120, 100), num('cpc', 'CPC', 2, 1, 'positive_bad'), num('spend', 'Amount spent', 240, 100, 'neutral')] }, { id: 'ga', title: 'GA4', source: { ...source, integrationId: 2, slug: 'google_analytics_4', platform: 'GA4' }, blocks: [num('sessions', 'Sessions', 50, 100)] }, { id: 'charts', title: 'Charts', source, blocks: [chart] }] } as any;
  assert.deepEqual(extractFacts(data, 'meta').map((f) => f.label), ['Clicks', 'CPC', 'Amount spent']);
  assert.equal(extractFacts(data).length, 4, 'no filter → every section');
  const worst = heuristicBlock(data, 'meta', 'worst', 'Acme');
  assert.match(worst, /CPC/, 'the metric that moved the wrong way the most');
  const exec = heuristicBlock(data, 'meta', 'executive', 'Acme');
  const sentences = exec.replace(/<[^>]+>/g, ' ').split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  assert.ok(sentences.length <= 5, `at most five sentences: ${sentences.length}`);
  assert.match(heuristicBlock(data, 'charts', 'performance', 'Acme'), /No numeric metrics in this block to summarise\./);
  assert.match(heuristicBlock(data, 'meta', 'opportunities', 'Acme'), /<li>/, 'opportunities are a list of actions');
  assert.notEqual(TONE_PROMPTS.performance, TONE_PROMPTS.worst);
  assert.equal(Object.keys(TONE_PROMPTS).sort().join(','), 'executive,general,opportunities,performance,worst');
  await withEnv('ANTHROPIC_API_KEY', undefined, async () => {
    const r = await analyseBlock(data, 'meta', { tone: 'performance', projectName: 'Acme' });
    assert.equal(r.ai, false);
    assert.match(r.html, /Clicks|CPC/);
  });
  const fmt = { decimalSeparatorFormat: 'comma_dot' as const };
  const cards = [{ id: 'c1', title: 'Top card', html: '<p>topcard</p>', author: 'ai' as const, updatedAt: '' }, { id: 'c2', title: 'Meta card', html: '<p>metacard</p>', author: 'ai' as const, updatedAt: '', blockId: 'meta', tone: 'worst' as const }];
  const html = renderToStaticMarkup(createElement(ReportBody, { data, fmt, cards }));
  const at = (s: string) => html.indexOf(s);
  assert.ok(at('topcard') >= 0 && at('metacard') >= 0 && at('id="meta"') >= 0 && at('id="ga"') >= 0, html.slice(0, 300));
  assert.ok(at('topcard') < at('id="meta"'), 'a card without blockId stays at the top');
  assert.ok(at('metacard') > at('id="meta"') && at('metacard') < at('id="ga"'), 'a block card follows its block');
  const { company, project, token } = await makeCompany();
  const meta = await addIntegration(company.id, project.id, 'facebook_ads');
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  const { createReport } = await import('../src/lib/services/reports');
  const { reportView } = await import('../src/lib/layout/service');
  const created = await createReport({ companyId: company.id, projectId: project.id, kind: 'report', title: 'Tones', start: range.start, end: range.end, templateId: tpl.id, integrationIds: [meta.id] });
  const view = await reportView(await db.report.findUniqueOrThrow({ where: { id: created.id }, include: { project: true } }));
  const blockId = view.data.sections.find((s) => s.source?.integrationId === meta.id)!.id;
  await withEnv('ANTHROPIC_API_KEY', undefined, async () => {
    const res = await api(token, 'POST', `/reports/${created.id}/analysis`, { generate: true, block_id: blockId, tone: 'performance' });
    assert.equal(res.status, 201, JSON.stringify(res.json).slice(0, 200));
    assert.equal(res.json.card.block_id, blockId);
    assert.equal(res.json.card.tone, 'performance');
    assert.ok(Array.isArray(res.json.data), 'the card list as before');
    assert.equal((await api(token, 'POST', `/reports/${created.id}/analysis`, { generate: true, block_id: 'nope', tone: 'performance' })).status, 422, 'an unknown block is refused');
    assert.equal((await api(token, 'POST', `/reports/${created.id}/analysis`, { generate: true, block_id: blockId, tone: 'angry' })).status, 422, 'an unknown tone is refused');
  });
});

test('pdf fixes: a full queue is refused at once instead of waiting; the idle timer never closes a browser mid-render; filenames keep Greek for mail and add filename* for downloads; PDF_BASE_URL drives the renderer', async () => {
  const { renderPdf, pdfQueueStats, PdfBusyError, closeBrowserIfIdle, pdfFilename, pdfContentDisposition, pdfBaseUrl, pdfPageUrl } = await import('../src/lib/services/pdf');
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const render = async () => {
    await gate;
    return Buffer.from('x');
  };
  const inflight = Array.from({ length: 12 }, () => renderPdf({ url: 'http://x' }, { render }));
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(pdfQueueStats(), { active: 2, waiting: 10 }, 'two run, ten wait');
  await assert.rejects(renderPdf({ url: 'http://x' }, { render }), (e: unknown) => e instanceof PdfBusyError && /busy/i.test((e as Error).message), 'the thirteenth is refused at once');
  assert.equal(closeBrowserIfIdle(), false, 'a render is in flight: the idle timer re-arms instead of closing');
  release();
  assert.equal((await Promise.all(inflight)).length, 12);
  assert.deepEqual(pdfQueueStats(), { active: 0, waiting: 0 });
  assert.equal(closeBrowserIfIdle(), true, 'nothing in flight: the browser (none here) is closed');
  assert.equal(pdfFilename('Acme "Q3" report'), 'Acme Q3 report.pdf', 'no quotes in the ASCII name');
  assert.equal(pdfFilename('Αναφορά Σεπτέμβριος 2026'), '2026.pdf', 'the ASCII fallback as before');
  assert.equal(pdfFilename('Αναφορά Σεπτέμβριος 2026', { ascii: false }), 'Αναφορά Σεπτέμβριος 2026.pdf', 'mail attachments keep the title');
  assert.equal(pdfFilename('Acme | "Q3": a/b', { ascii: false }), 'Acme - Q3- a-b.pdf');
  assert.equal(pdfContentDisposition('Αναφορά 2026'), `attachment; filename="2026.pdf"; filename*=UTF-8''%CE%91%CE%BD%CE%B1%CF%86%CE%BF%CF%81%CE%AC%202026.pdf`);
  assert.equal(pdfContentDisposition("Acme's (Q3)"), `attachment; filename="Acme's (Q3).pdf"; filename*=UTF-8''Acme%27s%20%28Q3%29.pdf`);
  await withEnv('PDF_BASE_URL', 'http://127.0.0.1:4321/', async () => {
    assert.equal(pdfBaseUrl(), 'http://127.0.0.1:4321');
    assert.equal(pdfPageUrl('report', 'tok', { layout: 'pages', lang: 'el' }), 'http://127.0.0.1:4321/r/tok?print=1&layout=pages&lang=el');
    assert.equal(pdfPageUrl('dashboard', 'tok', { layout: 'flow', preset: undefined }), 'http://127.0.0.1:4321/d/tok?print=1&layout=flow');
  });
  await withEnv('PDF_BASE_URL', undefined, async () => assert.equal(pdfBaseUrl(), (process.env.APP_URL || 'http://localhost:3100').replace(/\/$/, ''), 'without it, the app URL as before'));
});

test('pdf route fixes: preset, compare and lang are forwarded (and only those), the renderer uses PDF_BASE_URL, a full queue answers 429 with Retry-After, and the download name carries the UTF-8 title', async () => {
  const { NextRequest } = await import('next/server');
  const mod = await import('../src/app/api/pdf/[token]/route');
  const { setPdfRenderer, pdfQueueStats } = await import('../src/lib/services/pdf');
  const { createReport } = await import('../src/lib/services/reports');
  const get = (token: string, q = '') => mod.GET(new NextRequest(`http://localhost:3100/api/pdf/${token}${q}`), { params: Promise.resolve({ token }) });
  const { company, project } = await makeCompany();
  const meta = await addIntegration(company.id, project.id, 'facebook_ads');
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  const created = await createReport({ companyId: company.id, projectId: project.id, kind: 'report', title: 'Αναφορά Q3', start: '2026-09-01', end: '2026-09-30', templateId: tpl.id, integrationIds: [meta.id] });
  let seen = '';
  setPdfRenderer(async (o) => {
    seen = o.url;
    return Buffer.from('%PDF-1.4 fake');
  });
  try {
    await withEnv('PDF_BASE_URL', 'http://127.0.0.1:4321', async () => {
      const ok = await get(created.shareToken, '?layout=pages&preset=last_7_days&compare=0&lang=el&evil=1&print=0');
      assert.equal(ok.status, 200, ok.status === 200 ? '' : await ok.text());
      assert.equal(seen, `http://127.0.0.1:4321/r/${created.shareToken}?print=1&layout=pages&preset=last_7_days&compare=0&lang=el`);
      assert.equal(ok.headers.get('content-disposition'), `attachment; filename="Q3.pdf"; filename*=UTF-8''%CE%91%CE%BD%CE%B1%CF%86%CE%BF%CF%81%CE%AC%20Q3.pdf`);
      const odd = await get(created.shareToken, '?preset=../x&compare=yes%20no&lang=%3Cb%3E');
      assert.equal(odd.status, 200);
      assert.equal(seen, `http://127.0.0.1:4321/r/${created.shareToken}?print=1&layout=flow`, 'values outside [A-Za-z0-9_-] are dropped');
    });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    setPdfRenderer(async () => {
      await gate;
      return Buffer.from('%PDF-1.4 fake');
    });
    const inflight = Array.from({ length: 12 }, () => get(created.shareToken));
    for (let i = 0; i < 100 && pdfQueueStats().waiting < 10; i++) await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(pdfQueueStats(), { active: 2, waiting: 10 });
    const busy = await get(created.shareToken);
    assert.equal(busy.status, 429, 'a full queue is refused instead of holding the request');
    assert.equal(busy.headers.get('retry-after'), '10');
    release();
    for (const r of await Promise.all(inflight)) assert.equal(r.status, 200);
  } finally {
    setPdfRenderer(null);
  }
});

test('ai language: the default follows the locale and one shared store feeds the analysis panel and the block controls', async () => {
  const { defaultAiLanguage, AI_LANGUAGES } = await import('../src/lib/ai/language');
  const { aiLanguageStore } = await import('../src/components/ai-language');
  assert.equal(defaultAiLanguage('el'), 'Greek');
  assert.equal(defaultAiLanguage('en'), 'English');
  assert.equal(defaultAiLanguage('xx'), 'English');
  assert.ok(AI_LANGUAGES.includes('Greek') && AI_LANGUAGES[0] === 'English');
  assert.equal(aiLanguageStore.get(), null, 'unset until someone picks');
  let fired = 0;
  const off = aiLanguageStore.subscribe(() => fired++);
  aiLanguageStore.set('Greek');
  assert.equal(aiLanguageStore.get(), 'Greek');
  assert.equal(fired, 1);
  off();
  aiLanguageStore.set(null);
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('src/components/block-analyse.tsx', 'utf8');
  assert.ok(!src.includes("language = 'English'"), 'no hard-coded English default in the block controls');
  assert.ok(src.includes('useAiLanguage()'), 'the controls read the shared store');
  assert.ok(readFileSync('src/components/analysis-panel.tsx', 'utf8').includes('useAiLanguage()'), 'the panel select drives the store');
});

test('api block cards: re-running a tone on a block replaces its earlier AI card, as the editor action does', async () => {
  const { company, project, token } = await makeCompany();
  const meta = await addIntegration(company.id, project.id, 'facebook_ads');
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  const { createReport } = await import('../src/lib/services/reports');
  const { reportView } = await import('../src/lib/layout/service');
  const created = await createReport({ companyId: company.id, projectId: project.id, kind: 'report', title: 'Rerun', start: range.start, end: range.end, templateId: tpl.id, integrationIds: [meta.id] });
  const view = await reportView(await db.report.findUniqueOrThrow({ where: { id: created.id }, include: { project: true } }));
  const blockId = view.data.sections.find((s) => s.source?.integrationId === meta.id)!.id;
  await withEnv('ANTHROPIC_API_KEY', undefined, async () => {
    await api(token, 'POST', `/reports/${created.id}/analysis`, { title: 'Mine', html: '<p>human</p>' });
    await api(token, 'POST', `/reports/${created.id}/analysis`, { generate: true, block_id: blockId, tone: 'worst' });
    await api(token, 'POST', `/reports/${created.id}/analysis`, { generate: true, block_id: blockId, tone: 'executive' });
    const res = await api(token, 'POST', `/reports/${created.id}/analysis`, { generate: true, block_id: blockId, tone: 'worst' });
    assert.equal(res.status, 201);
    const cards = res.json.data as { author: string; blockId?: string; tone?: string }[];
    assert.equal(cards.filter((c) => c.author === 'ai' && c.blockId === blockId && c.tone === 'worst').length, 1, 'one worst card, the latest');
    assert.equal(cards.filter((c) => c.author === 'ai' && c.blockId === blockId && c.tone === 'executive').length, 1, 'the other tone stays');
    assert.equal(cards.filter((c) => c.author === 'human').length, 1, 'human cards are never touched');
    assert.equal(cards[cards.length - 1].tone, 'worst', 'the re-run card is the newest');
  });
});
