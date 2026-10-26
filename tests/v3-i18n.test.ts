// Plan H: Greek — i18n core, locale settings, extracted UI, public chrome, e-mails, metric labels, dictionary parity.
import assert from 'node:assert/strict';
import test from 'node:test';
import { db } from '../src/lib/db';
import { makeCompany } from './helpers';

const GREEK = /[Ͱ-Ͽ]/;

test('i18n core: t() falls back el → en → key and interpolates; dictFor filters namespaces; resolveLocale precedence; localeForPublic', async () => {
  const { t, dictFor, resolveLocale, localeForPublic, LOCALES } = await import('../src/lib/i18n');
  assert.deepEqual([...LOCALES], ['en', 'el']);
  assert.equal(t('en', 'nav.overview'), 'Overview');
  assert.match(t('el', 'nav.overview'), GREEK, 'Greek letters');
  assert.equal(t('el', 'does.not.exist'), 'does.not.exist', 'the key itself when nobody has it');
  assert.equal(t('en', 'common.copyOf', { title: 'X' }), 'Copy of X');
  assert.equal(t('el', 'common.copyOf', { title: 'X' }).includes('X'), true, 'interpolation in Greek too');
  const nav = dictFor('el', ['nav']);
  assert.ok(Object.keys(nav).length >= 8, `nav keys: ${Object.keys(nav).length}`);
  assert.ok(Object.keys(nav).every((k) => k.startsWith('nav.')));
  assert.equal(Object.keys(dictFor('en', ['does-not-exist'])).length, 0);
  assert.equal(resolveLocale({ user: 'en', company: 'el', acceptLanguage: 'el' }), 'en', 'the user override wins');
  assert.equal(resolveLocale({ user: null, company: 'el' }), 'el', 'then the company');
  assert.equal(resolveLocale({ user: null, company: null, acceptLanguage: 'el-GR,el;q=0.9,en;q=0.8' }), 'el', 'then the browser');
  assert.equal(resolveLocale({ acceptLanguage: 'fr-FR' }), 'en');
  assert.equal(resolveLocale({ user: 'fr', company: 'el' }), 'el', 'an unknown user value is ignored');
  assert.equal(localeForPublic({ locale: 'el' }, 'fr'), 'el', '?lang=fr falls back to the project');
  assert.equal(localeForPublic({ locale: 'el' }, 'en'), 'en');
  assert.equal(localeForPublic({ locale: 'xx' }), 'en');
});

test('i18n dictionaries: en and el share one key set, every t() literal in src exists, and the check script agrees', async () => {
  const { en, el } = await import('../src/lib/i18n/dicts');
  assert.deepEqual(Object.keys(el).sort(), Object.keys(en).sort(), 'parity');
  assert.ok(Object.keys(en).length >= 20);
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, ['scripts/i18n-check.mjs'], { encoding: 'utf8', cwd: process.cwd() });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
});

test('locale settings: User.locale overrides Company.locale, which defaults to en; the principal carries the resolved locale', async () => {
  const { resolveLocale } = await import('../src/lib/i18n');
  const { principalLocale } = await import('../src/lib/i18n/server');
  const { company } = await makeCompany();
  assert.equal((await db.company.findUniqueOrThrow({ where: { id: company.id } })).locale, 'en', 'company default');
  await db.company.update({ where: { id: company.id }, data: { locale: 'el' } });
  const u = await db.user.create({ data: { companyId: company.id, email: `el-${company.id}@x.test`, name: 'Eleni', passwordHash: 'x', role: 'editor' } });
  const load = () => db.user.findUniqueOrThrow({ where: { id: u.id }, include: { company: true } });
  assert.equal(principalLocale(await load()), 'el', 'no user override → the company');
  assert.equal(resolveLocale({ user: (await load()).locale, company: 'el' }), 'el');
  await db.user.update({ where: { id: u.id }, data: { locale: 'en' } });
  assert.equal(principalLocale(await load()), 'en', 'the user override wins');
});

