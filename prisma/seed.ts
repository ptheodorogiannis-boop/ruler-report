// Demo data: one agency, six clients, ~50 integrations (synthetic data), templates, reports, a live
// dashboard, an automation, goals, timeline events, a blended metric and a pushed-data source.
import bcrypt from 'bcryptjs';
import { db } from '../src/lib/db';
import { encryptJson, randomToken, sha256 } from '../src/lib/crypto';
import { PLATFORM_TEMPLATES } from '../src/lib/templates/defaults';
import { createReport } from '../src/lib/services/reports';
import { nextRunAfter } from '../src/lib/services/automations';
import { customConnector } from '../src/lib/connectors/custom';
import { addDays, today } from '../src/lib/util/dates';
import { newWebhookSecret } from '../src/lib/services/webhooks';

async function main() {
  if (await db.company.count()) {
    console.log('Database already has data — skipping seed. (Delete prisma/dev.db to reseed.)');
    return;
  }
  const company = await db.company.create({ data: { name: 'Demo Agency', type: 'agency', specialty: 'performance_marketing', brandColor: '#1a36e6' } });
  const hash = await bcrypt.hash('demo1234', 10);
  const owner = await db.user.create({ data: { companyId: company.id, email: 'admin@demo.local', name: 'Demo Admin', passwordHash: hash, role: 'owner' } });
  await db.user.create({ data: { companyId: company.id, email: 'editor@demo.local', name: 'Demo Editor', passwordHash: hash, role: 'editor' } });

  // templates
  const tplIds: Record<string, number> = {};
  for (const t of PLATFORM_TEMPLATES) {
    const row = await db.template.create({ data: { companyId: null, title: t.title, description: t.description, kind: t.kind, isDefault: !!t.isDefault, sections: t.sections as any } });
    tplIds[t.title] = row.id;
  }

  const clients = [
    { name: 'Acme Running Co', tz: 'Europe/Athens', cur: 'EUR', stack: ['facebook_ads', 'google_adwords', 'instagram_business', 'facebook', 'google_analytics_4', 'search_console', 'woo_commerce', 'mailchimp', 'google_my_business'] },
    { name: 'Olive Clinic', tz: 'Europe/Athens', cur: 'EUR', stack: ['facebook_ads', 'google_adwords', 'instagram_business', 'facebook', 'google_analytics_4', 'search_console', 'google_my_business', 'phonetrack', 'hubspot_crm'] },
    { name: 'Nordic Villas', tz: 'Europe/Stockholm', cur: 'EUR', stack: ['facebook_ads', 'instagram_business', 'google_analytics_4', 'search_console', 'youtube', 'tiktok_ads', 'tiktok'] },
    { name: 'Metro Dental', tz: 'America/New_York', cur: 'USD', stack: ['google_adwords', 'facebook_ads', 'google_my_business', 'phonetrack', 'pipedrive', 'google_analytics_4'] },
    { name: 'Peak Fitness', tz: 'Europe/London', cur: 'GBP', stack: ['facebook_ads', 'instagram_business', 'tiktok', 'shopify', 'klaviyo', 'google_analytics_4'] },
    { name: 'Studio Kappa', tz: 'Europe/Athens', cur: 'EUR', stack: ['linkedin_ads', 'linkedin', 'google_analytics_4', 'hubspot_crm', 'webhook_ingest'] },
  ];
  const { INTEGRATIONS } = await import('../src/lib/catalog/integrations');
  const created: Record<string, { id: number; integrations: Record<string, number> }> = {};
  let n = 1000;
  for (const c of clients) {
    const p = await db.project.create({ data: { companyId: company.id, name: c.name, timezone: c.tz, currency: c.cur, decimalSeparatorFormat: c.tz.startsWith('Europe/Athens') ? 'dot_comma' : 'comma_dot' } });
    created[c.name] = { id: p.id, integrations: {} };
    for (const slug of c.stack) {
      const def = INTEGRATIONS.find((i) => i.slug === slug)!;
      n++;
      const sourceId = def.category === 'ads' ? `act_${n}0${n}` : slug === 'search_console' ? `https://www.${c.name.toLowerCase().replace(/\s+/g, '')}.com/` : slug === 'webhook_ingest' ? 'Lead form pushes' : String(n * 7);
      const row = await db.integration.create({
        data: { companyId: company.id, projectId: p.id, slug, name: `${c.name} – ${def.name}`, sourceId, status: 'active', credentials: ['sheets', 'csv', 'rest', 'ingest'].includes(def.connector) ? null : encryptJson({ demo: true }), config: { currency: c.cur }, lastSyncAt: new Date() },
      });
      created[c.name].integrations[slug] = row.id;
    }
  }

  // pushed lead rows for Studio Kappa (Push API demo) — 75 days
  const kappa = created['Studio Kappa'];
  const ing = kappa.integrations['webhook_ingest'];
  const sources = ['LinkedIn', 'Website', 'Referral', 'Webinar'];
  const rows = [];
  for (let i = 75; i >= 1; i--) {
    const date = addDays(today('Europe/Athens'), -i);
    for (const s of sources) {
      const seed = (i * 31 + s.length * 17) % 7;
      if (seed === 0) continue;
      rows.push({ integrationId: ing, date, data: { source: s, leads: 1 + (seed % 4), qualified: seed % 3, cost: 20 + seed * 7 } });
    }
  }
  await db.ingestRow.createMany({ data: rows });
  const validated = await customConnector.validate!({ integration: { id: ing, slug: 'webhook_ingest', name: '', sourceId: 'Lead form pushes', config: {}, credentials: null } });
  if (validated?.config) {
    const cur = await db.integration.findUnique({ where: { id: ing } });
    await db.integration.update({ where: { id: ing }, data: { config: { ...(cur!.config as object), ...validated.config } } });
  }

  // custom blended metric
  await db.customMetric.create({ data: { companyId: company.id, name: 'Blended ROAS (Meta + Google)', formula: '({fb_ads:conversion_value} + {gads:conversion_value}) / ({fb_ads:spend} + {gads:spend})', format: 'decimal', diff: 'positive_good' } });
  await db.customMetric.create({ data: { companyId: company.id, name: 'Blended cost per lead', formula: '({fb_ads:spend} + {gads:spend}) / ({fb_ads:leads} + {gads:leads})', format: 'currency', diff: 'positive_bad' } });

  // reports + dashboard for first two clients
  const prevMonthStart = addDays(today('UTC').slice(0, 8) + '01', -1).slice(0, 8) + '01';
  const prevMonthEnd = addDays(today('UTC').slice(0, 8) + '01', -1);
  const cmpStart = addDays(prevMonthStart, -1).slice(0, 8) + '01';
  const cmpEnd = addDays(prevMonthStart, -1);
  for (const name of ['Acme Running Co', 'Olive Clinic']) {
    const c = created[name];
    const ids = Object.values(c.integrations);
    await createReport({ companyId: company.id, projectId: c.id, kind: 'report', title: `${name} | Monthly report`, subtitle: 'Performance analysis', start: prevMonthStart, end: prevMonthEnd, comparisonStart: cmpStart, comparisonEnd: cmpEnd, templateId: tplIds['Default report'], integrationIds: ids, createdBy: owner.id, withAi: true });
    await createReport({ companyId: company.id, projectId: c.id, kind: 'dashboard', title: `${name} | Live dashboard`, templateId: tplIds['Default dashboard'], integrationIds: ids, preset: 'last_30d', createdBy: owner.id });
  }
  const kappaIds = Object.values(kappa.integrations);
  await createReport({ companyId: company.id, projectId: kappa.id, kind: 'report', title: 'Studio Kappa | Lead generation', subtitle: 'Leads, CRM and pushed data', start: prevMonthStart, end: prevMonthEnd, comparisonStart: cmpStart, comparisonEnd: cmpEnd, templateId: tplIds['Lead generation report'], integrationIds: kappaIds, createdBy: owner.id, withAi: true });

  // automation (monthly, in-app + email → Outbox when SMTP is off)
  const acme = created['Acme Running Co'];
  const auto = await db.automation.create({
    data: { projectId: acme.id, title: 'Monthly client report', frequency: 'monthly', dayOfMonth: 1, hour: 8, templateId: tplIds['Default report'], integrationIds: Object.values(acme.integrations), channels: ['in-app', 'email'], emails: ['client@acme-running.example'], attachAnalysis: true },
  });
  await db.automation.update({ where: { id: auto.id }, data: { nextRunAt: nextRunAfter(auto, 'Europe/Athens', new Date()) } });

  // goals
  const goals = [
    { p: 'Acme Running Co', slug: 'facebook_ads', key: 'fb_ads:spend', title: 'Meta ad spend', target: 7500, dir: 'higher_better' },
    { p: 'Acme Running Co', slug: 'google_analytics_4', key: 'ga4:sessions', title: 'Website sessions', target: 24000, dir: 'higher_better' },
    { p: 'Acme Running Co', slug: 'facebook_ads', key: 'fb_ads:cpc', title: 'Meta CPC under €0.60', target: 0.6, dir: 'lower_better' },
    { p: 'Olive Clinic', slug: 'phonetrack', key: 'phonetrack:calls', title: 'Tracked calls', target: 400, dir: 'higher_better' },
    { p: 'Olive Clinic', slug: 'instagram_business', key: 'ig:followers', title: 'Instagram followers', target: 12000, dir: 'higher_better' },
  ];
  for (const g of goals) {
    const proj = created[g.p];
    await db.goal.create({ data: { projectId: proj.id, integrationId: proj.integrations[g.slug], referenceKey: g.key, title: g.title, frequency: 'monthly', target: g.target, direction: g.dir } });
  }

  // timeline
  const t0 = today('UTC');
  await db.timelineEvent.createMany({
    data: [
      { projectId: acme.id, title: 'Spring collection launch', content: '<p>New range live on the site; Meta catalog campaign switched on.</p>', date: addDays(t0, -21) },
      { projectId: acme.id, title: 'Budget +20% on Prospecting', content: '<p>Scaled the lookalike ad set after two weeks of stable ROAS.</p>', date: addDays(t0, -9) },
      { projectId: created['Olive Clinic'].id, title: 'New landing page for consultations', content: '<p>Replaced the form with click-to-call + WhatsApp.</p>', date: addDays(t0, -14) },
    ],
  });

  // API token (shown once)
  const token = `rr_${randomToken(24)}`;
  await db.apiToken.create({ data: { companyId: company.id, name: 'Seed token', prefix: token.slice(0, 7), tokenHash: sha256(token) } });

  // example webhook (inactive) so the UI is not empty
  await db.webhook.create({ data: { companyId: company.id, url: 'https://example.com/hooks/reports', eventType: 'report_created', source: 'custom', status: 'inactive', secret: newWebhookSecret() } });

  console.log('\nSeeded.\n  Login:     admin@demo.local / demo1234\n  API token: ' + token + '  (shown once)\n');
}

main().then(() => db.$disconnect()).catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
