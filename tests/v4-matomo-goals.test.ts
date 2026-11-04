// Matomo goals in the catalog (docs/superpowers/specs/2026-11-04-ads-previews-sources-matomo-design.md §3): one set of metrics
// per goal, named from Matomo or the agency's rename, in a Goals group after Conversion; a goal that is gone says so.
import assert from 'node:assert/strict';
import test from 'node:test';

const config = { goals: [{ id: '1', name: 'Lead form' }, { id: '3', name: 'ClickToPhone' }], goalNames: { '3': 'Click to phone' } };

test('goalName: the rename, else Matomo name, else Goal <id>', async () => {
  const { goalName } = await import('../src/lib/catalog/matomo-goals');
  assert.equal(goalName(config, '3'), 'Click to phone');
  assert.equal(goalName(config, '1'), 'Lead form');
  assert.equal(goalName(config, '7'), 'Goal 7');
  assert.equal(goalName({ ...config, goalNames: { '1': '   ' } }, '1'), 'Lead form', 'a blank rename is no rename');
});

test('every goal is its own conversions, conversions per day, conversion rate and revenue, titled with its name', async () => {
  const { getCatalog } = await import('../src/lib/catalog/build');
  const cat = getCatalog('matomo', config);
  const by = Object.fromEntries(cat.map((w) => [w.key, w]));
  assert.equal(by.goal_1_conversions.title, 'Lead form – conversions');
  assert.equal(by.goal_3_conversions.title, 'Click to phone – conversions');
  assert.equal(by.goal_3_conversions_by_date.component, 'chart_v1');
  assert.deepEqual(by.goal_3_conversion_rate.calc, { kind: 'ratio', num: 'goal_3_conversions', den: 'sessions', mult: 100 });
  assert.equal(by.goal_3_conversion_rate.format, 'percent');
  assert.equal(by.goal_1_revenue.format, 'currency');
  assert.equal(by.goal_1_conversions.group, 'Goals');
  assert.equal(by.conversions_by_goal.component, 'datatable_v1');
  assert.deepEqual((by.conversions_by_goal.calc as any).columns, ['conversions', 'revenue', 'goal_conversion_rate']);
  // the archetype's own widgets are still there
  assert.ok(by.sessions && by.top_page_titles);
});

test('the Goals group comes right after Conversion in the picker', async () => {
  const { getCatalog } = await import('../src/lib/catalog/build');
  const { pickableMetrics } = await import('../src/lib/catalog/pickable');
  const { groupId } = await import('../src/lib/catalog/groups');
  const seq = [...new Set(pickableMetrics('matomo', getCatalog('matomo', config)).map((w) => groupId(w.group ?? 'Other')))];
  assert.equal(seq[seq.indexOf('conversion') + 1], 'goals');
});

test('the catalog follows the goals and their names (no stale cache)', async () => {
  const { getCatalog } = await import('../src/lib/catalog/build');
  assert.equal(getCatalog('matomo', config).find((w) => w.key === 'goal_3_conversions')!.title, 'Click to phone – conversions');
  const renamed = { ...config, goalNames: { '3': 'Phone calls' } };
  assert.equal(getCatalog('matomo', renamed).find((w) => w.key === 'goal_3_conversions')!.title, 'Phone calls – conversions');
  const none = getCatalog('matomo', { goals: [] });
  assert.equal(none.some((w) => w.key.startsWith('goal_') || w.key === 'conversions_by_goal'), false);
  assert.equal(getCatalog('google_analytics_4', config).some((w) => w.key.startsWith('goal_')), false, 'GA4 has no Matomo goals');
});

test('a goal deleted in Matomo says so instead of "unknown metric"', async () => {
  const { missingMetricMessage } = await import('../src/lib/catalog/matomo-goals');
  assert.equal(missingMetricMessage('matomo', 'goal_9_conversions', 'Matomo'), 'This goal no longer exists in Matomo.');
  assert.equal(missingMetricMessage('matomo', 'nope', 'Matomo'), 'Unknown metric "nope" for Matomo.');
  assert.equal(missingMetricMessage('google_analytics_4', 'goal_9_conversions', 'Google Analytics 4'), 'Unknown metric "goal_9_conversions" for Google Analytics 4.');
});
