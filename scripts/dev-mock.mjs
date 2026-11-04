// Local click-through of "Connect with Google / Meta" with no real accounts: starts the mock providers
// (scripts/mock-providers.mjs) and a dev server wired to them. It keeps away from the normal dev setup:
// its own port (3106), its own build folder (.next-mock) and its own database copy (prisma/mock.db, copied from
// dev.db the first time, or again with --fresh). Never use these env values anywhere real.
//
//   node scripts/dev-mock.mjs [port] [--fresh]          then sign in at http://localhost:3106
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMockProviders } from './mock-providers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const port = args.find((a) => /^\d+$/.test(a)) ?? '3106';
const mockPort = 3198;
const db = path.join(root, 'prisma', 'mock.db');
if (args.includes('--fresh') || !existsSync(db)) copyFileSync(path.join(root, 'prisma', 'dev.db'), db);

const { server } = createMockProviders({ gbpQuota: process.env.MOCK_GBP_QUOTA === '1' });
server.listen(mockPort, '127.0.0.1', () => console.log(`mock Google + Meta on http://127.0.0.1:${mockPort}`));

const env = {
  ...process.env,
  NODE_ENV: 'development',
  OAUTH_MOCK_BASE: `http://127.0.0.1:${mockPort}`,
  GOOGLE_CLIENT_ID: 'mock-client',
  GOOGLE_CLIENT_SECRET: 'mock-secret',
  GOOGLE_ADS_DEVELOPER_TOKEN: 'mock-dev-token',
  META_APP_ID: 'mock-app',
  META_APP_SECRET: 'mock-secret',
  NEXT_DIST_DIR: '.next-mock',
  DATABASE_URL: 'file:./mock.db',
  APP_URL: `http://localhost:${port}`,
  ENABLE_SCHEDULER: '0',
  // AI calls (client Ask, analysis) go to the mock too; a key is needed for the app to offer them
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${mockPort}`,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || 'mock-key',
};
const child = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', root, '-p', port], { env, stdio: 'inherit', cwd: root });
const stop = () => {
  child.kill();
  server.close();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code) => {
  server.close();
  process.exit(code ?? 0);
});
