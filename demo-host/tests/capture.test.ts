// Task 5: the capture output is complete and clean.
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import type { Manifest } from '../src/route-key';
import type { Seed } from '../src/seed/types';

const OUT = 'demo-host/capture-out';
const manifest = () => JSON.parse(readFileSync(`${OUT}/views/manifest.json`, 'utf8')) as Manifest;
const group = (lang: string, g: string) => JSON.parse(readFileSync(`${OUT}/views/${lang}/${g}.json`, 'utf8')) as Record<string, string>;

test('every route is captured in both languages, cleanly', () => {
  assert.ok(existsSync(`${OUT}/views/manifest.json`), 'manifest exists');
  const m = manifest();
  assert.ok(m.routes.length >= 150, `${m.routes.length} routes`);
  assert.equal(m.chrome, 'overview');
  const groups = [...new Set(m.routes.map((r) => r.group))];
  assert.ok(groups.length <= 40, `${groups.length} groups`);
  const problems: string[] = [];
  for (const lang of ['en', 'el']) {
    const files = Object.fromEntries(groups.map((g) => [g, group(lang, g)]));
    for (const r of m.routes) {
      const html = files[r.group]?.[r.key];
      if (!html) {
        problems.push(`${lang} ${r.key}: missing`);
        continue;
      }
      if (/<script/i.test(html)) problems.push(`${lang} ${r.key}: script`);
      if (html.includes('/_next/')) problems.push(`${lang} ${r.key}: /_next/`);
      if (/href="\/reports\/7["?]/.test(html)) problems.push(`${lang} ${r.key}: report 7`);
      for (const ref of html.matchAll(/(?:src|href)="((?:images|fonts|assets)\/[^"]+)"/g)) if (!existsSync(`${OUT}/${ref[1]}`)) problems.push(`${lang} ${r.key}: ${ref[1]} missing`);
      if (lang === 'el' && html.includes('class="frame"') && !html.includes('Επισκόπηση')) problems.push(`el ${r.key}: nav not Greek`);
    }
  }
  assert.deepEqual(problems.slice(0, 20), []);
});

test('the stylesheet and its fonts are local', () => {
  const css = readFileSync(`${OUT}/app.css`, 'utf8');
  assert.ok(css.length > 20_000, 'the app stylesheet');
  assert.ok(!css.includes('/_next/'), 'no /_next/ urls');
  const fonts = [...css.matchAll(/url\((?:'|")?(fonts\/[^)'"]+)/g)].map((m) => m[1]);
  assert.ok(fonts.length >= 2, 'fonts referenced');
  for (const f of fonts) assert.ok(existsSync(`${OUT}/${f}`), `${f} exists`);
});

test('a PDF per shared report, layout and language', () => {
  const seed = JSON.parse(readFileSync(`${OUT}/seed.json`, 'utf8')) as Seed;
  const shared = seed.reports.filter((r) => r.shareEnabled);
  const files = readdirSync(`${OUT}/pdf`);
  for (const r of shared)
    for (const layout of ['flow', 'pages'])
      for (const lang of ['en', 'el']) {
        const f = `${r.shareToken}-${layout}-${lang}.pdf`;
        assert.ok(files.includes(f), `${f} (report ${r.id})`);
        const pdf = readFileSync(`${OUT}/pdf/${f}`);
        assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
        assert.ok(pdf.length >= 50_000, `${f} is a report, not an error page (${pdf.length} bytes)`);
      }
});

test('images the live views show are embedded in the seed (a Claude page blocks external images)', () => {
  const seed = JSON.parse(readFileSync(`${OUT}/seed.json`, 'utf8'));
  const external: string[] = [];
  const visit = (v: unknown, key = '') => {
    if (typeof v === 'string') {
      if (/(logo|cover|image|src)$/i.test(key) && /^(https?:\/\/|\/api\/media\/)/.test(v)) external.push(`${key}: ${v.slice(0, 80)}`);
    } else if (Array.isArray(v)) v.forEach((x) => visit(x, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) visit(x, k);
  };
  visit(seed);
  assert.deepEqual(external, []);
  assert.match(String(seed.company.logo ?? 'data:'), /^data:image\//, 'the agency logo is embedded');
});

test('review I6/M2/M4: Ruler Agency with a visible logo, no scratch-report row, no localhost on any screen', () => {
  const seed = JSON.parse(readFileSync(`${OUT}/seed.json`, 'utf8'));
  assert.equal(seed.company.name, 'Ruler Agency');
  const svg = Buffer.from(String(seed.company.logo).split(',')[1], 'base64').toString();
  assert.ok(!/fill:\s*#fff(fff)?\b/i.test(svg), 'the logo is not white on the white client header');
  const m = manifest();
  const problems: string[] = [];
  for (const lang of ['en', 'el'])
    for (const g of new Set(m.routes.map((r) => r.group))) {
      const views = group(lang, g);
      for (const [k, html] of Object.entries(views)) {
        if (html.includes('Demo Agency')) problems.push(`${lang} ${k}: Demo Agency`);
        if (/localhost:\d+|127\.0\.0\.1/.test(html)) problems.push(`${lang} ${k}: localhost`);
        if (html.includes('J3W1YpqRT9jvt21eJzOA5kLPVWFVPh1A')) problems.push(`${lang} ${k}: report 7 row`);
      }
    }
  assert.deepEqual(problems.slice(0, 12), []);
});

test('the capture users are gone', async () => {
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient();
  try {
    assert.equal(await db.user.count({ where: { email: { in: ['demo-en@demo.local', 'demo-el@demo.local'] } } }), 0);
  } finally {
    await db.$disconnect();
  }
});
