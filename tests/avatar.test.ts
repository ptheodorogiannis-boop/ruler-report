import assert from 'node:assert/strict';
import test from 'node:test';
import { AVATAR_COLORS, avatarFor, avatarTraits, hashSeed, normalizeSeed } from '../src/lib/avatar';
import { caliper } from '../src/components/widgets';

test('avatars: deterministic, valid against the avatar-lab schema, and varied across seeds', async () => {
  const { validateAvatarDefinition } = await import('@bible-strong/avatar-core'); // ESM-only package, the test runner is CJS
  const seeds = ['admin@demo.local', 'editor@demo.local', 'ptheodorogiannis@ruler.agency', 'maria@example.com', 'ruler-reports', 'nikos@agency.gr', 'eleni@agency.gr', 'a@b.co', 'client@olive.clinic', 'x@y.z'];
  const seen = new Set<string>();
  const colors = new Set<string>();
  const shapes = new Set<string>();
  for (const s of seeds) {
    const a = avatarFor(s);
    const b = avatarFor(s.toUpperCase() + '  ');
    assert.deepEqual(a, b, 'case and whitespace do not change the face');
    const v = validateAvatarDefinition(a);
    assert.ok(v.ok, `${s}: ${!v.ok ? JSON.stringify(v.errors.slice(0, 2)) : ''}`);
    assert.ok(AVATAR_COLORS.includes(a.colors.body));
    assert.equal(a.colors.eyes, '#101418');
    assert.ok(a.expressions['eyes-closed'] && a.animations.idle && a.animations.happy && a.animations.thinking, 'the base character keeps the expressions the login needs');
    seen.add(JSON.stringify(a.body.primary) + a.colors.body);
    colors.add(a.colors.body);
    shapes.add(a.body.primary.type);
  }
  assert.ok(seen.size >= 8, `faces differ across seeds (${seen.size}/10 distinct)`);
  assert.ok(colors.size >= 4, `colours vary (${colors.size})`);
  assert.ok(shapes.size >= 3, `shapes vary (${shapes.size})`);
  assert.equal(normalizeSeed('  '), 'ruler-reports');
  assert.equal(hashSeed('a'), hashSeed('a'));
  assert.notEqual(hashSeed('a'), hashSeed('b'));
  const t = avatarTraits('admin@demo.local');
  assert.ok(t.wscale >= 0.9 && t.wscale <= 1.12);
});

test('caliper: previous and current share one scale, tone follows the metric meaning, impossible pairs are skipped', () => {
  const c = caliper(120, 100, 'positive_good')!;
  assert.ok(c.cur > c.prev && c.cur <= 1 && c.prev > 0);
  assert.equal(c.tone, 'caliper-up');
  assert.equal(c.cur, Math.round((120 / (120 * 1.12)) * 1000) / 1000);
  assert.equal(caliper(80, 100, 'positive_good')!.tone, 'caliper-down');
  assert.equal(caliper(80, 100, 'positive_bad')!.tone, 'caliper-up', 'a drop in a cost metric is good');
  assert.equal(caliper(100, 100, 'positive_good')!.tone, 'caliper-flat');
  assert.equal(caliper(50, 10, 'neutral')!.tone, 'caliper-flat');
  assert.equal(caliper(null, 10, 'positive_good'), null);
  assert.equal(caliper(10, null, 'positive_good'), null);
  assert.equal(caliper(-5, 10, 'positive_good'), null, 'negative values do not share the scale');
  assert.equal(caliper(0, 0, 'positive_good'), null);
});
