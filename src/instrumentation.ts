export async function register() {
  // off on Vercel unless ENABLE_SCHEDULER=1: there a Vercel cron calls /api/cron/tick (vercel.json)
  const { schedulerEnabled } = await import('./lib/platform');
  if (process.env.NEXT_RUNTIME === 'nodejs' && schedulerEnabled()) {
    const { startScheduler } = await import('./lib/scheduler');
    startScheduler();
  }
}
