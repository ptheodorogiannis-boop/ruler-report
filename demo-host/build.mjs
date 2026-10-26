// Build the Claude-hosted demo into demo-host/build/: the browser bundle (app.js), the captured screens, styles, fonts,
// images, PDFs and seed, and the page itself (index.html, without doctype/html/head/body: the Artifact adds those).
// Usage (repository root): node demo-host/build.mjs [--inline]
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { demoAliasPlugin, repoRoot } from './aliases.mjs';

const OUT = path.join(repoRoot, 'demo-host', 'build');
const CAPTURE = path.join(repoRoot, 'demo-host', 'capture-out');
const INLINE = process.argv.includes('--inline');
const MAX_FILES = 255;
const MAX_FILE = 16 * 1024 * 1024;

export async function bundle({ write = true } = {}) {
  return build({
    entryPoints: [path.join(repoRoot, 'demo-host/src/main.tsx')],
    outfile: path.join(OUT, 'app.js'),
    bundle: true,
    write,
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    minify: true,
    jsx: 'automatic',
    legalComments: 'none',
    metafile: true,
    logLevel: 'warning',
    define: { 'process.env.NODE_ENV': '"production"' },
    inject: [path.join(repoRoot, 'demo-host/src/shims/process.ts')],
    tsconfig: path.join(repoRoot, 'demo-host/tsconfig.json'),
    plugins: [demoAliasPlugin({ browser: true })],
  });
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name);
    const b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name)).split(path.sep).join('/')]));
}

export const PAGE = ({ css, js }) => `<title>Ruler Reports Demo</title>
<meta name="description" content="Interactive demo of Ruler Reports: client reporting for agencies, with sample data.">
${css ? `<style>${css}</style>` : '<link rel="stylesheet" href="app.css">'}
<style>
:root{color-scheme:light}
body{background:#f6f7f9;color:#141821}
.demo-boot{min-height:60vh;display:flex;align-items:center;justify-content:center;font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:#5a6172}
</style>
<div id="demo-root"><div class="demo-boot" role="status"><span lang="en">Loading the Ruler Reports demo…</span>&nbsp;·&nbsp;<span lang="el">Φόρτωση του demo…</span></div></div>
${js ? `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>` : '<script src="app.js" defer></script>'}
`;

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const r = await bundle();
  for (const d of ['views', 'pdf', 'fonts', 'assets', 'images']) copyDir(path.join(CAPTURE, d), path.join(OUT, d));
  fs.copyFileSync(path.join(CAPTURE, 'app.css'), path.join(OUT, 'app.css'));
  fs.copyFileSync(path.join(CAPTURE, 'seed.json'), path.join(OUT, 'seed.json'));
  if (INLINE) {
    const css = fs.readFileSync(path.join(OUT, 'app.css'), 'utf8');
    const js = fs.readFileSync(path.join(OUT, 'app.js'), 'utf8');
    fs.writeFileSync(path.join(OUT, 'index.html'), PAGE({ css, js }));
    fs.rmSync(path.join(OUT, 'app.js'));
    fs.rmSync(path.join(OUT, 'app.css'));
  } else fs.writeFileSync(path.join(OUT, 'index.html'), PAGE({}));

  const files = listFiles(OUT);
  const sizes = files.map((f) => [f, fs.statSync(path.join(OUT, f)).size]);
  const total = sizes.reduce((n, [, s]) => n + s, 0);
  const tooBig = sizes.filter(([, s]) => s > MAX_FILE);
  const js = Object.entries(r.metafile.outputs).find(([k]) => k.endsWith('app.js'))?.[1]?.bytes ?? 0;
  console.log(`build: ${files.length} files, ${(total / 1e6).toFixed(1)} MB in total, app.js ${(js / 1e6).toFixed(2)} MB${INLINE ? ' (inlined)' : ''}`);
  if (files.length > MAX_FILES) throw new Error(`${files.length} files: over the ${MAX_FILES}-file publish limit`);
  if (tooBig.length) throw new Error(`over 16 MB: ${tooBig.map(([f]) => f).join(', ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  main().catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  });
}
