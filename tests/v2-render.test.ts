import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Pure render tests of server-safe components (no database).

test('MediaImage: placeholder without a source, an <img> with one', async () => {
  const { MediaImage } = await import('../src/components/media-image');
  const empty = renderToStaticMarkup(createElement(MediaImage, { src: null, alt: 'x' }));
  assert.match(empty, /class="media-ph[^"]*"/);
  assert.match(empty, />No image</);
  const withSrc = renderToStaticMarkup(createElement(MediaImage, { src: '/api/media/abc', alt: 'A creative', fit: 'cover' }));
  assert.match(withSrc, /<img[^>]*src="\/api\/media\/abc"/);
  assert.match(withSrc, /alt="A creative"/);
  assert.match(withSrc, /object-fit:cover|object-cover/);
});

test('MediaImage and ClientMark survive a URL with a bare percent sign (review: decodeURIComponent threw and took the page down)', async () => {
  const { MediaImage, placeholderLabel } = await import('../src/components/media-image');
  const { ClientMark } = await import('../src/components/client-mark');
  const url = 'https://cdn.example.com/50%off.png';
  assert.equal(placeholderLabel(url), '50%off.png');
  assert.equal(placeholderLabel('https://cdn.example.com/caf%C3%A9.png'), 'café.png', 'well-formed escapes are still decoded');
  assert.match(renderToStaticMarkup(createElement(MediaImage, { src: url, alt: 'offer' })), /<img[^>]*src="https:\/\/cdn\.example\.com\/50%off\.png"/);
  assert.match(renderToStaticMarkup(createElement(ClientMark, { name: 'Acme', logo: url })), /<img/);
});

test('TopNav: a single group (client role) renders no separator; the active item carries aria-current', async () => {
  const { TopNav } = await import('../src/components/top-nav');
  const one = renderToStaticMarkup(createElement(TopNav, { groups: [{ label: 'Work', items: [{ href: '/dashboards', label: 'Dashboards' }, { href: '/reports', label: 'Reports' }] }], active: '/reports' }));
  assert.doesNotMatch(one, /topnav-sep/);
  assert.match(one, /aria-current="page"[^>]*>Reports</);
  const three = renderToStaticMarkup(createElement(TopNav, { groups: [{ label: 'A', items: [{ href: '/a', label: 'A' }] }, { label: 'B', items: [{ href: '/b', label: 'B' }] }, { label: 'C', items: [{ href: '/c', label: 'C' }] }] }));
  assert.equal((three.match(/topnav-sep/g) || []).length, 2);
});

test('PlatformIcon: brand mark in the platform colour, lettermark for brands the set lacks, category glyph for generic sources', async () => {
  const { PlatformIcon } = await import('../src/components/platform-icon');
  const yt = renderToStaticMarkup(createElement(PlatformIcon, { slug: 'youtube' }));
  assert.match(yt, /<svg[^>]*data-icon="YouTube"/);
  assert.match(yt, /fill="#ff0000"/i);
  const li = renderToStaticMarkup(createElement(PlatformIcon, { slug: 'linkedin' }));
  assert.match(li, /data-lettermark="Li"/);
  assert.match(li, />Li</);
  const csv = renderToStaticMarkup(createElement(PlatformIcon, { slug: 'csv_url' }));
  assert.match(csv, /data-glyph="table"/);
  const white = renderToStaticMarkup(createElement(PlatformIcon, { slug: 'youtube', tone: 'white' }));
  assert.match(white, /fill="#fff"|fill="white"|currentColor/);
});
