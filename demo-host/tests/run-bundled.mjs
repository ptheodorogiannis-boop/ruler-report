// Bundle demo-host test files for node with the demo substitutions, then run them with node's test runner.
// Usage (from the repository root): node demo-host/tests/run-bundled.mjs demo-host/tests/a.test.ts [b.test.ts …]
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { demoAliasPlugin, repoRoot } from '../aliases.mjs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node demo-host/tests/run-bundled.mjs <test files>');
  process.exit(2);
}
const outdir = path.join(repoRoot, 'demo-host', '.test-out');
const outs = [];
for (const f of files) {
  const out = path.join(outdir, path.basename(f).replace(/\.tsx?$/, '.mjs'));
  await build({
    entryPoints: [path.resolve(f)],
    outfile: out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    jsx: 'automatic',
    sourcemap: 'inline',
    logLevel: 'error',
    tsconfig: path.join(repoRoot, 'demo-host', 'tsconfig.json'),
    plugins: [
      // aliases.mjs resolves paths from its own location, so tests import it from where it lives
      { name: 'keep-aliases', setup: (b) => b.onResolve({ filter: /aliases\.mjs$/ }, (a) => ({ path: pathToFileURL(path.resolve(a.resolveDir, a.path)).href, external: true })) },
      demoAliasPlugin({ externalPackages: true }),
    ],
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
  outs.push(out);
}
const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...outs], { stdio: 'inherit', cwd: repoRoot, env: process.env });
process.exit(r.status ?? 1);
