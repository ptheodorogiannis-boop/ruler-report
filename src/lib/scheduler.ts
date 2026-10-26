// In-process scheduler: automations every minute, goal evaluation hourly.
// For multi-instance deployments set ENABLE_SCHEDULER=0 and call GET /api/cron/tick from one cron.
import { evaluateGoals } from '@/lib/services/goals';
import { tick } from '@/lib/services/automations';

const g = globalThis as unknown as { __rrScheduler?: NodeJS.Timeout; __rrMinutes?: number; __rrBusy?: boolean };

export function startScheduler() {
  if (g.__rrScheduler) return;
  g.__rrMinutes = 0;
  g.__rrScheduler = setInterval(async () => {
    if (g.__rrBusy) return;
    g.__rrBusy = true;
    try {
      const done = await tick();
      if (done.length) console.log('[scheduler] automations:', JSON.stringify(done));
      g.__rrMinutes = (g.__rrMinutes ?? 0) + 1;
      if (g.__rrMinutes % 60 === 0) {
        const goals = await evaluateGoals();
        const fired = goals.filter((x) => x.event);
        if (fired.length) console.log('[scheduler] goals:', JSON.stringify(fired));
      }
    } catch (e) {
      console.error('[scheduler]', e);
    } finally {
      g.__rrBusy = false;
    }
  }, 60_000);
  g.__rrScheduler.unref?.();
  console.log('[scheduler] started');
}
