// Plan H fix pass (review C1, C2, I1–I6, I8): node-level checks; the browser file proves the pages.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { db } from '../src/lib/db';
import { addIntegration, makeCompany } from './helpers';

const GREEK = /[Ͱ-Ͽ]/;
const src = (f: string) => readFileSync(f, 'utf8');

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

test('C1: the signed-out pages mount the client provider, so the login form and the auth form speak the request locale', async () => {
  const login = src('src/app/login/page.tsx');
  assert.ok(/<I18nProvider locale=\{locale\} dict=\{dictFor\(locale, \[/.test(login), 'the login page wraps LoginForm in I18nProvider');
  assert.ok(login.includes('await getLocale()'), 'the login page resolves the locale (Accept-Language when signed out)');
  const authForm = src('src/components/auth-form.tsx');
  assert.ok(!authForm.includes("'Please wait…'"), 'the auth form takes its pending label from the page');
  assert.ok(src('src/app/signup/page.tsx').includes("pending={t('auth.pleaseWait')}"), 'the signup page passes the pending label');
  const { t } = await import('../src/lib/i18n');
  assert.ok(GREEK.test(t('el', 'auth.pleaseWait')));
});

test('C2: the project language has a select on the project settings tab and the actions read and default it', async () => {
  const page = src('src/app/projects/[id]/page.tsx');
  assert.ok(/<select name="locale"[^>]*data-project-locale/.test(page), 'a locale select on the settings form');
  assert.ok(page.includes("t('projects.languageHint')"), 'with the hint that client links, e-mails and PDFs follow it');
  const actions = src('src/app/actions/app.ts');
  assert.ok(/locale: z\.enum\(\['en', 'el'\]\)/.test(actions), 'updateProjectAction validates the locale');
  assert.ok(/locale: r\.locale/.test(actions), 'and writes it');
  assert.ok(/locale: company\?\.locale \?\? 'en'/.test(actions), 'createProjectAction defaults a new project to the company language');
  const { t } = await import('../src/lib/i18n');
  assert.ok(GREEK.test(t('el', 'projects.languageHint')));
});

test('I1: ?lang= and ?embed= survive the dashboard period picker and the unlock redirect', async () => {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { publicPath } = await import('../src/lib/share');
  assert.equal(publicPath('report', 'tok', { lang: 'el', embed: true }), '/r/tok?lang=el&embed=1');
  assert.equal(publicPath('dashboard', 'tok', { lang: 'el' }), '/d/tok?lang=el');
  assert.equal(publicPath('goals', 'tok', {}), '/g/tok');
  assert.equal(publicPath('report', 'tok', { lang: 'fr' }), '/r/tok', 'an unknown language is dropped');
  const { UnlockClient } = await import('../src/components/unlock-client');
  const gate = renderToStaticMarkup(createElement(UnlockClient, { token: 'tok', kind: 'report', lang: 'el', embed: true }));
  assert.match(gate, /name="lang" value="el"/);
  assert.match(gate, /name="embed" value="1"/);
  const { DashboardControls } = await import('../src/components/dashboard-controls');
  const controls = renderToStaticMarkup(createElement(DashboardControls, { report: { preset: 'last_30d', clientPresets: ['last_7d', 'last_30d'] }, preset: 'last_7d', compare: true, updatedAt: new Date().toISOString(), timezone: 'UTC', lang: 'el' } as any));
  assert.match(controls, /name="lang" value="el"/, 'the period picker carries the language');
  const actions = src('src/app/actions/public.ts');
  assert.ok(actions.includes('publicPath('), 'the unlock action redirects through publicPath');
  assert.ok(!actions.includes("'Wrong password'"), 'the error is translated');
  const { t } = await import('../src/lib/i18n');
  assert.ok(GREEK.test(t('el', 'public.wrongPassword')));
});

test('I5: e-mails and notifications are whole in Greek — KPI labels, the frequency, the health footer, the goal line', async () => {
  const { runAutomation } = await import('../src/lib/services/automations');
  const { healthEmailHtml } = await import('../src/lib/services/health');
  const { goalMissedLine } = await import('../src/lib/services/goals');
  const { company, project } = await makeCompany();
  await db.project.update({ where: { id: project.id }, data: { locale: 'el' } });
  const meta = await addIntegration(company.id, project.id, 'facebook_ads');
  const tpl = await db.template.findFirstOrThrow({ where: { companyId: null, kind: 'report', isDefault: true } });
  const a = await db.automation.create({ data: { projectId: project.id, title: 'Μηνιαία αναφορά', frequency: 'monthly', dayOfMonth: 1, hour: 8, channels: ['email', 'in-app'], emails: ['client@x.test'], templateId: tpl.id, integrationIds: [meta.id], enabled: true, holdOnFailure: false, nextRunAt: new Date() } });
  await withEnv('ANTHROPIC_API_KEY', undefined, async () => {
    const run = await runAutomation(a.id);
    assert.equal(run.status, 'ok', JSON.stringify(run.detail));
  });
  const mail = await db.outbox.findFirst({ where: { companyId: company.id, toAddr: 'client@x.test' }, orderBy: { id: 'desc' } });
  assert.ok(mail, 'the e-mail was queued');
  assert.ok(mail!.body.includes('Δαπάνη'), 'the KPI cells carry the Greek metric label');
  assert.ok(!mail!.body.includes('Amount spent'), 'not the English catalog title');
  const note = await db.notification.findFirst({ where: { companyId: company.id, projectId: project.id }, orderBy: { id: 'desc' } });
  assert.ok(note, 'the in-app notification exists');
  assert.ok(!/\(monthly\)/.test(note!.body) && GREEK.test(note!.body), `the frequency is translated: ${note!.body}`);
  assert.ok(!note!.title.startsWith('Report ready:'), `the title too: ${note!.title}`);
  const health = healthEmailHtml({ name: 'Meta', projectName: 'Acme' }, 'failing', 'boom', 'http://x', 'el');
  assert.ok(!health.includes('Sent by Ruler Reports'), 'the health footer is translated');
  assert.ok(GREEK.test(health));
  const line = goalMissedLine('el', 12, 20, '2026-09-01', '2026-09-30');
  assert.ok(GREEK.test(line) && line.includes('12 / 20') && !line.includes(' for '), line);
  assert.equal(goalMissedLine('en', 12, 20, '2026-09-01', '2026-09-30'), '12 / 20 for 2026-09-01 → 2026-09-30');
});

test('I6: the request store takes a lookup instead of the dictionaries, so the client bundle ships only the namespaces a page sends', async () => {
  const request = src('src/lib/i18n/request.ts');
  assert.ok(!/from '\.\/index'|from '\.\/dicts'|\.json'/.test(request), 'request.ts imports no dictionary');
  const provider = src('src/components/i18n-provider.tsx');
  assert.ok(!/from '@\/lib\/i18n\/dicts'|from '@\/lib\/i18n'(?!\/)/.test(provider), 'the provider imports no dictionary');
  const { setRequestLocale, getRequestLocale, tr } = await import('../src/lib/i18n/request');
  setRequestLocale('el', (k) => (k === 'x.hello' ? 'Γεια σου {name}' : undefined));
  assert.equal(getRequestLocale(), 'el');
  assert.equal(tr('x.hello', { name: 'Νίκο' }), 'Γεια σου Νίκο');
  assert.equal(tr('x.missing'), 'x.missing', 'an unknown key renders as itself');
  const { setServerLocale } = await import('../src/lib/i18n/server');
  setServerLocale('el');
  assert.ok(GREEK.test(tr('public.sources')), 'the server helper binds the real dictionary');
  setServerLocale('en');
  assert.equal(tr('public.sources'), 'Sources');
  const shell = src('src/components/shell.tsx');
  for (const ns of ['public', 'health', 'connect', 'wizard']) assert.ok(shell.includes(`'${ns}'`), `the shell ships ${ns} (the editor preview renders public chrome on the client)`);
});

test('I4: the per-platform data notes, the ranked-list placeholder and the quarter eyebrow speak Greek on a Greek page', async () => {
  const { DATA_NOTES, DATA_NOTES_EL, dataNote } = await import('../src/lib/catalog/data-notes');
  for (const [slug, parts] of Object.entries(DATA_NOTES)) {
    const el = DATA_NOTES_EL[slug];
    assert.ok(el, `Greek notes for ${slug}`);
    for (const part of Object.keys(parts) as (keyof typeof parts)[]) assert.ok(el[part] && GREEK.test(el[part]!), `${slug}.${part} is Greek`);
  }
  assert.equal(dataNote('facebook_ads', null, 'el').length, dataNote('facebook_ads', null, 'en').length);
  assert.ok(dataNote('facebook_ads', null, 'el').every((s) => GREEK.test(s)));
  assert.ok(dataNote('nope', null, 'el').every((s) => GREEK.test(s)), 'the generic sentence too');
  const { t } = await import('../src/lib/i18n');
  for (const k of ['public.by_quarter', 'public.nothingToRank', 'wizard.defaultSubtitle']) assert.ok(GREEK.test(t('el', k)), `${k} in Greek`);
  assert.ok(src('src/components/data-note.tsx').includes('getRequestLocale()'), 'the data note reads the request locale');
  assert.ok(!src('src/components/infographic.tsx').includes("'Nothing to rank yet.'"));
  assert.ok(!src('src/components/report-builder.tsx').includes("useState('Performance analysis')"));
});

test('I2/I3: the English the review found on the agency pages, the editor, the wizard and the Look panel is gone from the sources', async () => {
  const gone: [string, string[]][] = [
    ['src/app/overview/page.tsx', ["'client' : 'clients'", 'attention (failing or about to expire)']],
    ['src/components/report-index.tsx', ["'report' : 'reports'", '> New {kind}', 'No ${kind}s found']],
    ['src/app/projects/page.tsx', ['} integrations</span>', 'reports & dashboards']],
    ['src/app/projects/[id]/page.tsx', ['active integrations`', 'Which campaigns of', 'Shown next to the client', 'vs previous 30 days', "r.preset.replace(/_/g, ' ')", '} views', '<CopyButton text={share.url} />']],
    ['src/lib/services/overview.ts', ["label: 'Ad spend'", "label: 'Tracked calls'"]],
    ['src/app/templates/page.tsx', ['sections ·', 'used {tok.usedCount}']],
    ['src/app/integrations/page.tsx', ["'columns auto-detected'", '} connected</td>']],
    ['src/components/health-chip.tsx', ['Failed on the last sync', '> Failing', 'Expires tomorrow', '> Connected', 'Not checked yet']],
    ['src/app/projects/[id]/connect/page.tsx', ['Search…', '>Search<', '>demo data<', '>extra<', 'Connect to ${project.name}']],
    ['src/app/projects/[id]/connect/[slug]/page.tsx', ['Display name (optional)', 'Use synthetic demo data', 'About this integration', 'metrics available once connected', 'Sign in, grant read-only access']],
    ['src/app/projects/[id]/connect/[slug]/pick/page.tsx', ['Connect selected', '>Cancel<', 'Signed in with', 'already connected — ticking']],
    ['src/app/settings/page.tsx', ['Custom domain', 'Embed any dashboard', 'white-label support is unconfirmed', "'configured' : 'not set'", "'Scheduler', process.env"]],
    ['src/components/report-page.tsx', ['<CopyButton text={url} />', '<PrintButton />']],
    ['src/components/report-editor.tsx', ["number_v1: 'KPI'", "'Remove this block and its widgets", "'Custom block'", "'Predefined metrics'", "'Customizable'", "title: 'Analysis card'", "'Saving…' : 'Save template'", "'Shown as a tooltip'", "'Remove highlight' : 'Highlight'", 'Follows the dashboard preset']],
    ['src/components/report-builder.tsx', ["'Previous period'", "'Same period last year'", "'No comparison'", "'Pick a template'", "'Select at least one integration'"]],
    ['src/components/look-panel.tsx', ["'Client colour first'", "'Vivid'", "'No cover'", "'Full-width header'"]],
    ['src/components/report-rows.tsx', ["last_7d: 'Last 7 days'"]],
  ];
  const left: string[] = [];
  for (const [file, needles] of gone) {
    const s = src(file);
    for (const n of needles) if (s.includes(n)) left.push(`${file}: ${n}`);
  }
  assert.deepEqual(left, [], 'English left in the sources');
  // the keys the sweep introduced exist in Greek
  const { t } = await import('../src/lib/i18n');
  for (const k of ['overview.clientsLast', 'reports.countReports', 'projects.integrationsCount', 'overview.kpiSpend', 'health.failing', 'health.connected', 'connect.search', 'connect.displayName', 'connect.useDemo', 'settings.wlDomain', 'settings.configured', 'share.copyLink', 'editor.comp_chart_v1', 'editor.customizable', 'editor.removeBlockConfirm', 'wizard.cmpPrevious', 'look.paletteVivid', 'look.coverNone', 'templates.stats']) assert.ok(GREEK.test(t('el', k)), `${k} has a Greek value`);
});
