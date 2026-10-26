import assert from 'node:assert/strict';
import test from 'node:test';
import { INTEGRATIONS } from '../src/lib/catalog/integrations';

test('platform icons: every integration resolves to a brand mark or a declared fallback glyph', async () => {
  const { fallbackGlyph, platformIcon } = await import('../src/lib/catalog/platform-icons');
  for (const def of INTEGRATIONS) {
    const icon = platformIcon(def.slug);
    const glyph = fallbackGlyph(def.category);
    assert.ok(icon || glyph, `${def.slug} has neither an icon nor a fallback`);
    if (icon) {
      assert.match(icon.path, /^[Mm]/, `${def.slug}: an SVG path`);
      assert.match(icon.hex, /^[0-9A-Fa-f]{6}$/, `${def.slug}: hex colour`);
    }
  }
  assert.equal(platformIcon('instagram_business')!.title, 'Instagram');
  assert.equal(platformIcon('facebook_ads')!.title, 'Meta');
  assert.equal(platformIcon('google_analytics_4')!.title, 'Google Analytics');
  assert.equal(platformIcon('csv'), null, 'a CSV upload has no brand');
  assert.equal(fallbackGlyph('custom'), 'table');
  assert.equal(fallbackGlyph('calls'), 'phone');
});
