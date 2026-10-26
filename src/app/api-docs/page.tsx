import { AppShell, PageHeader } from '@/components/shell';
import { requirePrincipal } from '@/lib/auth';
import { listRoutes } from '@/lib/api/routes';
import { RATE_LIMITS } from '@/lib/api/http';
import { WEBHOOK_EVENTS } from '@/lib/services/webhooks';

export const dynamic = 'force-dynamic';

const code = 'rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-slate-100 overflow-x-auto';

export default async function ApiDocs() {
  await requirePrincipal();
  const routes = listRoutes();
  const base = process.env.APP_URL || 'http://localhost:3100';
  return (
    <AppShell active="/api-docs">
      <PageHeader title="API, webhooks & MCP" subtitle="REST API v2 is endpoint-compatible with Reportei’s v2, plus extensions for automations, goals, blended metrics and pushed data." />
      <div className="space-y-6">
        <section className="card space-y-3 p-5">
          <h2 className="font-bold">Authentication</h2>
          <p className="text-sm text-slate-600">
            Create a token in Settings → API tokens, then send it as a bearer token. Base URL: <code>{base}/api/v2</code>
          </p>
          <pre className={code}>{`curl ${base}/api/v2/projects \\\n  -H "Authorization: Bearer rr_xxxxxxxx"`}</pre>
          <p className="text-sm text-slate-600">
            Lists use <code>page</code>, <code>per_page</code> (max 100), <code>sortBy</code>, <code>descending</code> and return <code>{'{ data, links, meta }'}</code>. Errors return <code>{'{ message, errors }'}</code> with 401/403/404/422/429/500.
          </p>
          <p className="text-sm text-slate-600">
            Rate limits (same as Reportei): {RATE_LIMITS.per_minute}/min and {RATE_LIMITS.per_second}/s per token; <code>POST /metrics/get-data</code> 100 per 60 s; report/dashboard creation 30 per 24 h or 2 per project via token. Headers <code>X-RateLimit-Limit</code>, <code>X-RateLimit-Remaining</code>, <code>Retry-After</code> on 429.
          </p>
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="font-bold">Fetch metric values</h2>
          <pre className={code}>{`# 1. discover widgets for an integration type
curl "${base}/api/v2/metrics?integration_slug=facebook_ads&search=spend" -H "Authorization: Bearer $TOKEN"

# 2. fetch values — pass the metric objects exactly as returned (id + reference_key are what matters here)
curl -X POST ${base}/api/v2/metrics/get-data -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" -d '{
  "integration_id": 12, "start": "2026-09-01", "end": "2026-09-30",
  "comparison_start": "2026-08-01", "comparison_end": "2026-08-31",
  "metrics": [{ "reference_key": "fb_ads:spend" }, { "reference_key": "fb_ads:campaigns" }]
}'`}</pre>
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="font-bold">Push API (Make · Zapier · n8n · call trackers · CRMs)</h2>
          <p className="text-sm text-slate-600">
            Create a “Push API” integration on a project, then post rows. Numeric fields become metrics, text fields become breakdowns; the widget catalog updates automatically.
          </p>
          <pre className={code}>{`curl -X POST ${base}/api/v2/ingest/<integration_id> -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" -d '{
  "rows": [
    { "date": "2026-10-01", "source": "Webinar", "leads": 4, "cost": 120 },
    { "date": "2026-10-01", "source": "Referral", "leads": 2, "cost": 0 }
  ]
}'`}</pre>
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="font-bold">Webhooks</h2>
          <p className="text-sm text-slate-600">
            Events: {WEBHOOK_EVENTS.map((e) => <code key={e} className="mr-1">{e}</code>)}. Each delivery is a JSON POST with <code>X-RulerReports-Event</code> and <code>X-RulerReports-Signature: sha256=&lt;hex&gt;</code> (HMAC-SHA256 of the raw body with the webhook secret).
          </p>
          <pre className={code}>{`// Node.js verification
import { createHmac, timingSafeEqual } from 'node:crypto';
const expected = 'sha256=' + createHmac('sha256', SECRET).update(rawBody).digest('hex');
const ok = timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers['x-rulerreports-signature']));`}</pre>
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="font-bold">MCP server</h2>
          <p className="text-sm text-slate-600">Give Claude (or any MCP client) access to your reporting data. It talks to this API with your token.</p>
          <pre className={code}>{`{
  "mcpServers": {
    "ruler-reports": {
      "command": "npx",
      "args": ["tsx", "mcp/server.ts"],
      "cwd": "<path to ruler-reports>",
      "env": { "RULER_REPORTS_URL": "${base}", "RULER_REPORTS_TOKEN": "rr_xxxxxxxx" }
    }
  }
}`}</pre>
        </section>

        <section className="card overflow-hidden">
          <div className="px-5 pt-4 font-bold">All endpoints ({routes.length})</div>
          <table className="mt-2 w-full">
            <tbody className="divide-y divide-[var(--line)]">
              {routes.map((r, i) => (
                <tr key={i}>
                  <td className="td w-24">
                    <span className={`badge font-mono ${r.method === 'GET' ? 'bg-sky-50 text-sky-700' : r.method === 'DELETE' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{r.method}</span>
                  </td>
                  <td className="td font-mono text-xs">/api/v2{r.path}</td>
                  <td className="td text-right">{r.ext ? <span className="badge bg-indigo-50 text-indigo-600">extension</span> : <span className="badge bg-slate-100 text-slate-500">Reportei v2</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </AppShell>
  );
}
