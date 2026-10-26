import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('ClientMark: monogram with the first grapheme (Greek too) in the brand colour, logo image when set, size variable', async () => {
  const { ClientMark } = await import('../src/components/client-mark');
  const mono = renderToStaticMarkup(createElement(ClientMark, { name: 'Όμιλος Υγείας', color: '#b8321f' }));
  assert.match(mono, /class="cmark cmark-mono"/);
  assert.match(mono, />Ό</, 'first letter, upper-cased');
  assert.match(mono, /--cm:32px/);
  assert.match(mono, /--brand:#b8321f/);
  const lower = renderToStaticMarkup(createElement(ClientMark, { name: 'acme running' }));
  assert.match(lower, />A</);
  const logo = renderToStaticMarkup(createElement(ClientMark, { name: 'Acme', logo: '/api/media/x', size: 48 }));
  assert.match(logo, /<img[^>]*src="\/api\/media\/x"/);
  assert.match(logo, /alt="Acme"/);
  assert.match(logo, /--cm:48px/);
  assert.doesNotMatch(logo, /cmark-mono/);
});
