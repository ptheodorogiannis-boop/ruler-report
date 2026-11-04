import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import '../src/lib/i18n';

// Fixes from the final review of the editor and report management work
// (docs/superpowers/specs/2026-11-04-editor-report-management-design.md).

test('the app pages ship the strings of the Ask box and the metric picker (no raw keys)', async () => {
  const { APP_NAMESPACES } = await import('../src/lib/i18n/namespaces');
  const { dictFor } = await import('../src/lib/i18n');
  const { I18nProvider } = await import('../src/components/i18n-provider');
  const { AskBox } = await import('../src/components/ask-box');
  for (const locale of ['en', 'el'] as const) {
    const dict = dictFor(locale, APP_NAMESPACES);
    const html = renderToStaticMarkup(createElement(I18nProvider, { locale, dict, children: createElement(AskBox, { reportId: 1, suggestions: [] }) }));
    assert.doesNotMatch(html, /askbox\./, `${locale}: ${html.slice(0, 200)}`);
    assert.ok(dict['catalog.group.delivery'], `${locale}: picker group names`);
  }
});
