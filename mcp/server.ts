// MCP server for Ruler Reports. Talks to the REST API with a bearer token, so it works against any deployment.
//   RULER_REPORTS_URL=http://localhost:3100 RULER_REPORTS_TOKEN=rr_… npx tsx mcp/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE = (process.env.RULER_REPORTS_URL || 'http://localhost:3100').replace(/\/$/, '');
const TOKEN = process.env.RULER_REPORTS_TOKEN || '';

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}/api/v2${path}`, { method, headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new Error(`${res.status} ${json.message ?? text}`);
  return json;
}
const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] });
const run = (fn: () => Promise<unknown>) => fn().then(ok, (e: Error) => ({ isError: true, content: [{ type: 'text' as const, text: e.message }] }));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

const server = new McpServer({ name: 'ruler-reports', version: '0.1.0' });

server.tool('company_settings', 'Company profile, white-label settings and API rate limits.', {}, () => run(() => api('GET', '/companies/settings')));
server.tool('list_projects', 'List client projects. Start here: most tools need a project id.', { q: z.string().optional(), page: z.number().optional() }, ({ q, page }) => run(() => api('GET', `/projects?per_page=100${q ? `&q=${encodeURIComponent(q)}` : ''}${page ? `&page=${page}` : ''}`)));
server.tool('list_integrations', 'Connected accounts. Filter by project_id and/or slug (facebook_ads, google_analytics_4, …).', { project_id: z.number().optional(), slug: z.string().optional() }, ({ project_id, slug }) => run(() => api('GET', `/integrations?per_page=100${project_id ? `&project_id=${project_id}` : ''}${slug ? `&slug=${slug}` : ''}`)));
server.tool('integration_catalog', 'All integration types (slug, category, live connector or demo data).', {}, () => run(() => api('GET', '/integrations/catalog')));
server.tool('list_metrics', 'Metric catalog for an integration slug; use `search` to narrow.', { integration_slug: z.string(), search: z.string().optional() }, ({ integration_slug, search }) => run(() => api('GET', `/metrics?integration_slug=${integration_slug}&per_page=100${search ? `&search=${encodeURIComponent(search)}` : ''}`)));
server.tool(
  'get_metrics_data',
  'Fetch values for specific metrics of ONE integration, optionally compared with another period.',
  { integration_id: z.number(), reference_keys: z.array(z.string()).min(1), start: date, end: date, comparison_start: date.optional(), comparison_end: date.optional() },
  (a) => run(() => api('POST', '/metrics/get-data', { integration_id: a.integration_id, start: a.start, end: a.end, comparison_start: a.comparison_start, comparison_end: a.comparison_end, metrics: a.reference_keys.map((k) => ({ reference_key: k })) }))
);
server.tool('overview', 'Headline KPIs for every client with change vs the previous period, plus anomaly flags.', { days: z.number().optional() }, ({ days }) => run(() => api('GET', `/overview?days=${days ?? 30}`)));
server.tool('list_reports', 'Recent reports (static snapshots).', { project_id: z.number().optional() }, ({ project_id }) => run(() => api('GET', `/reports?per_page=25${project_id ? `&project_id=${project_id}` : ''}`)));
server.tool('list_dashboards', 'Live dashboards.', { project_id: z.number().optional() }, ({ project_id }) => run(() => api('GET', `/dashboards?per_page=25${project_id ? `&project_id=${project_id}` : ''}`)));
server.tool('list_templates', 'Report and dashboard templates.', { kind: z.enum(['report', 'dashboard']).optional() }, ({ kind }) => run(() => api('GET', `/templates?per_page=100${kind ? `&kind=${kind}` : ''}`)));
server.tool('get_report_data', 'The rendered numbers of a report or dashboard (KPIs, charts, tables, funnels) plus analysis cards.', { id: z.number(), kind: z.enum(['report', 'dashboard']).default('report') }, ({ id, kind }) => run(() => api('GET', `/${kind}s/${id}/data`)));
server.tool(
  'create_report',
  'Generate a report (kind=report) or dashboard. Uses all given integration ids and the template.',
  { project_id: z.number(), template_id: z.number(), integration_ids: z.array(z.number()).min(1), title: z.string(), start: date.optional(), end: date.optional(), comparison_start: date.optional(), comparison_end: date.optional(), kind: z.enum(['report', 'dashboard']).default('report'), with_ai: z.boolean().optional() },
  ({ kind, ...b }) => run(() => api('POST', `/${kind}s`, b))
);
server.tool('ask_report', 'Ask a natural-language question about one report’s numbers.', { report_id: z.number(), question: z.string() }, ({ report_id, question }) => run(() => api('POST', `/reports/${report_id}/ask`, { question })));
server.tool('add_analysis', 'Add an analysis card to a report. Set generate=true to have the analyst write it.', { report_id: z.number(), title: z.string().optional(), html: z.string().optional(), generate: z.boolean().optional() }, ({ report_id, ...b }) => run(() => api('POST', `/reports/${report_id}/analysis`, b)));
server.tool('list_goals', 'Goals with current value, progress, projected end and situation.', { project_id: z.number().optional() }, ({ project_id }) => run(() => api('GET', `/goals${project_id ? `?project_id=${project_id}` : ''}`)));
server.tool('goal_progress', 'Detailed progress for one goal.', { goal_id: z.number() }, ({ goal_id }) => run(() => api('GET', `/goals/${goal_id}/progress`)));
server.tool('list_automations', 'Scheduled report automations of a project.', { project_id: z.number().optional() }, ({ project_id }) => run(() => api('GET', `/automations${project_id ? `?project_id=${project_id}` : ''}`)));
server.tool('run_automation', 'Run an automation now (generates and delivers the report).', { automation_id: z.number() }, ({ automation_id }) => run(() => api('POST', `/automations/${automation_id}/run`)));
server.tool('list_timeline', 'Timeline milestones of a project.', { project_id: z.number().optional() }, ({ project_id }) => run(() => api('GET', `/timeline-events?per_page=50${project_id ? `&project_id=${project_id}` : ''}`)));
server.tool('add_timeline_event', 'Log a milestone (campaign launch, budget change, release…) on a project’s timeline.', { project_id: z.number(), title: z.string(), content: z.string().optional(), date: date.optional() }, (b) => run(() => api('POST', '/timeline-events', b)));
server.tool('push_rows', 'Push rows into a Push API integration (offline conversions, call logs, CRM exports).', { integration_id: z.number(), rows: z.array(z.record(z.any())).min(1) }, ({ integration_id, rows }) => run(() => api('POST', `/ingest/${integration_id}`, { rows })));

await server.connect(new StdioServerTransport());
