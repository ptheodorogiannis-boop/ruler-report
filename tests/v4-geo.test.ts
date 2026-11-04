import assert from 'node:assert/strict';
import test from 'node:test';
import { countryName, numericOf, toCountryCode } from '../src/lib/geo/countries';

test('countries: GA4 names, alpha-2, alpha-3 and aliases resolve; unknown labels do not', () => {
  assert.equal(toCountryCode('Greece'), 'GR');
  assert.equal(toCountryCode('gr'), 'GR');
  assert.equal(toCountryCode('GRC'), 'GR', 'Search Console sends alpha-3');
  assert.equal(toCountryCode('grc'), 'GR');
  assert.equal(toCountryCode('United States'), 'US');
  assert.equal(toCountryCode('Türkiye'), 'TR');
  assert.equal(toCountryCode('Turkey'), 'TR');
  assert.equal(toCountryCode('Czechia'), 'CZ');
  assert.equal(toCountryCode('United Kingdom'), 'GB');
  assert.equal(toCountryCode('  Cyprus '), 'CY');
  for (const bad of ['(not set)', 'Other', '', 'Atlantis']) assert.equal(toCountryCode(bad), null, bad);
  assert.equal(numericOf('GR'), '300');
  assert.equal(numericOf('CY'), '196');
  assert.equal(numericOf('XX'), null);
  assert.equal(countryName('GR', 'el'), 'Ελλάδα');
  assert.equal(countryName('GR', 'en'), 'Greece');
});

test('world map: one path per country, under 120 KB, Greece and Cyprus present', async () => {
  const { readFileSync } = await import('node:fs');
  const raw = readFileSync(new URL('../public/geo/world-110m.json', import.meta.url));
  assert.ok(raw.length <= 120 * 1024, `${raw.length} bytes`);
  const map = JSON.parse(raw.toString('utf8')) as { width: number; height: number; countries: { id: string; d: string; box: number[] }[] };
  assert.equal(map.width, 1000);
  assert.equal(map.height, 500);
  assert.ok(map.countries.length >= 170, `${map.countries.length} countries`);
  for (const id of ['300', '196']) {
    const c = map.countries.find((x) => x.id === id);
    assert.ok(c && c.d.startsWith('M'), id);
    assert.ok(c!.box[2] > c!.box[0] && c!.box[3] > c!.box[1], `${id} has a box`);
  }
  assert.ok(!map.countries.some((c) => c.id === '010'), 'no Antarctica');
});
