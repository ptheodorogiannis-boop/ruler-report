// Keeps the two dictionaries honest (spec v3 §5): same key set, same {placeholders}, and every `t('ns.key')` literal in
// src/ exists in en.json. Exit 1 on any problem. Run: `npm run i18n:check` (also before the test suite).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(readFileSync(path.join(root, 'src/lib/i18n', f), 'utf8'));
const en = read('en.json');
const el = read('el.json');
let bad = 0;
const fail = (msg) => {
  console.error(`i18n: ${msg}`);
  bad++;
};

for (const k of Object.keys(en)) if (!(k in el)) fail(`el.json is missing "${k}"`);
for (const k of Object.keys(el)) if (!(k in en)) fail(`en.json has no "${k}" (el.json has it)`);
const vars = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
for (const k of Object.keys(en)) {
  if (!(k in el)) continue;
  if (vars(en[k]) !== vars(el[k])) fail(`placeholders differ for "${k}": en {${vars(en[k])}} vs el {${vars(el[k])}}`);
  for (const [loc, s] of [['en', en[k]], ['el', el[k]]]) if ((String(s).match(/\{/g) || []).length !== (String(s).match(/\}/g) || []).length) fail(`${loc}.json: unbalanced braces in "${k}"`);
  if (!/^[a-z][\w-]*\.[\w.-]+$/.test(k)) fail(`key "${k}" is not namespaced as area.item`);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx?|mjs|js)$/.test(name)) out.push(p);
  }
  return out;
}
// t('ns.key'), t(locale, 'ns.key'), tt('ns.key') — any identifier ending in t followed by a namespaced literal
const re = /\b[a-zA-Z_]*t\(\s*(?:[\w.?]+\s*,\s*)?(['"])([a-z][\w-]*\.[\w.-]+)\1/g;
for (const file of walk(path.join(root, 'src'))) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(re)) {
    const key = m[2];
    if (!(key in en)) fail(`${path.relative(root, file)}: unknown key "${key}"`);
  }
}

if (bad) {
  console.error(`i18n: ${bad} problem${bad === 1 ? '' : 's'}`);
  process.exit(1);
}
console.log(`i18n: ${Object.keys(en).length} keys, en and el aligned`);
