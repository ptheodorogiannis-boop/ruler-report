import assert from 'node:assert/strict';
import test from 'node:test';
import { composeReport, normalizeLayout } from '../src/lib/layout/compose';

test('theme: validated by normalizeLayout, carried through composeReport', () => {
  const base = { version: 1, blocks: [] };
  const theme = { accent: '#1a36e6', palette: 'calm', cover: '/api/media/abc123', blocks: { b1: { color: '#d97a1d' } } };
  assert.deepEqual(normalizeLayout({ ...base, theme }).theme, theme);
  assert.equal(normalizeLayout(base).theme, undefined, 'no theme stays undefined');
  assert.equal(normalizeLayout({ ...base, theme: { cover: 'https://cdn.example.com/50%off.png' } }).theme?.cover, 'https://cdn.example.com/50%off.png', 'a percent sign in an https url is fine');
  for (const bad of [{ cover: 'https://' }, { cover: 'https://exa mple.com/x.png' }, { accent: 'red' }, { accent: '#zzz' }, { accent: '#1a36e6; background: url(x)' }, { cover: 'javascript:alert(1)' }, { cover: 'http://insecure/x.png' }, { palette: 'neon' }, { blocks: { b1: { color: 'blue' } } }]) {
    assert.throws(() => normalizeLayout({ ...base, theme: bad }), `rejects ${JSON.stringify(bad)}`);
  }
  const data = { range: { start: '2026-09-01', end: '2026-09-30' }, comparison: null, generated_at: '', sources: [], sections: [] } as any;
  const out = composeReport(data, { version: 1, theme: { accent: '#b8321f', palette: 'mono' }, blocks: [] }, { sources: [], currency: 'EUR', range: data.range, comparison: null });
  assert.deepEqual(out.theme, { accent: '#b8321f', palette: 'mono' });
});

test('theme rendering: CSS variables for the accent, block colours clamped to 3:1 against white, palettes', async () => {
  const { blockColorOf, blockVars, contrastOnWhite, paletteFor, themeVars } = await import('../src/lib/layout/theme');
  assert.deepEqual(themeVars({ accent: '#b8321f' }, '#1a36e6'), { '--brand': '#b8321f', '--brand-soft': '#b8321f1a' });
  assert.deepEqual(themeVars(undefined, '#1a36e6'), { '--brand': '#1a36e6', '--brand-soft': '#1a36e61a' });
  assert.equal(blockColorOf({ blocks: { b: { color: '#0e9f8e' } } }, 'b', '#1877f2'), '#0e9f8e');
  assert.equal(blockColorOf({ blocks: { b: { color: '#0e9f8e' } } }, 'other', '#1877f2'), '#1877f2', 'a block without a colour keeps the platform colour');
  assert.equal(blockColorOf(undefined, 'b', '#1877f2'), '#1877f2', 'a readable colour is left alone');
  assert.equal(blockColorOf(undefined, 'b', '#ffffff'), '#939597', 'white is mixed with 45% ink so badges and highlights stay visible');
  assert.equal(blockColorOf(undefined, 'b', '#fde68a'), '#928857', 'a pale yellow (1.3:1 on white) is clamped too');
  assert.ok(contrastOnWhite('#928857') >= 3 && contrastOnWhite('#939597') >= 3, 'clamped colours reach 3:1');
  assert.deepEqual(blockVars(undefined, 'b', '#1877f2'), { '--block': '#1877f2' });
  assert.equal(paletteFor('brand', '#b8321f')[0], '#b8321f');
  assert.equal(paletteFor(undefined, '#b8321f')[0], '#b8321f');
  assert.equal(paletteFor('mono', '#b8321f').length, 8);
  assert.notEqual(paletteFor('vivid', '#b8321f')[0], '#b8321f');
});
