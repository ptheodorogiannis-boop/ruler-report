import assert from 'node:assert/strict';
import test from 'node:test';

test('parseTyped: pasted spreadsheet text becomes labels and series, respecting the project decimal format; blanks are null', async () => {
  const { parseTyped } = await import('../src/lib/layout/typed-data');
  const eu = parseTyped('Label\tA\nx\t1.234,5\ny\t\n', 'dot_comma');
  assert.deepEqual(eu, { labels: ['x', 'y'], series: [{ label: 'A', values: [1234.5, null] }] });
  const us = parseTyped('Month,Sales,Leads\nJan,"1,234.5",10\nFeb,980,12', 'comma_dot');
  assert.deepEqual(us, { labels: ['Jan', 'Feb'], series: [{ label: 'Sales', values: [1234.5, 980] }, { label: 'Leads', values: [10, 12] }] });
  const semi = parseTyped('Mes;Vendas\nJan;1.234,5\nFev;2.000', 'dot_comma');
  assert.deepEqual(semi.series[0].values, [1234.5, 2000]);
  assert.deepEqual(parseTyped('', 'comma_dot'), { labels: [], series: [] });
  assert.deepEqual(parseTyped('only a header\n', 'comma_dot').series, [{ label: 'only a header', values: [] }].slice(0, 0), 'a header without rows gives no series');
});
