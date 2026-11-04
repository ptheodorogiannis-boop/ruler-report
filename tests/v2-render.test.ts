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

test('PillNav, SideRail and TabBar: the active place carries aria-current; rail buttons are named; More holds the rest', async () => {
  const { PillNav, SideRail, TabBar } = await import('../src/components/top-nav');
  const items = [
    { href: '/dashboards', label: 'Dashboards', icon: 'dashboards' as const },
    { href: '/reports', label: 'Reports', icon: 'reports' as const },
  ];
  const pill = renderToStaticMarkup(createElement(PillNav, { items, active: '/reports', label: 'Main' }));
  assert.match(pill, /aria-current="page"[^>]*>Reports</);
  assert.match(pill, /pillnav-item is-active/);
  const rail = renderToStaticMarkup(createElement(SideRail, { items: [{ href: '/templates', label: 'Templates', icon: 'templates' as const }], settings: { href: '/settings', label: 'Settings', icon: 'settings' as const }, active: '/settings', label: 'Tools' }));
  assert.match(rail, /aria-label="Templates"/);
  assert.match(rail, /data-tip="Settings"/);
  assert.match(rail, /aria-current="page"/);
  assert.equal(renderToStaticMarkup(createElement(SideRail, { items: [], label: 'Tools' })), '', 'no rail without places');
  const six = Array.from({ length: 6 }, (_, i) => ({ href: '/p' + i, label: 'P' + i, icon: 'overview' as const }));
  const bar = renderToStaticMarkup(createElement(TabBar, { daily: six, more: [{ href: '/x', label: 'X', icon: 'api' as const }], active: '/x', labels: { nav: 'Main', more: 'More' } }));
  assert.equal((bar.match(/class="tabbar-item/g) || []).length, 5, 'four places and More');
  assert.match(bar, /tabbar-item is-active[^>]*>.*More/s, 'More lights up while it holds the active place');
});

test('PlatformIcon: ink by default (it takes the colour around it), the platform colour on request, lettermark and glyph fallbacks', async () => {
  const { PlatformIcon } = await import('../src/components/platform-icon');
  const yt = renderToStaticMarkup(createElement(PlatformIcon, { slug: 'youtube' }));
  assert.match(yt, /<svg[^>]*data-icon="YouTube"/);
  assert.match(yt, /fill="currentColor"/);
  assert.match(renderToStaticMarkup(createElement(PlatformIcon, { slug: 'youtube', tone: 'brand' })), /fill="#ff0000"/i);
  const li = renderToStaticMarkup(createElement(PlatformIcon, { slug: 'linkedin' }));
  assert.match(li, /data-lettermark="Li"/);
  assert.match(li, />Li</);
  const csv = renderToStaticMarkup(createElement(PlatformIcon, { slug: 'csv_url' }));
  assert.match(csv, /data-glyph="table"/);
  const white = renderToStaticMarkup(createElement(PlatformIcon, { slug: 'youtube', tone: 'white' }));
  assert.match(white, /fill="#fff"|fill="white"|currentColor/);
});
