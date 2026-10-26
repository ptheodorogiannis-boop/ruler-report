import { NextRequest } from 'next/server';
import { getPrincipal } from '@/lib/auth';
import { startOAuth } from '@/lib/oauth/flow';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return startOAuth(req, await getPrincipal(), 'google');
}
