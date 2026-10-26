// Where the app runs changes a few defaults. On Vercel (VERCEL=1) functions have no lasting disk and no long-running
// process, so uploads live in the database, the in-process scheduler is off (a Vercel cron calls /api/cron/tick) and the
// Chromium PDF export is off. Each default can be overridden with its own variable. See docs/DEPLOY-VERCEL.md.
type Env = Record<string, string | undefined>;

const onVercel = (env: Env) => !!env.VERCEL;

/** Where uploaded images are kept: MEDIA_STORE=db|disk, default db on Vercel and disk elsewhere. */
export function mediaStore(env: Env = process.env): 'db' | 'disk' {
  if (env.MEDIA_STORE === 'db' || env.MEDIA_STORE === 'disk') return env.MEDIA_STORE;
  return onVercel(env) ? 'db' : 'disk';
}

/** The in-process scheduler: ENABLE_SCHEDULER=0|1, default on except on Vercel. */
export function schedulerEnabled(env: Env = process.env): boolean {
  if (env.ENABLE_SCHEDULER !== undefined && env.ENABLE_SCHEDULER !== '') return env.ENABLE_SCHEDULER !== '0';
  return !onVercel(env);
}

/** Whether the PDF export may look for Chromium at all: PDF_ENABLED=off|auto, default auto except on Vercel. */
export function pdfAllowed(env: Env = process.env): boolean {
  if (env.PDF_ENABLED === 'off') return false;
  if (env.PDF_ENABLED) return true;
  return !onVercel(env);
}

/**
 * A `contains` filter that ignores case on both databases. SQLite's LIKE already ignores ASCII case; Postgres needs
 * `mode: 'insensitive'`, which the SQLite client rejects, so it is added only for a Postgres URL.
 */
export function containsText(q: string, url: string = process.env.DATABASE_URL ?? ''): { contains: string } {
  return /^postgres(ql)?:\/\//i.test(url) ? ({ contains: q, mode: 'insensitive' } as { contains: string }) : { contains: q };
}