test('agency UI in Greek: the login form, the top nav and the shell chrome carry no English from the word list', async () => {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  // the login form imports the avatar library (ESM-only exports node cannot resolve here), so its source is checked instead of its render
  const { readFileSync } = await import('node:fs');
  const { dictFor, t } = await import('../src/lib/i18n');
  const { navGroups } = await import('../src/components/nav-groups');
  const { TopNav } = await import('../src/components/top-nav');
  const loginSrc = readFileSync('src/components/login-form.tsx', 'utf8');
  for (const re of [/>s*Sign ins*</, />s*Emails*</, />s*Passwords*</, /Create a workspace/, /New agency?/, /Skip to the sign-in form/, /'Checking…'/]) assert.doesNotMatch(loginSrc, re, `English literal ${re} still in the login form`);
  assert.match(loginSrc, /useT()/, 'the login form reads its strings through useT');
  // 'Email' stays 'Email' in Greek UIs; the rest must be Greek
  for (const k of ['auth.signIn', 'auth.password', 'auth.createWorkspace', 'auth.captionWatch']) assert.match(t('el', k), GREEK, `${k} is Greek`);
  assert.ok(Object.keys(dictFor('el', ['auth'])).length >= 15);
  const nav = renderToStaticMarkup(createElement(TopNav, { groups: navGroups('el', 'admin'), active: '/overview' }));
  for (const w of ['Overview', 'Projects', 'Reports', 'Dashboards', 'Templates', 'Integrations']) assert.ok(!nav.includes(w), `English "${w}" in the Greek nav`);
  assert.match(nav, /Επισκόπηση/);
  assert.equal(navGroups('el', 'client').length, 1, 'clients see one group');
  const enNav = renderToStaticMarkup(createElement(TopNav, { groups: navGroups('en', 'admin') }));
  assert.match(enNav, /Overview/);
});

test('editor in Greek: the toolbar, the look panel and the analysis panel carry no English from the word list', async () => {
  {
    // the shell mounts the client provider with every app namespace, else useT() silently renders English
    const { readFileSync } = await import('node:fs');
    const shell = readFileSync('src/components/shell.tsx', 'utf8');
    assert.ok(/<I18nProvider locale=\{locale\} dict=\{dictFor\(locale, APP_NAMESPACES\)\}>/.test(shell), 'AppShell wraps the page in I18nProvider');
    for (const ns of ['editor', 'analysis', 'look', 'settings', 'automations', 'goals', 'templates', 'share', 'campaigns', 'media', 'tones', 'common']) assert.ok(shell.includes(`'${ns}'`), `namespace ${ns} shipped`);
  }
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { I18nProvider } = await import('../src/components/i18n-provider');
  const { dictFor, t } = await import('../src/lib/i18n');
  const { readFileSync } = await import('node:fs');
  const { LookPanel } = await import('../src/components/look-panel');
  const dict = dictFor('el', ['editor', 'look', 'analysis', 'media', 'campaigns', 'common', 'metrics', 'goals', 'templates']);
  const wrap = (el: any) => renderToStaticMarkup(createElement(I18nProvider, { locale: 'el', dict, children: el }));
  const range = { start: '2026-09-01', end: '2026-09-30' };
  const data = { range, comparison: null, sections: [], sources: [], generated_at: '2026-10-22T00:00:00Z' } as any;
  // the editor and the analysis panel call useRouter() (needs the app router), so their sources are scanned instead of rendered
  const editorSrc = readFileSync('src/components/report-editor.tsx', 'utf8');
  for (const re of [/>s*Add blocks*</, />s*Looks*</, />s*Saveds*</, />s*Save as templates*</, /No blocks yet/, /'Preview as client'/, /'Back to editing'/, /'Analysing…'/]) assert.doesNotMatch(editorSrc, re, `English literal ${re} still in the editor`);
  assert.match(editorSrc, /useT()/);
  const analysisSrc = readFileSync('src/components/analysis-panel.tsx', 'utf8');
  for (const re of [/>s*Writes*</, /'Generate'/, />s*Analysiss*</, /'Working…'/]) assert.doesNotMatch(analysisSrc, re, `English literal ${re} still in the analysis panel`);
  assert.match(t('el', 'editor.addBlock'), GREEK);
  void data;
  const look = wrap(createElement(LookPanel, { theme: {}, clientColor: '#1a36e6', onChange: () => {}, onClose: () => {} }));
  for (const w of ['Accent colour', 'Chart palette', 'Cover image', 'Use client colour']) assert.ok(!look.includes(w), `English "${w}" in the Greek look panel`);
});

