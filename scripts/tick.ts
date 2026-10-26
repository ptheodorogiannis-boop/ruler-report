// Run due automations + evaluate goals once. Use from OS cron when ENABLE_SCHEDULER=0.
import { db } from '../src/lib/db';
import { evaluateGoals } from '../src/lib/services/goals';
import { tick } from '../src/lib/services/automations';
import { checkAll } from '../src/lib/services/health';

(async () => {
  const automations = await tick();
  const goals = await evaluateGoals();
  const health = await checkAll();
  console.log(JSON.stringify({ automations, goals, health }, null, 2));
  await db.$disconnect();
})();
