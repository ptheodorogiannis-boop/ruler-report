// The public pages Google's OAuth verification reads: the privacy policy must carry the Limited Use statement, every
// requested Google scope, the YouTube Terms and Google Privacy links and a way to revoke; robots must let them be read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PrivacyPage from '../src/app/privacy/page';
import TermsPage from '../src/app/terms/page';
import robots from '../src/app/robots';
import { GOOGLE_SCOPE_USES, LEGAL } from '../src/lib/legal';
import { OAUTH_SLUGS } from '../src/lib/oauth/providers';

const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

test('privacy policy carries what Google verification checks for', () => {
  const html = renderToStaticMarkup(createElement(PrivacyPage));
  const t = text(html);
  assert.match(t, /Ruler Reports' use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements\./);
  for (const href of ['https://developers.google.com/terms/api-services-user-data-policy', 'https://www.youtube.com/t/terms', 'https://policies.google.com/privacy', 'https://myaccount.google.com/permissions']) assert.ok(html.includes(`href="${href}"`), href);
  for (const s of GOOGLE_SCOPE_USES) assert.ok(t.includes(s.product), s.product);
  assert.ok(t.includes(LEGAL.entity) && html.includes(`mailto:${LEGAL.email}`));
  assert.match(t, /train generalised artificial intelligence/);
});

test('every Google scope the app requests is explained in the policy', () => {
  const explained = new Set(GOOGLE_SCOPE_USES.map((s) => s.scope));
  const requested = new Set(Object.values(OAUTH_SLUGS).filter((o) => o.provider === 'google').flatMap((o) => o.scopes));
  assert.ok(requested.size > 0, 'found the Google scopes');
  for (const s of requested) assert.ok(explained.has(s), `privacy policy does not explain ${s}`);
});

test('terms link the platform terms and the privacy policy', () => {
  const html = renderToStaticMarkup(createElement(TermsPage));
  for (const href of ['https://policies.google.com/terms', 'https://www.youtube.com/t/terms', '/privacy']) assert.ok(html.includes(`href="${href}"`), href);
  assert.match(text(html), /Greek law applies/);
});

test('robots lets the public pages be read and keeps the rest out', () => {
  const r = robots().rules as { allow?: string[]; disallow?: string };
  assert.deepEqual(r.allow, ['/$', '/privacy', '/terms']);
  assert.equal(r.disallow, '/');
});