test('public chrome in Greek: the cover band, the source list, the dashboard controls, the data note and the presets follow the request locale; ?lang=en switches back', async () => {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { setRequestLocale, getRequestLocale } = await import('../src/lib/i18n/request');
  const { presetLabel, localeForPublic } = await import('../src/lib/i18n');
  const { ReportCover } = await import('../src/components/report-cover');
  const { SourceStatusList, ReportBody } = await import('../src/components/widgets');
  const { DashboardControls } = await import('../src/components/dashboard-controls');
  const { DataNote } = await import('../src/components/data-note');
  const range = { start: '2026-09-01', end: '2026-09-30' };
  const base = { projectName: 'Acme', title: 'Monthly', subtitle: null, logo: null, brandColor: '#1a36e6', range, comparison: { start: '2026-08-01', end: '2026-08-31' }, dateFormat: 'DD/MM/YYYY', cover: null, theme: {} };
  const sources = [{ integrationId: 1, source_id: 'x', platform: 'Meta Ads', slug: 'facebook_ads', account_name: 'Acme', currency: 'EUR', data_status: 'error' as const, error: 'boom' }];
  try {
    setRequestLocale('el');
    assert.equal(getRequestLocale(), 'el');
    const cover = renderToStaticMarkup(createElement(ReportCover, base));
    assert.match(cover, /Σεπ|Σεπτ/, 'a Greek month name in the band');
    assert.doesNotMatch(cover, /compared with/);
    const status = renderToStaticMarkup(createElement(SourceStatusList, { sources }));
    assert.doesNotMatch(status, /Some sources need attention|no data in this period/);
    assert.match(status, GREEK);
    const controls = renderToStaticMarkup(createElement(DashboardControls, { report: { preset: 'last_30d', clientPresets: ['last_7d'] }, preset: 'last_30d', compare: true, updatedAt: '2026-10-22T12:04:00Z', timezone: 'Europe/Athens' }));
    assert.doesNotMatch(controls, /Live · updated|Last 30 days|Compare</);
    assert.match(controls, /Τελευταίες 30 ημέρες/);
    const note = renderToStaticMarkup(createElement(DataNote, { slug: 'facebook_ads', campaigns: { scope: { mode: 'pick', ids: ['a'] }, names: ['Brand'], missing: 1 } }));
    assert.doesNotMatch(note, /About these numbers|no longer exists/);
    const body = renderToStaticMarkup(createElement(ReportBody, { data: { range, comparison: null, sections: [{ id: 'b', title: 'Meta', source: { integrationId: 1, slug: 'facebook_ads', platform: 'Meta Ads', account_name: 'Acme' }, blocks: [] }], sources: [], generated_at: '' } as any, fmt: { decimalSeparatorFormat: 'comma_dot' } }));
    assert.doesNotMatch(body, /This block has no widgets/);
    assert.match(body, GREEK);
  } finally {
    setRequestLocale('en');
  }
  assert.equal(presetLabel('last_7d', 'el'), 'Τελευταίες 7 ημέρες');
  assert.equal(presetLabel('last_7d', 'en'), 'Last 7 days');
  assert.equal(localeForPublic({ locale: 'el' }, 'en'), 'en', '?lang=en on a Greek project');
  const cover = renderToStaticMarkup(createElement(ReportCover, base));
  assert.match(cover, /Sep/, 'English again after the reset');
});

