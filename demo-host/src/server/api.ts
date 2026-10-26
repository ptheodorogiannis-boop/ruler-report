// The app's own /api routes the live components call, answered in the browser. Anything else under /api answers a JSON 404
// ("Not available in the demo"); URLs outside /api return null so the caller passes them on.
import { getCatalog, toDefinition } from '@/lib/catalog/build';
import { getIntegrationDef } from '@/lib/catalog/integrations';
import { db } from '../shims/db';
import { DEMO_IMAGE_MAX_CHARS } from '../shims/media-url';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

async function metrics(url: URL): Promise<Response> {
  const q = url.searchParams;
  const slug = q.get('integration_slug') ?? '';
  if (slug === 'custom') {
    const cms = await db.customMetric.findMany({ where: { companyId: 1 }, orderBy: { createdAt: 'desc' } }).catch(() => []);
    return json({ data: cms.map((m) => ({ id: `cm_${m.id}`, reference_key: `custom:cm_${m.id}`, component: 'number_v1', metrics: [], calculated: true, references: { title: m.name, description: m.formula } })) });
  }
  if (!getIntegrationDef(slug)) return json({ message: 'A valid integration_slug is required.' }, 422);
  let config: unknown = null;
  const iid = Number(q.get('integration_id'));
  if (iid) config = (await db.integration.findFirst({ where: { id: iid } }).catch(() => null))?.config ?? null;
  const all = getCatalog(slug, config as any).map(toDefinition);
  const search = (q.get('search') ?? '').toLowerCase().trim();
  const terms = search ? search.split(/\s+/) : [];
  const filtered = terms.length ? all.filter((w) => terms.every((t) => `${w.reference_key} ${w.references.title}`.toLowerCase().includes(t))) : all;
  const per = Math.min(100, Number(q.get('per_page')) || 100);
  const page = Math.max(1, Number(q.get('page')) || 1);
  return json({ data: filtered.slice((page - 1) * per, page * per), total: filtered.length });
}

let uploads = 0;
async function upload(init?: RequestInit): Promise<Response> {
  const fd = init?.body instanceof FormData ? init.body : null;
  const file = fd?.get('file');
  if (!file || typeof file === 'string') return json({ message: 'Choose an image to upload' }, 400);
  const type = file.type || 'image/png';
  if (!/^image\/(png|jpe?g|webp|gif)$/.test(type)) return json({ message: 'Use a PNG, JPEG, WebP or GIF image' }, 415);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const url = `data:${type};base64,${btoa(bin)}`;
  if (url.length > DEMO_IMAGE_MAX_CHARS) return json({ message: 'In the demo, images must be 1.5 MB or smaller' }, 413);
  uploads += 1;
  const n = (k: string) => (fd?.get(k) ? Number(fd.get(k)) : null);
  return json({ id: `demo${uploads}`, url, width: n('width'), height: n('height') });
}

/** POST /api/v2/reports/<id>/ask — the app's own `ask()` (Claude through the bridge, or its rule-based answer). */
async function askReport(id: number, init?: RequestInit): Promise<Response> {
  const body = JSON.parse(String(init?.body ?? '{}')) as { question?: string };
  const question = String(body.question ?? '').trim();
  if (question.length < 2) return json({ message: 'Ask a question of at least two characters' }, 422);
  const r = await db.report.findFirst({ where: { id, companyId: 1 }, include: { project: true } });
  if (!r) return json({ message: 'Report not found' }, 404);
  const { reportView } = await import('@/lib/layout/service');
  const { ask } = await import('@/lib/ai/insights');
  const { data } = await reportView(r as any);
  const name = String((r as any).project.name);
  try {
    return json(await ask(data, name, question));
  } catch {
    // Claude is unavailable or declined: the app's own keyword answer, which it gives when no AI key is set (review I2)
    const key = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      return json(await ask(data, name, question));
    } finally {
      process.env.ANTHROPIC_API_KEY = key;
    }
  }
}

export async function handleApi(url: URL, init?: RequestInit): Promise<Response | null> {
  if (!url.pathname.startsWith('/api/')) return null;
  const method = (init?.method ?? 'GET').toUpperCase();
  const askMatch = url.pathname.match(/^\/api\/v2\/reports\/(\d+)\/ask$/);
  if (askMatch && method === 'POST') return askReport(Number(askMatch[1]), init);
  if (url.pathname === '/api/v2/metrics' && method === 'GET') return metrics(url);
  if (url.pathname === '/api/media' && method === 'GET') return json({ items: [] });
  if (url.pathname === '/api/media' && method === 'POST') return upload(init);
  return json({ message: 'Not available in the demo' }, 404);
}
