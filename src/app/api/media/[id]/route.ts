import type { NextRequest } from 'next/server';
import { getPrincipal, tokenPrincipal } from '@/lib/auth';
import { deleteHandler, getHandler } from '@/lib/media/handlers';

export const dynamic = 'force-dynamic';

const principal = (req: NextRequest) => (req.headers.get('authorization') ? tokenPrincipal(req.headers.get('authorization')) : getPrincipal());

/** GET /api/media/[id] — public by unguessable id (client links show images without a session). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return getHandler(id);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return deleteHandler(await principal(req), id);
}