test('e-mails in Greek: a held-report alert for a Greek project and a goal e-mail carry Greek subjects and bodies', async () => {
  const { runAutomation } = await import('../src/lib/services/automations');
  const { evaluateGoals } = await import('../src/lib/services/goals');
  const { company, project, token } = await makeCompany();
  await db.project.update({ where: { id: project.id }, data: { locale: 'el' } });
  const owner = `owner-${token.slice(3, 11)}@x.test`;
  await db.user.create({ data: { companyId: company.id, email: owner, name: 'Owner', passwordHash: 'x', role: 'owner' } });
  const { addIntegration } = await import('./helpers');
  const fine = await addIntegration(company.id, project.id, 'facebook_ads', { sourceId: 'act_ok' });
  const broken = await addIntegration(company.id, project.id, 'facebook_ads', { sourceId: 'act_broken', demo: false, credentials: { oauth: 'meta' } });
  const a = await db.automation.create({ data: { projectId: project.id, title: 'Greek digest', frequency: 'monthly', channels: ['email'], emails: ['client@x.test'], integrationIds: [fine.id, broken.id], holdOnFailure: true, dayOfMonth: 1, hour: 8, enabled: true, nextRunAt: new Date() } });
  const r = await runAutomation(a.id);
  assert.equal(r.status, 'held');
  const mail = await db.outbox.findFirstOrThrow({ where: { companyId: company.id, toAddr: owner }, orderBy: { id: 'desc' } });
  assert.match(mail.subject, GREEK, `Greek subject: ${mail.subject}`);
  assert.doesNotMatch(mail.subject, /Report held/);
  assert.match(mail.body, /Αποστολή τώρα|Αποστολή/);
  await db.goal.create({ data: { projectId: project.id, integrationId: fine.id, referenceKey: 'fb_ads:spend', title: 'Δαπάνη', frequency: 'monthly', target: 1, direction: 'higher_better', alert: true, alertEmails: ['pm@x.test'] } });
  await evaluateGoals(company.id);
  const goalMail = await db.outbox.findFirst({ where: { companyId: company.id, toAddr: 'pm@x.test' }, orderBy: { id: 'desc' } });
  assert.ok(goalMail, 'the goal e-mail went out');
  assert.match(goalMail!.subject, GREEK, `Greek goal subject: ${goalMail!.subject}`);
});

test('metric labels: Greek labels for the most used metrics, charts and tables of every demo platform, every key in the catalog, the English title for the rest, and KPI cards and table headers follow the locale', async () => {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { metricLabel, METRIC_LABELS_EL } = await import('../src/lib/catalog/labels');
  const { getCatalog } = await import('../src/lib/catalog/build');
  const { INTEGRATIONS } = await import('../src/lib/catalog/integrations');
  const { setRequestLocale } = await import('../src/lib/i18n/request');
  const { WidgetCard } = await import('../src/components/widgets');
  assert.equal(metricLabel({ reference_key: 'fb_ads:spend', title: 'Amount spent' }, 'el'), 'Δαπάνη');
  assert.equal(metricLabel({ reference_key: 'fb_ads:spend', title: 'Amount spent' }, 'en'), 'Amount spent');
  assert.equal(metricLabel({ reference_key: 'fb_ads:nope', title: 'Unknown thing' }, 'el'), 'Unknown thing', 'no Greek label → the English title, never empty');
  assert.equal(metricLabel({ reference_key: 'x', title: '' }, 'el'), '', 'an empty title stays empty rather than inventing one');
  const keys = Object.keys(METRIC_LABELS_EL);
  assert.ok(keys.length >= 150, `${keys.length} labels`);
  for (const [k, title] of [['ig:followers', 'Total followers'], ['woo:revenue', 'Revenue'], ['mc:sent', 'Emails sent'], ['gbp:calls', 'Calls'], ['fb_ads:campaigns', 'Featured campaigns'], ['gads:spend_by_date', 'Amount invested per day'], ['ga4:sessions_by_date', 'Sessions per day'], ['ga4:top_pages', 'Top pages'], ['gsc:queries', 'Top queries'], ['ig:top_posts', 'Top posts'], ['shop:top_products', 'Top products']] as const) {
    const l = metricLabel({ reference_key: k, title }, 'el');
    assert.ok(GREEK.test(l), `${k} has a Greek label (got ${l})`);
  }
  const known = new Set(INTEGRATIONS.flatMap((i) => getCatalog(i.slug, {}).map((w) => w.reference_key)));
  const missing = keys.filter((k) => !known.has(k));
  assert.deepEqual(missing, [], 'every labelled key exists in the catalog');
  assert.ok(keys.every((k) => GREEK.test(METRIC_LABELS_EL[k])), 'every label is Greek');
  const block = { integrationId: 1, platform: 'Meta Ads', slug: 'facebook_ads', account_name: 'Acme', id: 'w', layout: { x: 0, y: 0, w: 3, h: 2 }, widget: { reference_key: 'fb_ads:spend', key: 'spend', label: 'Amount spent', format: 'currency', diff_type: 'neutral', currency: 'EUR', value: { type: 'number', value: 1234 } } } as any;
  const fmt = { decimalSeparatorFormat: 'comma_dot' as const };
  try {
    setRequestLocale('el');
    assert.match(renderToStaticMarkup(createElement(WidgetCard, { b: block, fmt, grid: true })), /Δαπάνη/, 'the KPI card shows the Greek label');
  } finally {
    setRequestLocale('en');
  }
  assert.match(renderToStaticMarkup(createElement(WidgetCard, { b: block, fmt, grid: true })), /Amount spent/);
  const custom = { ...block, widget: { ...block.widget, label: 'My spend' }, custom: { title: 'My spend' } };
  try {
    setRequestLocale('el');
    assert.match(renderToStaticMarkup(createElement(WidgetCard, { b: custom, fmt, grid: true })), /My spend/, 'a title typed in the editor wins over the label');
  } finally {
    setRequestLocale('en');
  }
  // table headers: the dimension and the metric columns follow the locale, the count line too
  const tableBlock = { ...block, id: 'tb', widget: { reference_key: 'fb_ads:campaigns', key: 'campaigns', label: 'Featured campaigns', format: 'number', diff_type: 'neutral', value: { type: 'table', columns: ['campaign', 'spend', 'clicks'], columnLabels: ['Campaign', 'Spend', 'Clicks'], columnFormats: ['text', 'currency', 'number'], rows: [['Brand', 100, 10], ['Promo', 50, 5]], total_rows: 5 } } } as any;
  try {
    setRequestLocale('el');
    const html = renderToStaticMarkup(createElement(WidgetCard, { b: tableBlock, fmt, grid: true }));
    for (const s of ['Κορυφαίες καμπάνιες', 'Καμπάνια', 'Δαπάνη', 'Κλικ (όλα)', 'Κορυφαία 2 από 5']) assert.ok(html.includes(s), `table shows ${s}: ${html.replace(/<[^>]+>/g, ' ').replace(/s+/g, ' ').slice(0, 200)}`);
  } finally {
    setRequestLocale('en');
  }
  const en = renderToStaticMarkup(createElement(WidgetCard, { b: tableBlock, fmt, grid: true }));
  for (const s of ['Featured campaigns', 'Campaign', 'Spend', 'Clicks', 'Top 2 of 5']) assert.ok(en.includes(s), `English table shows ${s}`);
  // the generic data note and the tile placeholders are dictionary strings
  const { t } = await import('../src/lib/i18n');
  assert.ok(GREEK.test(t('el', 'public.genericDataNote')), 'the generic data note is Greek');
  assert.match(t('en', 'public.genericDataNote'), /^Numbers come from each platform/);
  assert.ok(GREEK.test(t('el', 'editor.pickNumberTarget')) && GREEK.test(t('el', 'editor.pickNumber')));
  const { readFileSync } = await import('node:fs');
  assert.ok(readFileSync('src/components/public-report.tsx', 'utf8').includes("tr('public.genericDataNote')"), 'the public page uses the dictionary note');
  assert.ok(readFileSync('src/lib/layout/tiles.ts', 'utf8').includes("tr('editor.pickNumberTarget')"), 'the tile placeholder uses the dictionary');
});

