// Runs the test-suite against a throw-away SQLite database.
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const env = { ...process.env, DATABASE_URL: 'file:./test.db', APP_SECRET: 'test-secret-test-secret-test-secret', APP_URL: 'http://localhost:3100', ENABLE_SCHEDULER: '0', ANTHROPIC_API_KEY: '', TSX_TSCONFIG_PATH: 'tsconfig.test.json' };
for (const f of ['prisma/test.db', 'prisma/test.db-journal']) rmSync(f, { force: true });
rmSync('prisma/test-uploads', { recursive: true, force: true });
const sh = (cmd) => spawnSync(cmd, { stdio: 'inherit', env, shell: true });
let r = sh('node scripts/i18n-check.mjs');
if (r.status) process.exit(r.status);
r = sh('npx prisma db push --skip-generate --accept-data-loss');
if (r.status) process.exit(r.status);
r = sh('node --import tsx --test --test-concurrency=1 tests/*.test.ts');
rmSync('prisma/test.db', { force: true });
rmSync('prisma/test-uploads', { recursive: true, force: true });
process.exit(r.status ?? 1);
