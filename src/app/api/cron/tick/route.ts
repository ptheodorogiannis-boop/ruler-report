import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/crypto';
import { evaluateGoals } from '@/lib/services/goals';
import { tick } from '@/lib/services/automations';
import { checkAll } from '@/lib/services/health';

export const dynamic = 'force-dynamic';
// a Vercel function may run up to 300 s on every plan (Hobby's maximum); a tick runs due automations, goals and health checks
export const maxDuration = 300;

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? req.nextUrl.searchParams.get('secret') ?? '';
  if (!secret || !safeEqual(given, secret)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const automations = await tick();
  const goals = req.nextUrl.searchParams.get('goals') === '0' ? [] : await evaluateGoals();
  const health = req.nextUrl.searchParams.get('health') === '0' ? { checked: 0, alerts: [] } : await checkAll();
  return NextResponse.json({ automations, goals, health });
}
export { run as GET, run as POST };
