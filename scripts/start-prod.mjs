// Starts the production server next to a running dev server: separate build folder (.next-prod, see
// next.config.mjs) and an APP_URL read from .preview-url (the public address the app should put in links).
//   npm run build:prod   →  NEXT_DIST_DIR=.next-prod next build
//   node scripts/start-prod.mjs [port]
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = process.argv[2] || process.env.PORT || '3102';
const urlFile = join(root, '.preview-url');
const appUrl = process.env.APP_URL_OVERRIDE || (existsSync(urlFile) ? readFileSync(urlFile, 'utf8').trim() : '') || `http://localhost:${port}`;

const env = { ...process.env, NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || '.next-prod', APP_URL: appUrl, PORT: port };
console.log(`[start-prod] dist=${env.NEXT_DIST_DIR} port=${port} APP_URL=${appUrl}`);
const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['next', 'start', '-p', port], { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' });
child.on('exit', (code) => process.exit(code ?? 0));
