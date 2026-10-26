import { NextRequest } from 'next/server';
import { getPrincipal } from '@/lib/auth';
import { handleCallback } from '@/lib/oauth/flow';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handleCallback(req, await getPrincipal(), 'meta');
}
