# Claude-hosted Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A claude.ai Artifact that replays Ruler Reports v3 for a client: captured agency screens in English and Greek plus a live wizard, editor, client links, AI analysis and PDF/CSV downloads, built from the app's own code.

**Architecture:** A capture script saves the real app's rendered screens, CSS, fonts, images, PDFs and a seed of the demo company's data. An esbuild bundle runs the app's own client components and services in the browser on an in-memory Prisma stand-in loaded from the seed, with bundler aliases replacing the database, server actions, Next navigation and node modules. A small shell routes between captured screens and live views inside one Artifact page.

**Tech Stack:** TypeScript, React 19.3 and the app's components, esbuild 0.28 (already in node_modules via tsx), Playwright 1.64 (capture and e2e), node:test + tsx, the Artifact `sample` and `downloads` capabilities.

**Spec:** `docs/superpowers/specs/2026-10-23-claude-hosted-demo-design.md`

## Global Constraints

- Nothing under `src/`, `prisma/`, `tests/` or `scripts/` of the app changes; all new code lives in `demo-host/`. The one app file touched is `tsconfig.json`, which excludes `demo-host` (ledgered ruling).
- The demo copy `E:\Claude\ruler-reports` (port 3102) is never touched. The capture runs against a v2 production server on port 3105 started from `.next-v2`; the 3104 dev server stays as is.
- TEMP/TMP point at `E:\Claude\tmp` for every command; helper scripts live in `E:\Claude\tmp\scripts`. No git: each task ends with a ledger checkpoint instead of a commit.
- Data: company 1 only; report 7 ("dsd") left out; integration credentials never exported (each becomes `{ demo: true }`); throw-away capture users `demo-en@demo.local` / `demo-el@demo.local` deleted at the end of the capture.
- Artifact contract: page content without doctype/html/head/body; `<title>Ruler Reports Demo</title>`; no `window.print`, `alert`, `confirm`, `prompt` or `<a download>` reached by the demo (the app's calls are intercepted); every `localStorage` access in try/catch; files ≤ 16 MB each, ≤ 255 files per publish.
- Capabilities declared: `{ sample: {}, downloads: true }`. Every use handles `claude.use()` resolving `null` and every rejection code.
- Copy: demo toasts read "Saved in the demo" / «Αποθηκεύτηκε στο demo»; the sign-in hint shows `admin@demo.local / demo1234`.

## Review Focus

- Opened outside a Claude viewer, or `claude.use` resolves `null`: the whole demo works, AI falls back to the rule-based analysis with its note, PDF/CSV entries say downloads are not available here — pinned in Task 8 (e2e without `window.claude`).
- `localStorage` throws (private window): the demo works for the session and "Reset demo" is hidden — pinned in Task 4.
- A Greek browser: first paint is Greek on captured and live views alike, and the language switch round-trips — pinned in Task 8.
- Phone width 390 px: no horizontal page scroll on sign-in, overview, editor and a client link — pinned in Task 8.
- A link or fetch the demo does not know (an app route not captured, an `/api/*` path): an in-app "Not available in the demo" card or a JSON 404, never a blank page or an uncaught error — pinned in Tasks 3 and 6.

---

### Task 1: Workspace and seed export

**Files:**
- Create: `demo-host/tsconfig.json`, `demo-host/aliases.mjs` (empty map for now), `demo-host/src/seed/types.ts`, `demo-host/export-seed.ts`, `demo-host/tests/seed.test.ts`
- Modify: `tsconfig.json` (add `"demo-host"` to `exclude`)

**Interfaces:**
- Produces: `interface Seed { version: 1; exportedAt: string; company: Row; projects: Row[]; integrations: Row[]; templates: Row[]; reports: Row[]; customMetrics: Row[]; goals: Row[]; timelineEvents: Row[]; users: Row[] }` where `Row = Record<string, unknown>` with Date fields as ISO strings; `DATE_FIELDS: Record<keyof Omit<Seed,'version'|'exportedAt'>, string[]>`. The `users` array holds one row, the demo admin, with `passwordHash: ''`.
- `node demo-host/export-seed.ts` (run with tsx) writes `demo-host/capture-out/seed.json`.

- [ ] **Step 1: Write the failing test** `tests/seed.test.ts`: `seed has the demo company only`: `reports.length === 11`, no report with `id === 7`, every report `companyId === 1`; `projects.length === 9`; `integrations.length === 42` and every `credentials` deep-equals `{ demo: true }`; `templates.length === 11`; the JSON is ≤ 1 MB.
- [ ] **Step 2: Run** `TEMP='E:\Claude\tmp' TMP='E:\Claude\tmp' npx tsx --tsconfig demo-host/tsconfig.json --test demo-host/tests/seed.test.ts` — Expected: FAIL (no seed.json).
- [ ] **Step 3: Implement** `export-seed.ts` with `@prisma/client` against `prisma/dev.db`; `tsconfig.json` exclude; `demo-host/tsconfig.json` extends the app's with `paths` unchanged.
- [ ] **Step 4: Run** the test — Expected: PASS. Run `npx tsc --noEmit` at the root — Expected: clean.
- [ ] **Step 5: Checkpoint** in `.superpowers/sdd/2026-10-23-claude-hosted-demo/progress.md`.

### Task 2: In-memory database

**Files:**
- Create: `demo-host/src/server/memdb.ts`, `demo-host/src/shims/db.ts`, `demo-host/tests/memdb.test.ts`, `demo-host/tests/run-bundled.mjs` (test helper: esbuild-bundles a test entry for node with `aliases.mjs` and runs it)
- Modify: `demo-host/aliases.mjs` (`'@/lib/db' → demo-host/src/shims/db.ts`)

**Interfaces:**
- Produces: `createMemDb(seed: Seed): MemDb`; `MemDb` has one model per seed table (`company, project, integration, template, report, customMetric, goal, timelineEvent, user`) plus `notification` and `media` (empty), each with `findMany, findFirst, findUnique, findFirstOrThrow, findUniqueOrThrow, create, update, updateMany, upsert, delete, deleteMany, count`; `$transaction(arg)` accepting an array of promises or a callback. `where` supports equality, `null`, `{ in, notIn, not, gt, gte, lt, lte, contains }`, `OR`, `AND`, `NOT`, and one-level relation filters (`project: { companyId }`); `select`/`include` resolve `project`, `company`, `integrations`, `template`, `_count.reports`; `orderBy` object or array; `take`/`skip`. New ids are max+1 per table; Date fields revived from `DATE_FIELDS`.
- `shims/db.ts` exports `db` (a proxy to the instance last passed to `setDb`) and `setDb(db: MemDb): void`; Task 4's `initStore` calls `setDb`.

- [ ] **Step 1: Write the failing tests** (run through `run-bundled.mjs`, so the app's own modules import the shim):
  - `createReport generates a report from sample data`: `createReport({ companyId: 1, projectId: 1, kind: 'report', title: 'Demo test', start: '2026-09-01', end: '2026-09-30', templateId: <default report template id>, integrationIds: <first two integrations of project 1> })` resolves; the new row has a `shareToken` of 32 chars and `data.sections.length > 0`.
  - `reportView composes the seeded Acme report`: `reportView(<report 1 with project>)` → `data.sections.length > 0`, `layout.blocks.length > 0`.
  - `saveLayout resolves values for a newly added widget`: add `fb_ads:spend_by_date` to the first ads block of report 1 → result `data.widgets` has a key containing `spend_by_date`.
  - `liveDashboardData follows a preset`: dashboard 2 with `{ preset: 'last_7d' }` → `range` spans 7 days.
  - `where/include basics`: `project.findMany({ where: { companyId: 1 }, include: { _count: { select: { reports: true } } } })` returns 9 rows with counts.
- [ ] **Step 2: Run** `node demo-host/tests/run-bundled.mjs demo-host/tests/memdb.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `memdb.ts` and the shim. Every Prisma call reached by those four services that the matcher does not support throws `MemDbUnsupported` naming the model, method and argument key, so gaps surface in tests rather than as wrong data.
- [ ] **Step 4: Run** — Expected: PASS (5/5).
- [ ] **Step 5: Checkpoint.**

### Task 3: Browser shims and bridges

**Files:**
- Create: `demo-host/src/shims/{node-crypto.ts, crypto.ts, connectors.ts, next-navigation.ts, next-link.tsx, next-dynamic.tsx, app-router-context.ts, process.ts}`, `demo-host/src/server/{anthropic-bridge.ts, api.ts}`, `demo-host/tests/shims.test.ts`
- Modify: `demo-host/aliases.mjs`

**Interfaces:**
- Aliases: `node:crypto → shims/node-crypto.ts` (`createHash('sha1'|'sha256').update(s).digest('hex')`, `randomBytes(n)`); `@/lib/crypto → shims/crypto.ts` (`randomToken(n)`, `sha256(s)`, `encryptJson(o) => o`, `decryptJson(o) => o ?? {}`); `@/lib/connectors → shims/connectors.ts` (`connectorFor(...)` and `getConnector(...)` always return `demoConnector`; `registerConnector` no-op); `next/navigation`, `next/link`, `next/dynamic`, `next/dist/shared/lib/app-router-context.shared-runtime` → the shims; esbuild `define` `process.env.NODE_ENV: "production"` and `inject` of `shims/process.ts` (a `process.env` object with `ANTHROPIC_API_KEY: 'demo-bridge'`).
- `installAnthropicBridge(getSample: () => Promise<SampleFn | null>): void` — wraps `window.fetch`; a POST to `https://api.anthropic.com/v1/messages` becomes `sample(system + '\n\n' + userContent, { modelTier: 'default' })` and answers `{ content: [{ type: 'text', text }] }`; `null` or a rejection answers status 503 with body `Claude is not available in this view`, so the app's `analyse()` takes its own fallback.
- `handleApi(url: URL, init?: RequestInit): Promise<Response | null>` — `/api/v2/metrics` (the editor's search) answers from `getCatalog`; `/api/media` GET answers `{ data: [] }`, POST answers `{ id, url }` with a `data:` URL (≤ 2 MB, else 413); any other `/api/*` answers 404 `{ message: 'Not available in the demo' }`; non-`/api` URLs return `null` (pass through).

- [ ] **Step 1: Write the failing tests:** `sha1 shim matches node` for three strings; `connectorFor always returns the demo connector` (for a `facebook_ads` row with real-looking credentials); `the bridge answers from sample` (fake sample returns `<p>ok</p>` → `analyse(data, 'Acme')` resolves `{ ai: true, html: '<p>ok</p>' }`); `the bridge falls back` (getSample → `null` → `analyse` resolves `ai: false` and html contains `Claude is not available in this view`); `unknown api path is a JSON 404`.
- [ ] **Step 2: Run** `node demo-host/tests/run-bundled.mjs demo-host/tests/shims.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS. Re-run Task 2's tests — Expected: PASS.
- [ ] **Step 5: Checkpoint.**

### Task 4: Demo store and actions

**Files:**
- Create: `demo-host/src/server/store.ts`, `demo-host/src/server/actions.ts`, `demo-host/tests/actions.test.ts`
- Modify: `demo-host/aliases.mjs` (`@/app/actions/app`, `@/app/actions/editor`, `@/app/actions/auth`, `@/app/actions/public` → `actions.ts`)

**Interfaces:**
- `store.ts`: `initStore(seed: Seed, storage?: StorageLike | null): void`; `getDb(): MemDb`; `persist(): void` (writes `reports`, `templates` and next ids to key `rr-demo-v1`, try/catch); `resetDemo(): void`; `canPersist(): boolean`; `createdIds(kind: 'report' | 'dashboard'): number[]`.
- `actions.ts` exports, with the exact signatures of `src/app/actions/app.ts` and `editor.ts`: `createReportAction`, `listCampaignsAction`, `saveLayoutAction`, `saveReportAsTemplateAction`, `generateAnalysisAction`, `saveAnalysisAction`, `deleteAnalysisAction`, `generateBlockAnalysisAction`, `generateAllBlocksAction` (bodies follow the app's, without auth and `revalidatePath`, company 1, then `persist()`); `loginAction(prev, fd)` (`admin@demo.local` / `demo1234` → `signIn()` and `navigate('/overview')`, else `{ error: 'Invalid email or password.' }`); `unlockShareAction` (always `{ error }` in the demo's language: the sample reports carry no password); every other export of the real action modules that the live graph imports is listed by Task 7's bundle check.

- [ ] **Step 1: Write the failing tests:** `createReportAction adds a report that persists` (fake storage → a second `initStore` with the same storage sees it); `saveLayoutAction returns values for a new widget`; `block analysis falls back when sample is unavailable` (card `author: 'ai'`, `ai: false`, html non-empty); `analyse all replaces earlier general block cards`; `resetDemo restores the seed` (the created report is gone); `storage that throws` (`getItem`/`setItem` throw → `initStore` works, `canPersist() === false`); `wrong password is refused`.
- [ ] **Step 2: Run** `node demo-host/tests/run-bundled.mjs demo-host/tests/actions.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS; Tasks 2–3 still PASS.
- [ ] **Step 5: Checkpoint.**

### Task 5: Capture

**Files:**
- Create: `demo-host/capture.ts`, `demo-host/routes.json` (the route list), `demo-host/tests/capture.test.ts`

**Interfaces:**
- `routes.json`: `[{ path: string, key: string }]` — every route of the spec's captured list, including each `?tab=` of the project and settings pages, `/templates/<id>` of the first built-in template, `/projects/1/connect/facebook_ads`, and `/__not_found` for the not-found screen.
- Output in `demo-host/capture-out/`: `views/en/<key>.html`, `views/el/<key>.html` (the `.frame` element, scripts and `<link rel=preload|modulepreload>` removed, `/_next/static/...` URLs rewritten to `assets/...`, links to report 7 removed), `views/manifest.json` (`{ routes: [{ path, key }], chrome: 'overview' }`), `app.css` (the build's CSS with font URLs rewritten to `fonts/<file>`), `fonts/*`, `images/*` (every `<img src>` that is not `data:` saved and rewritten), `pdf/<token>-<flow|pages>-<en|el>.pdf` for every shared sample report and dashboard, `seed.json` (Task 1).
- The script starts the production server (`npx next start -p 3105` with `NEXT_DIST_DIR=.next-v2`) as a child process, captures, and stops it.

- [ ] **Step 1: Write the failing test** `capture output is complete and clean`: manifest has ≥ 30 routes; for every route both `views/en/<key>.html` and `views/el/<key>.html` exist; no view contains `<script` or `/_next/`; every Greek view's nav contains `Επισκόπηση`; every `src=`/`href=` to `assets/`, `fonts/`, `images/` points at a file that exists; `app.css` exists and contains no `/_next/`; PDFs: 2 layouts × 2 languages per shared report (`%PDF` header each); no view links `/reports/7`; the throw-away users no longer exist in the database.
- [ ] **Step 2: Run** `TEMP='E:\Claude\tmp' TMP='E:\Claude\tmp' TSX_TSCONFIG_PATH=demo-host/tsconfig.json npx tsx --test demo-host/tests/capture.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** and run `TEMP='E:\Claude\tmp' TMP='E:\Claude\tmp' npx tsx demo-host/capture.ts` (background; ~10 min).
- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Checkpoint.**

### Task 6: Shell, router and captured screens

**Files:**
- Create: `demo-host/src/router.tsx`, `demo-host/src/shell.tsx`, `demo-host/src/captured.tsx`, `demo-host/src/downloads.ts`, `demo-host/src/main.tsx`, `demo-host/tests/router.test.ts`

**Interfaces:**
- `router.tsx`: `matchRoute(path: string, manifest: Manifest): Route` with `Route = { kind: 'captured'; key: string } | { kind: 'live'; view: 'login' | 'report' | 'dashboard' | 'new' | 'public-report' | 'public-dashboard'; id?: number; token?: string; query: URLSearchParams } | { kind: 'missing'; path: string }`; `RouterProvider`, `useDemoRouter(): { path; query; navigate(href: string): void; refresh(): void; refreshKey: number }`. The `next/navigation` shim (Task 3) delegates to it.
- `shell.tsx`: `<Shell>` holds `locale` (first load: `navigator.language` starting `el` → `el`, else `en`), `signedIn` (memory), renders `LoginView` when signed out, else the captured chrome of the route (captured views) or the manifest's `chrome` view with `main` emptied (live views), with the live view portalled into `main`; sets `aria-current` on the matching nav link; for `public-*` routes renders no app chrome.
- `captured.tsx`: injects the view HTML, then wires: internal `<a href="/…">` → `navigate`; the account menu's `[data-locale-switch]` buttons → `setLocale`; the logout form → `signOut()`; `/api/pdf/<token>?layout=…` → `downloadPdf`; `/api/v2/reports/<id>/export.csv` → `downloadCsv`; any other form submit → toast; demo-created reports injected at the top of the reports and dashboards lists (one row each, same markup as the first row).
- `downloads.ts`: `downloadPdf(token, layout, locale)`, `downloadCsv(reportId, locale)` through `claude.use('downloads')`; `null` → toast "Downloads are not available in this view"; `declined` → nothing; other codes → toast with the reason.
- `main.tsx`: `initStore(seed)`, `installAnthropicBridge(...)`, `window.fetch` wrapped with `handleApi`, renders `<Shell>`.

- [ ] **Step 1: Write the failing tests:** `matchRoute` cases — `/overview` → captured `overview`; `/projects/1?tab=goals` → captured `projects-1-goals`; `/reports/1` → live `report` id 1; `/dashboards/2` → live `dashboard`; `/reports/new?kind=dashboard&project=1` → live `new`; `/r/<token>` → live `public-report`; `/d/<token>?preset=last_7d` keeps the query; `/nope` → `missing`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Checkpoint.**

### Task 7: Live views

**Files:**
- Create: `demo-host/src/views/{LoginView.tsx, ReportPageView.tsx, PublicReportView.tsx, NewReportView.tsx, Missing.tsx}`, `demo-host/src/views/load.ts`, `demo-host/tests/views.test.ts`

**Interfaces:**
- `load.ts`: `loadReportPage(id: number, kind: 'report'|'dashboard'): Promise<ReportPageData>` (report with project and company, `reportView(...)` with `includeHidden`, cards, timeline, customMetrics, fmt, the share URL `/r|/d/<token>`); `loadPublic(token, kind, { preset, compare, lang }): Promise<PublicData>` (the values `PublicReport` computes before its JSX); `loadNewReport(kind, projectId?): Promise<NewReportData>` (the props `src/app/reports/new/page.tsx` passes to `ReportBuilder`).
- Each view mirrors the JSX of its server page (`src/components/report-page.tsx`, `src/components/public-report.tsx`, `src/app/reports/new/page.tsx`, `src/app/login/page.tsx`) with the data from `load.ts`, wrapped in `I18nProvider` (all namespaces for the locale) and `setRequestLocale(locale, lookupFor(locale))`; `useDemoRouter().refreshKey` reloads the data after an action calls `router.refresh()`.
- `Missing.tsx`: "Not available in the demo" card with a Back button.

- [ ] **Step 1: Write the failing tests** (jsdom-free: `renderToStaticMarkup` after awaiting the loaders, bundled for node): `report page renders the editor and the analysis panel for report 1`; `public report renders the cover, the sources and a Greek label with lang el`; `public dashboard honours preset last_7d` (the period label names 7 days); `new report view lists project 1's integrations`; `the bundle graph pulls no module that throws` (build `main.tsx` for the browser; the metafile contains no `@prisma/client`, no `src/lib/db.ts`, no `nodemailer`).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Checkpoint.**

### Task 8: Build, local harness and end-to-end check

**Files:**
- Create: `demo-host/build.mjs`, `demo-host/serve.mjs`, `demo-host/tests/e2e.test.ts`

**Interfaces:**
- `node demo-host/build.mjs [--inline]` → `demo-host/build/`: `index.html` (the page: `<title>Ruler Reports Demo</title>`, `claude:viewport-fit-sides` meta omitted — the app's own layout keeps its gutters —, a loading screen, `<link rel="stylesheet" href="app.css">`, `<script src="app.js" defer>`; with `--inline` both are inlined), `app.js` (esbuild, browser, iife, minify, `aliases.mjs`), plus everything in `capture-out/`. Prints file count and total size; fails above 255 files or any file above 16 MB.
- `node demo-host/serve.mjs [port=3199]` serves `build/` wrapping `index.html` in the Artifact skeleton, with a CSP header like the Artifact's (`script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'`), and blocks `window.print`/`alert`/`confirm` like the viewer (they return without effect).

- [ ] **Step 1: Write the failing test** `e2e.test.ts` (Playwright against `serve.mjs`, no `window.claude`): sign in with the demo credentials; visit every manifest route in English, then switch to Greek through the account menu and visit them again — no `pageerror`, no console error, no "Not available" card; open report 1, drag the first widget one column right and see "Saved"; add a metric from the drawer and see its card; set the cover to "No cover" and open the client link in the same session — the change shows; open dashboard 2's client link, choose "Last 7 days", Apply — the label changes; click "Analyse all blocks" — rule-based cards appear after their blocks; click Download PDF → toast "Downloads are not available in this view"; create a report in the wizard — it opens in the editor and tops the reports list; Reset demo — it is gone; at 390 px the sign-in, overview, report 1 and its client link have `scrollWidth <= clientWidth`; with `locale: 'el-GR'` the first paint is Greek.
- [ ] **Step 2: Run** `node demo-host/build.mjs && NAV_BASE=http://localhost:3199 TEMP='E:\Claude\tmp' TMP='E:\Claude\tmp' TSX_TSCONFIG_PATH=demo-host/tsconfig.json npx tsx --test demo-host/tests/e2e.test.ts` (with `serve.mjs` running) — Expected: FAIL until Tasks 6–7 pieces are complete, then the failures name what is missing.
- [ ] **Step 3: Fix** what the run names.
- [ ] **Step 4: Run** — Expected: PASS; every earlier demo test PASS; the app's `npx tsc --noEmit` clean.
- [ ] **Step 5: Checkpoint.**

### Task 9: Publish and check

**Files:** none new.

- [ ] **Step 1:** Publish `demo-host/build/index.html` with `files` for every other file in `build/`, `capabilities: { sample: {}, downloads: true }`, `icon: "chart"`, description "Ruler Reports v3 demo: agency screens, live report editor, client links, AI analysis and PDF in English and Greek." If the files exceed one publish (255 files or 64 MB), publish the page with the views and code first and the PDFs in a second publish to the same `url`.
- [ ] **Step 2:** One functional pass on the live artifact in the browser pane: sign in, open report 1, move a widget, open its client link, run "Analyse all" (accept the Claude prompt once), Download PDF (accept once), switch to Greek; read the console. If the same-origin `app.js`/`app.css` are refused by the page's CSP, rebuild with `--inline` and republish (ledgered ruling).
- [ ] **Step 3:** Ledger the result, update the hand-over note and memory, give the user the link and what was exercised.