test('dictionary quality: the Greek never repeats the English except brand and technical words, placeholders match, and the review document lists every key', async () => {
  const { en, el } = await import('../src/lib/i18n/dicts');
  const { readFileSync, existsSync } = await import('node:fs');
  const ALLOW = new Set(['Ruler Reports', 'API', 'MCP', 'CSV', 'PDF', 'OK', 'Email', 'URL', 'API & MCP', 'API tokens', 'Webhooks', 'White-label', 'KPI']);
  const same = Object.keys(en).filter((k) => en[k] === el[k] && !ALLOW.has(en[k]));
  assert.deepEqual(same, [], 'untranslated keys');
  for (const k of Object.keys(en)) {
    assert.equal((el[k].match(/\{/g) ?? []).length, (el[k].match(/\}/g) ?? []).length, `balanced braces in ${k}`);
    const vars = (x: string) => [...x.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    assert.equal(vars(el[k]), vars(en[k]), `same placeholders in ${k}`);
  }
  assert.ok(existsSync('docs/i18n-review.md'), 'docs/i18n-review.md is generated');
  const doc = readFileSync('docs/i18n-review.md', 'utf8');
  for (const k of Object.keys(en)) assert.ok(doc.includes(`\`${k}\``), `${k} listed in the review doc`);
  assert.match(doc, /needs native review/i);
  assert.match(doc, /fb_ads:spend/);
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, ['scripts/i18n-review.mjs', '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, `the review doc is up to date: ${r.stdout}${r.stderr}`);
});
