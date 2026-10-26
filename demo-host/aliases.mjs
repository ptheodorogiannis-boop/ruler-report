// Bundler substitutions shared by the browser build and the node test bundles: the app's own modules are bundled as they
// are, and the few that need a server (database, server actions, Next runtime, node modules) resolve to demo-host shims.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '..');
const demo = (p) => path.join(here, p);
const app = (p) => path.join(repoRoot, p);

/** Bare specifiers (or `@/` paths) → a demo-host file. */
export const aliases = {
  '@/lib/db': demo('src/shims/db.ts'),
  '@prisma/client': demo('src/shims/prisma-client.ts'),
  '@/lib/crypto': demo('src/shims/crypto.ts'),
  '@/lib/connectors': demo('src/shims/connectors.ts'),
  '@/lib/media/url': demo('src/shims/media-url.ts'),
  'next/navigation': demo('src/shims/next-navigation.ts'),
  'next/link': demo('src/shims/next-link.tsx'),
  'next/dynamic': demo('src/shims/next-dynamic.tsx'),
  'next/dist/shared/lib/app-router-context.shared-runtime': demo('src/shims/app-router-context.ts'),
  '@/app/actions/app': demo('src/server/actions.ts'),
  '@/app/actions/editor': demo('src/server/actions.ts'),
  '@/app/actions/auth': demo('src/server/actions.ts'),
  '@/app/actions/public': demo('src/server/actions.ts'),
};

/** App files replaced wherever they are imported from (relative imports included). */
export const replacedFiles = {
  [app('src/lib/services/webhooks.ts')]: demo('src/shims/webhooks.ts'),
  [app('src/lib/connectors/index.ts')]: demo('src/shims/connectors.ts'),
};

/** Browser-only substitutions (node test bundles keep the real node modules). */
export const browserAliases = {
  'node:crypto': demo('src/shims/node-crypto.ts'),
  crypto: demo('src/shims/node-crypto.ts'),
  // the login avatar's schema check compiles code with new Function (forbidden on Claude pages)
  ajv: demo('src/shims/ajv.ts'),
  'ajv/dist/2020.js': demo('src/shims/ajv.ts'),
  'ajv/dist/2020': demo('src/shims/ajv.ts'),
};

const EXTS = ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx'];
function resolveFile(base) {
  for (const e of EXTS) {
    const p = base + e;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}
const norm = (p) => path.normalize(p).toLowerCase();
const replacedNorm = new Map(Object.entries(replacedFiles).map(([k, v]) => [norm(k), v]));

/** esbuild plugin. `browser`: add the browser-only aliases; `externalPackages`: leave other bare imports to node. */
export function demoAliasPlugin({ browser = false, externalPackages = false } = {}) {
  const map = { ...aliases, ...(browser ? browserAliases : {}) };
  return {
    name: 'demo-aliases',
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === 'entry-point') return undefined;
        if (map[args.path]) return { path: map[args.path] };
        let target = null;
        if (args.path.startsWith('@/')) target = resolveFile(app('src/' + args.path.slice(2)));
        else if (args.path.startsWith('.')) target = resolveFile(path.resolve(args.resolveDir, args.path));
        if (target) {
          const swap = replacedNorm.get(norm(target));
          return { path: swap ?? target };
        }
        if (externalPackages && !args.path.startsWith('.') && !path.isAbsolute(args.path)) return { path: args.path, external: true };
        return undefined;
      });
    },
  };
}
