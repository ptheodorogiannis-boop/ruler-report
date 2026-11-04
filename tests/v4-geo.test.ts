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
