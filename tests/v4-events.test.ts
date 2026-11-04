import assert from 'node:assert/strict';
import test from 'node:test';

test('timeline events on charts: an event marks its own day, or the week or month bucket it falls in; outside the chart it is left out', async () => {
  const { eventLabel } = await import('../src/components/charts');
  const days = ['2026-09-01', '2026-09-02', '2026-09-03'];
  assert.equal(eventLabel(days, '2026-09-02'), '2026-09-02');
  assert.equal(eventLabel(days, '2026-08-31'), null, 'before the chart');
  const weeks = ['2026-08-31', '2026-09-07', '2026-09-14'];
  assert.equal(eventLabel(weeks, '2026-09-10'), '2026-09-07', 'the week that contains it');
  assert.equal(eventLabel(weeks, '2026-09-20'), '2026-09-14', 'the last bucket');
  assert.equal(eventLabel([], '2026-09-10'), null);
});
