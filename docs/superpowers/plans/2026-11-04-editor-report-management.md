# Editor and report management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Archive/delete from the list, change a report's period with the AI analysis rewritten, one metric picker
(search, chips, ordered groups, only loadable metrics), a right-click "Add metric here", starred table rows, and
suggested questions in "Ask your data".

**Architecture:** Small new units around the existing editor: `report-period.ts` (period service), `pickable.ts` +
`groups.ts` (catalog filtering and order), `metric-picker.tsx` and `block-menu.tsx` (client), `insertAfter` in the
grid helpers, and an `archivedAt` column checked by one public-lookup helper. `report-editor.tsx` loses its inline
metric list to the picker.

**Tech Stack:** Next.js 15 App Router, Prisma 6 (SQLite dev/mock/test, Neon Postgres on Vercel), Tailwind, zod,
node:test via tsx, Playwright against the mock server.

**Spec:** `docs/superpowers/specs/2026-11-04-editor-report-management-design.md`

## Global Constraints

- Branch `v4`. Production (`main`) is updated only with the user's explicit OK.
- Never stage `package.json` or `package-lock.json` (another session's deps). Other files that show as modified
  differ only in line endings (checked with `git diff --ignore-cr-at-eol --stat`) and may be edited and staged.
- Commit with `git -c core.safecrlf=false`, adding only the files the task names. End commit messages with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Temp files and scripts go to `E:\Claude\tmp`. Restore `next-env.d.ts` and `tsconfig.json` after `tsc` or a build
  (`git checkout -- next-env.d.ts tsconfig.json`).
- i18n: add keys with `node E:\Claude\tmp\scripts\i18n-add.cjs '<json {key:[en,el]}>'`; `npm run i18n:review` must
  pass. Copy rules: sentence case, no exclamation marks, no trailing period on labels and buttons.
- Hallmark sloplint stays at 0 FAIL / 0 WARN:
  `node "C:/Users/Panagiotis Theo/.claude/skills/hallmark/scripts/sloplint.mjs" src/app/globals.css src/components src/app --scope app --genre modern-minimal`.
  Colours only through tokens in `globals.css`; Tailwind classes never built from template strings.
- Schema changes: stop the mock server first (`prisma generate` hits EPERM otherwise), then
  `npx prisma generate` and `npx prisma db push --skip-generate` against `file:./dev.db`, `file:./mock.db` and
  `file:./test.db`.
- Single test file:
  `DATABASE_URL='file:./test.db' npx prisma db push --skip-generate --accept-data-loss` once, then
  `DATABASE_URL='file:./test.db' APP_SECRET='test-secret-test-secret-test-secret' TSX_TSCONFIG_PATH=tsconfig.test.json node --import tsx --test tests/<file>.test.ts`.
- Browser tests: back up `prisma/mock.db`, start the `ruler-reports-v2-mock` launch config (port 3106), run with
  `PLAYWRIGHT_BROWSERS_PATH='E:\Claude\tmp\ms-playwright' NAV_BASE=http://localhost:3106 DATABASE_URL='file:./mock.db' APP_SECRET='ruler-reports-local-dev-secret-0123456789abcdef'`,
  then stop the server and restore `mock.db`. Sign in as in `tests/v4-search-browser.test.ts` (`signIn`).

## Review Focus

1. **Unsaved layout edits during a period change**: the editor flushes its autosave before calling the period
   action, so a widget added a second earlier is in the new snapshot. Test: Task 4 browser test adds a widget, then
   applies a new period at once.
2. **Widgets with their own period and editor-added widgets survive a period change**: their `@start..end` keys and
   `data.widgets` entries are rebuilt. Test: Task 3 `keeps widget periods`.
3. **Deleting an archived report with client questions and an automation link**: `ClientQuestion` cascades,
   `TimelineEvent.reportId` is set null; delete must not throw. Test: Task 1 `delete cascades`.
4. **Two rows with the same name** (e.g. two ads called "Ad 1"): starring stores the name once and tints both rows,
   unstarring clears both. Test: Task 8 `duplicate names`.
5. **API users and archived reports**: `GET /api/v2/reports` keeps listing them and adds `archived_at`;
   `GET /api/v2/metrics` without `pickable=1` is unchanged except that non-Meta ads platforms lose the variants they
   could never load. Test: Task 1 `api lists archived_at`, Task 5 `api unchanged without pickable`.

---

### Task 1: Archive data, public rule and services

**Files:**
- Modify: `prisma/schema.prisma` (model `Report`)
- Modify: `src/lib/share.ts`
- Modify: `src/lib/services/reports.ts`
- Modify: `src/app/r/[token]/page.tsx`, `src/app/d/[token]/page.tsx`, `src/components/public-report.tsx`,
  `src/app/actions/public.ts`, `src/app/api/pdf/[token]/route.ts`, `src/app/api/public/ask/[token]/route.ts`
- Modify: `src/lib/api/routes.ts` (report serializer near line 96)
- Test: `tests/v4-archive.test.ts`

**Interfaces:**
- Produces: `Report.archivedAt DateTime?` with `@@index([companyId, kind, archivedAt])`.
- Produces: `publicReportWhere(token: string, kind?: 'report' | 'dashboard'): Prisma.ReportWhereInput` in
  `src/lib/share.ts` → `{ shareToken: token, shareEnabled: true, archivedAt: null, ...(kind ? { kind } : {}) }`.
- Produces (in `src/lib/services/reports.ts`):
  `archiveReport(id: number, companyId: number): Promise<Report>`,
  `restoreReport(id: number, companyId: number): Promise<Report>`,
  `deleteArchivedReport(id: number, companyId: number, typedName: string): Promise<void>`
  (throws `'Archive the report before deleting it'` when not archived, `'Type the report name exactly to delete it'`
  when `typedName !== report.title`, `'Not found'` for another company's id).
- Produces: API report JSON gains `archived_at: string | null`.

- [ ] **Step 1: Write the failing tests** in `tests/v4-archive.test.ts` (helpers `makeCompany`, `addIntegration`,
  `createReport` with the default report template and a `facebook_ads` demo integration, as in
  `tests/v4-client-ask.test.ts`):
  - `archive and restore`: after `archiveReport`, `archivedAt` is a Date and `shareEnabled` is unchanged; after
    `restoreReport`, `archivedAt === null`.
  - `public routes 404 while archived`: the Ask route `POST` returns 404 for an archived report's token and the PDF
    route `GET` returns 404; after restore the Ask route answers 403 (Ask off by default), not 404.
  - `a link that was off stays off`: `shareEnabled=false` → archive → restore → `shareEnabled === false` and
    `db.report.findFirst({ where: publicReportWhere(token) })` is null.
  - `delete needs archive and the exact name`: `deleteArchivedReport` on an active report rejects with
    `/Archive the report before deleting it/`; on an archived one with `'wrong'` rejects with
    `/Type the report name exactly/`; with the title it resolves and the row is gone.
  - `delete cascades`: an archived report with one `ClientQuestion` and one `TimelineEvent` pointing at it deletes;
    the question is gone, the event remains with `reportId === null`.
  - `another company`: `archiveReport(id, otherCompanyId)` rejects with `/Not found/`.
  - `api lists archived_at`: `api(token, 'GET', '/reports')` includes the archived report with an ISO `archived_at`.

- [ ] **Step 2: Run them; expect FAIL** (`archiveReport` is not exported; `archivedAt` unknown).

- [ ] **Step 3: Implement.** Stop the mock server; add the column and index; `prisma generate`; push to dev, mock
  and test. Add `publicReportWhere`; replace the six inline `{ shareToken, shareEnabled: true … }` lookups with it.
  Add the three services (each `findFirst({ where: { id, companyId } })` first). Add `archived_at` to the serializer.

- [ ] **Step 4: Run the tests; expect PASS** (7/7). Also run `tests/v4-client-ask.test.ts` and `tests/v4-pdf.test.ts`;
  expect PASS.

- [ ] **Step 5: Commit**
  ```bash
  git -c core.safecrlf=false add prisma/schema.prisma src/lib/share.ts src/lib/services/reports.ts "src/app/r/[token]/page.tsx" "src/app/d/[token]/page.tsx" src/components/public-report.tsx src/app/actions/public.ts "src/app/api/pdf/[token]/route.ts" "src/app/api/public/ask/[token]/route.ts" src/lib/api/routes.ts tests/v4-archive.test.ts
  git -c core.safecrlf=false commit -m "Archive: archivedAt, one public-link rule, archive/restore/delete services"
  ```

### Task 2: Archive in the app (list, report page, search, project page)

**Files:**
- Modify: `src/components/report-index.tsx`, `src/components/report-rows.tsx`
- Create: `src/components/report-row-menu.tsx` (client)
- Modify: `src/app/actions/app.ts` (`deleteReportAction`, new `archiveReportAction`, `restoreReportAction`,
  `refreshReportAction`)
- Modify: `src/components/report-page.tsx` (Delete → Archive; archived banner)
- Modify: `src/lib/services/search.ts` (line ~40), `src/app/projects/[id]/page.tsx` (lines ~66, 67, 609)
- Modify: `src/app/reports/page.tsx` and `src/app/dashboards/page.tsx` only to pass `archived` from `searchParams`
- Test: `tests/v4-archive.test.ts` (add), `tests/v4-archive-browser.test.ts`

**Interfaces:**
- Consumes: Task 1 services.
- Produces: `archiveReportAction(fd)`, `restoreReportAction(fd)` (writers; `assertProject(p, r.projectId)`;
  revalidate the list and the report page), `deleteReportAction(fd)` now reads `fd.get('name')` and calls
  `deleteArchivedReport`, then redirects to the list with `?archived=1`.
- Produces: `ReportIndex({ kind, q, project, page, archived }: { …; archived?: string })`; `ReportRow` gains
  `archived: boolean`; `ReportRows` gets `canWrite: boolean` and renders `<ReportRowMenu>` per row.
- Produces: `refreshReportAction` returns without refreshing when `archivedAt` is set.

- [ ] **Step 1: Failing tests.** In `tests/v4-archive.test.ts` add `search skips archived`:
  `searchAll(principal, '<title>')` finds the report while active and not after `archiveReport`.
  New `tests/v4-archive-browser.test.ts` (`skip: !base`): sign in → `/reports` → open the "⋯" menu of the first row
  (`[data-row-menu]`) → Archive → the row disappears → switch to Archived (`a[href*="archived=1"]`) → the row is there
  → Restore → back in Active. Then Archive again, open Archived, Delete permanently: the confirm button
  (`[data-delete-confirm]`) is disabled until the exact title is typed, and the row is gone after confirming.
- [ ] **Step 2: Run; expect FAIL** (search returns the archived report; no `[data-row-menu]`).
- [ ] **Step 3: Implement.**
  - The list filters on `archivedAt: archived ? { not: null } : null`. The Active/Archived switch is two links beside
    the filter form, keeping `q` and `project`.
  - The row menu is a `<details>`-style popover with forms posting to the actions:
    - active rows: Open, Duplicate (`duplicateReportAction`), Archive;
    - archived rows: Restore, Delete permanently. Delete opens a small dialog with a text input; the button stays
      disabled until the input equals the title.
  - `report-page.tsx`: the Delete form becomes Archive. An archived report shows the banner with a Restore form,
    above the editor.
  - `searchAll` and the project page queries add `archivedAt: null`.
  - i18n:
    `{"reports.active":["Active","Ενεργές"],"reports.archived":["Archived","Αρχειοθετημένες"],"reports.archive":["Archive","Αρχειοθέτηση"],"reports.restore":["Restore","Επαναφορά"],"reports.deleteForever":["Delete permanently","Οριστική διαγραφή"],"reports.deleteConfirm":["Type “{name}” to delete it for good","Πληκτρολογήστε «{name}» για οριστική διαγραφή"],"reports.archivedBanner":["Archived · the client link is off","Αρχειοθετημένη · ο σύνδεσμος πελάτη είναι ανενεργός"],"reports.rowMenu":["Report actions","Ενέργειες αναφοράς"],"reports.restoreFirst":["Restore the report first","Επαναφέρετε πρώτα την αναφορά"]}`.
- [ ] **Step 4: Run** `tests/v4-archive.test.ts` (8/8) and the browser test; expect PASS. Sloplint 0/0.
- [ ] **Step 5: Commit** the files above plus `src/lib/i18n/en.json src/lib/i18n/el.json`:
  `"Archive: list switch and row menu, archive/restore on the report page, search and project lists skip archived"`.

### Task 3: Period change service

**Files:**
- Create: `src/lib/services/report-period.ts`
- Modify: `src/lib/engine/types.ts` (`AnalysisCard`), `src/lib/layout/types.ts` (`WidgetCustom`),
  `src/lib/layout/compose.ts` (`customSchema`)
- Modify: `src/app/actions/app.ts` (`saveAnalysisAction` clears `staleFor` on edit)
- Test: `tests/v4-period.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ComparisonChoice = 'previous_period' | 'previous_year' | 'none' | DateRange;
  export function inferComparison(range: DateRange, comparison: DateRange | null): 'previous_period' | 'previous_year' | 'none' | 'custom';
  export async function changeReportPeriod(reportId: number, companyId: number, input: { start: string; end: string; comparison: ComparisonChoice }): Promise<{ rewritten: number; failed: number; stale: number }>;
  export function withoutStale<T extends { staleFor?: DateRange }>(x: T): T;
  ```
- Produces: `AnalysisCard.staleFor?: DateRange`; `WidgetCustom.staleFor?: DateRange` (schema:
  `staleFor: z.object({ start: z.string(), end: z.string() }).optional()`).
- Consumes: `snapshotReport` (`src/lib/engine/report.ts`), `analyse` and `analyseBlock` (`src/lib/ai/insights.ts`),
  `previousPeriod`, `previousYear`, `isDate` (`src/lib/util/dates.ts`), `reportView` as the existing actions use it
  to get rendered data for the analysis.

- [ ] **Step 1: Failing tests** in `tests/v4-period.test.ts` (demo integrations; the Anthropic stub server from
  `tests/v4-client-ask.test.ts` for the AI cases):
  - `inferComparison`: Sept 2026 with Aug 2026 → `'previous_period'`; with Sept 2025 → `'previous_year'`; null →
    `'none'`; 2026-01-01..2026-01-10 → `'custom'`.
  - `re-pulls with the new dates`: after `changeReportPeriod(id, co, { start: '2026-10-01', end: '2026-10-31', comparison: 'previous_period' })`
    the row has those dates, comparison 2026-09-01..2026-09-30, `data.range.start === '2026-10-01'`, and
    `dataSyncedAt` is newer.
  - `rewrites only AI cards`: with one AI block card (tone 'general'), one AI top card and one human card, the stub
    answering `'New text.'` → both AI cards' html contains `New text.`, their ids are kept, `staleFor` is absent; the
    human card's html is unchanged and `staleFor` equals the old range; the result is `{ rewritten: 2, failed: 0, stale: 1 }`.
  - `failed rewrite keeps text`: the stub returns 500 → AI cards keep their html and get `staleFor`;
    `failed === 2`.
  - `analysis widgets get staleFor`: a layout `analysis` widget gets `custom.staleFor` = the old range.
  - `keeps widget periods`: a widget with `custom.period` 2026-01-01..2026-01-31 keeps it and its
    `data.widgets` value key `…@2026-01-01..2026-01-31` is present after the change.
  - `a source that only errors aborts`: create the report with a demo integration, then set that integration's
    `credentials` to null (`addIntegration` with `demo: false` semantics) → `changeReportPeriod` rejects with a
    message containing the integration's name; dates, `data` and `analysis` are byte-identical to before.
  - `refuses bad input`: start after end → `/start must be on or before end/`; archived → `/Restore the report first/`;
    custom comparison with start after end → rejects.
  - `editing clears the note`: `withoutStale({ id: 'c', staleFor: { start: '2026-09-01', end: '2026-09-30' } })`
    has no `staleFor` key; `saveAnalysisAction` and the analysis-widget edit path both use it.
- [ ] **Step 2: Run; expect FAIL** (module missing).
- [ ] **Step 3: Implement `changeReportPeriod`** in the order of spec §2: validate → build the snapshot on an
  in-memory copy of the report → abort check (for each integration id: old snapshot had ≥1 non-error value and the
  new one has only `type: 'error'` values → throw `` `${integration.name}: ${firstError.message}` ``) → rewrite AI
  cards (block cards with `analyseBlock(data, blockId, { tone, projectName, decimalSeparatorFormat })`, top cards
  with `analyse`; a card whose result has `ai: false` counts as failed and keeps its text) → mark human cards and
  layout `analysis` widgets with `staleFor` → one `db.report.update`. `saveAnalysisAction` drops `staleFor` from the
  card it saves; the editor's analysis-widget edit path drops `custom.staleFor` (Task 4 wires the UI).
- [ ] **Step 4: Run; expect PASS** (all of the file). Run `tests/engine.test.ts` and `tests/v2-compose.test.ts`;
  expect PASS.
- [ ] **Step 5: Commit** `src/lib/services/report-period.ts src/lib/engine/types.ts src/lib/layout/types.ts src/lib/layout/compose.ts src/app/actions/app.ts tests/v4-period.test.ts`:
  `"Period change: re-pull with the new dates, rewrite AI cards, mark human text as written for the old period"`.

### Task 4: Period control in the editor

**Files:**
- Create: `src/components/period-control.tsx` (client)
- Modify: `src/components/report-editor.tsx` (toolbar ~line 384; flush autosave; analysis widget edit clears
  `staleFor`), `src/components/report-page.tsx` (pass `key` and dates), `src/components/widgets.tsx`
  (`AnalysisCardView` stale note, editor only), `src/app/actions/app.ts` (`changeReportPeriodAction`)
- Test: `tests/v4-period-browser.test.ts`

**Interfaces:**
- Consumes: Task 3 `changeReportPeriod`, `inferComparison`.
- Produces: `changeReportPeriodAction(input: { reportId: number; start: string; end: string; comparison: ComparisonChoice }): Promise<Result<{ rewritten: number; failed: number; stale: number }>>`
  (writer, `assertProject`, revalidates the report page).
- Produces: `<PeriodControl range comparison timezone onApply />` where
  `onApply(input: { start; end; comparison }) => Promise<string | null>` (null = done, string = error to show).
  Presets: `previous_month`, `last_30d`, `this_month`, `this_quarter`, `last_90d`, `year_to_date`, `custom`, computed
  with `presetRange(p, timezone)`. Comparison select defaults to `inferComparison(range, comparison)`.
- Produces: `ReportEditor` gets `onBeforePeriodChange` behaviour internally: `await flush()` (the existing
  `doSave`, awaited until `saveState === 'saved'`) before calling the action; `report-page.tsx` renders
  `<ReportEditor key={r.dataSyncedAt?.toISOString() ?? 'none'} …>` so the refreshed page remounts with the new data.
- Ruling (spec silent): the "Written for …" note shows in the editor and on the report page for writers only, never
  on the client link or the PDF.

- [ ] **Step 1: Failing browser test** `tests/v4-period-browser.test.ts` (`skip: !base`): open a report on the mock
  server → note the first KPI's value → add a metric through the panel → at once open the period control
  (`[data-period]`), pick Last 90 days, Apply → "Updating numbers…" shows, then the page reloads; the period band
  shows the new dates, the KPI value differs (demo data is date-seeded) and the just-added widget is still there.
  A human analysis card on that report shows `Written for` in the editor and not on `/r/<token>`.
- [ ] **Step 2: Run; expect FAIL** (no `[data-period]`).
- [ ] **Step 3: Implement** the control (reports only; dashboards keep their preset switcher), the action, the
  flush-before-apply, the `key`, and the stale note. Error text from the action shows in the control and keeps the
  old period selected. i18n:
  `{"editor.period":["Period","Περίοδος"],"editor.compareWith":["Compare with","Σύγκριση με"],"editor.cmpPrevious":["Previous period","Προηγούμενη περίοδος"],"editor.cmpYear":["Previous year","Προηγούμενο έτος"],"editor.cmpNone":["None","Καμία"],"editor.cmpCustom":["Custom","Προσαρμοσμένη"],"editor.updatingNumbers":["Updating numbers…","Ενημέρωση αριθμών…"],"editor.writtenFor":["Written for {range}","Γράφτηκε για {range}"],"editor.rewriteFailed":["Couldn't rewrite: try Regenerate","Δεν ήταν δυνατή η αναδιατύπωση: δοκιμάστε Αναδημιουργία"]}`
  (reuse `common.apply` and `presets.*`).
- [ ] **Step 4: Run** the browser test and `tests/v4-period.test.ts`; expect PASS. Sloplint 0/0.
- [ ] **Step 5: Commit** the files above plus the i18n files:
  `"Editor: period control with comparison, flush before re-pull, written-for note for writers"`.

### Task 5: Catalog groups, variants on Meta only, pickable metrics

**Files:**
- Create: `src/lib/catalog/groups.ts`, `src/lib/catalog/pickable.ts`
- Modify: `src/lib/catalog/archetypes.ts` (remove `variants` from `ADS`), `src/lib/catalog/integrations.ts`
  (`IntegrationDef.variants?`; set on `facebook_ads`), `src/lib/catalog/build.ts` (read `def.variants`),
  `src/lib/catalog/helpers.ts` (move the `variants` type to a shared `Variants` type), `src/lib/api/routes.ts`
  (`GET /metrics` `pickable=1`)
- Test: `tests/v4-picker-catalog.test.ts`

**Interfaces:**
- Produces in `groups.ts`:
  `export const groupId = (name: string): string` (lowercase, non-alphanumerics → `_`: `'By platform'` → `'by_platform'`,
  `'E-commerce'` → `'e_commerce'`);
  `export const GROUP_ORDER: Record<string, string[]>` keyed by archetype id:
  - ads: investment, delivery, engagement, efficiency, results, funnel, by_platform, audience, charts, tables
  - social: audience, delivery, engagement, content, conversion, charts, tables
  - web: traffic, engagement, conversion, e_commerce, acquisition, audience, funnel, charts, tables
  - seo: performance, audience, charts, tables
  - ecom: sales, customers, funnel, audience, charts, tables
  - crm: leads, deals, value, team, funnel, charts, tables
  - email: delivery, engagement, list, revenue, charts, tables
  - local: visibility, actions, reputation, charts, tables
  - video: performance, engagement, audience, acquisition, charts, tables
  - calls: calls, quality, acquisition, charts, tables

  `export function sortByGroup<T extends { group?: string }>(archetype: string, items: T[]): T[]` (stable; unknown
  groups last).
  Ruling: the spec's example group names ("Spend & delivery", "Clicks & traffic") were illustrative; the catalog's
  existing group names are kept and only their order is fixed.
- Produces in `pickable.ts`: `export function pickableMetrics(slug: string, widgets: CatalogWidget[]): CatalogWidget[]`
  drops widgets whose `planPrims(slug, widgetPrims(w.calc)).real` meet `getConnector(def.connector).unsupported`,
  then `sortByGroup`.
- Produces: `GET /api/v2/metrics?…&pickable=1` returns `pickableMetrics(...)`; without the flag the list is as before.
- Ruling: moving the variants to Meta Ads changes the catalog for API users too, because the other ads platforms never
  returned data for them; "the API keeps every entry" in the spec applies to the picker-only filter (unsupported
  primitives), which needs `pickable=1`.

- [ ] **Step 1: Failing tests** `tests/v4-picker-catalog.test.ts`:
  - `variants on Meta only`: `getCatalog('facebook_ads')` has `reach_facebook`; `getCatalog('google_adwords')` and
    `getCatalog('tiktok_ads')` have no key ending in `_facebook`, `_instagram`, `_messenger` or `_audience_network`;
    `getCatalog('google_adwords').length === 38`.
  - `group ids`: `groupId('By platform') === 'by_platform'`, `groupId('E-commerce') === 'e_commerce'`.
  - `group order`: `pickableMetrics('facebook_ads', getCatalog('facebook_ads'))` group sequence (deduplicated) equals
    `GROUP_ORDER.ads` filtered to groups present.
  - `unsupported dropped`: no `pickableMetrics('facebook', …)` entry uses `link_clicks`; no `instagram_business` entry
    uses `unfollows` or `video_views`; the same keys are still in `getCatalog(...)`.
  - `api unchanged without pickable`: `api(token,'GET','/metrics?integration_slug=instagram_business&per_page=100')`
    contains an entry whose calc uses `unfollows`; with `&pickable=1` it does not.
  - `existing templates still resolve`: every widget key used by `PLATFORM_TEMPLATES` for `facebook_ads` exists in
    `getCatalog('facebook_ads')`.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** as in Interfaces. Also run `tests/v2-compose.test.ts` and `tests/engine.test.ts`; any
  template or test that used a variant on a non-Meta platform is a finding to fix in the template, not in the test.
- [ ] **Step 4: Run; expect PASS.**
- [ ] **Step 5: Commit** the files above: `"Catalog: variants on Meta Ads only, fixed group order, pickable metrics for the editor"`.

### Task 6: Metric picker

**Files:**
- Create: `src/components/metric-picker.tsx` (client), `src/lib/util/text.ts`
- Modify: `src/components/report-editor.tsx` (`AddMetricsPanel` lines ~801-953 use the picker on the Predefined tab),
  `src/components/list-filter.tsx` and `src/lib/services/search.ts` (import `fold`)
- Test: `tests/v4-picker-browser.test.ts`, `tests/pure.test.ts` (add `fold`)

**Interfaces:**
- Consumes: Task 5 `groupId`, `GROUP_ORDER` (order already applied by the API), `pickable=1`.
- Produces: `export const fold = (s: string): string` in `src/lib/util/text.ts` (NFD, strip marks, lowercase).
- Produces:
  ```ts
  export function MetricPicker(props: { source: SourceInfo; existing: Set<string>; onPick: (p: MetricPayload) => void; variant: 'panel' | 'popover'; dragProps?: (p: MetricPayload) => object; onClose?: () => void }): JSX.Element;
  export interface MetricPayload { kind: 'metric'; slug: string; integrationId: number; key: string; component: Component; title: string }
  ```
  `MetricPayload` lives in `metric-picker.tsx`; the editor's `Payload` union uses it for its metric member (the editor
  imports the picker, never the other way round).
  One fetch per source (`per_page=100&pickable=1`), filtering in memory with `fold` over title + description.
  Chips: All / `editor.comp_number_v1` / `editor.comp_chart_v1` / `editor.comp_datatable_v1` (reuse `COMP_LABEL`
  keys). Groups collapse (state per group id, open by default; the search opens all). Header: translated group name
  (`catalog.group.<id>`, fallback the raw name) and count. Ticks: `existing.has(\`${integrationId}:${key}\`)`.
  Keyboard: ArrowUp/ArrowDown move an active index across visible items, Enter picks, Escape → `onClose` (popover)
  or clears the search (panel). The list has `role="listbox"`, items `role="option"`.
- i18n: `catalog.group.*` for every id in `GROUP_ORDER` plus `other`:
  investment Επένδυση, delivery Προβολή, engagement Αλληλεπίδραση, efficiency Αποδοτικότητα, results Αποτελέσματα,
  funnel Χωνί, by_platform Ανά πλατφόρμα, audience Κοινό, charts Γραφήματα, tables Πίνακες, content Περιεχόμενο,
  conversion Μετατροπές, traffic Επισκεψιμότητα, e_commerce Ηλεκτρονικό εμπόριο, acquisition Απόκτηση,
  performance Απόδοση, sales Πωλήσεις, customers Πελάτες, leads Δυνητικοί πελάτες, deals Συμφωνίες, value Αξία,
  team Ομάδα, list Λίστα, revenue Έσοδα, visibility Ορατότητα, actions Ενέργειες, reputation Φήμη, calls Κλήσεις,
  quality Ποιότητα, other Άλλα (English = the catalog's current group name); plus
  `{"editor.chipAll":["All","Όλα"],"editor.inReport":["In this report","Στην αναφορά"]}`.

- [ ] **Step 1: Failing tests.** `tests/pure.test.ts`: `fold('Κόστος Ανά Κλικ') === 'κοστος ανα κλικ'`.
  `tests/v4-picker-browser.test.ts` (English UI): open a report with a Meta Ads block → Add metrics → type
  `cost per` → every visible option's text matches `/cost per/i` and there are fewer than before; click the Chart chip → every visible option shows
  the chart label; collapse "Delivery" → its options are hidden; a metric already in the block shows the tick; on a
  Google Ads block no option title ends with "on Facebook".
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement**; `AddMetricsPanel` keeps its header, tabs, source select and the Customizable tab; the
  Predefined tab renders `<MetricPicker variant="panel" …>` with the existing drag props.
- [ ] **Step 4: Run** both tests and `tests/v4-search.test.ts`; expect PASS. Sloplint 0/0; `npm run i18n:review`.
- [ ] **Step 5: Commit** the files above plus the i18n files: `"Editor: one metric picker with search, chips, ordered collapsible groups"`.

### Task 7: Right-click "Add metric here"

**Files:**
- Modify: `src/lib/layout/grid.ts`
- Create: `src/components/block-menu.tsx` (client)
- Modify: `src/components/report-editor.tsx` (`<section data-block>` and the grid item wrapper get `onContextMenu`)
- Test: `tests/layout.test.ts` (add), `tests/v4-block-menu-browser.test.ts`

**Interfaces:**
- Produces: `export function insertAfter(items: GridRect[], afterId: string | null, w: number, h: number, cols = GRID_COLS): { x: number; y: number }`:
  after a widget → `{ x: a.x + a.w, y: a.y }` when `a.x + a.w + w <= cols`, else `{ x: 0, y: a.y + a.h }`;
  `afterId === null` → `{ x: 0, y: gridHeight(items) }`. The editor then calls the existing
  `addWidget(blockId, payload, pos)`, whose `compact(resolve(...))` pushes the rest down.
- Produces: `<BlockMenu at={{x,y}} widgetId={string|null} onAddHere onDuplicate onRemove onClose />` and a popover
  mode that renders `<MetricPicker variant="popover">` at the same point (clamped inside the viewport).
- Behaviour: `onContextMenu` calls `preventDefault()` unless `e.shiftKey`; the menu closes on Escape, outside
  pointerdown and scroll. Duplicate/Remove use `duplicateWidget`/`removeWidget`. i18n:
  `{"editor.addMetricHere":["Add metric here","Προσθήκη μέτρησης εδώ"]}` (reuse `common.duplicate`, `common.remove`).

- [ ] **Step 1: Failing tests.** `tests/layout.test.ts`: `insertAfter([{id:'a',x:0,y:0,w:3,h:2}],'a',3,2)` →
  `{x:3,y:0}`; `insertAfter([{id:'a',x:6,y:0,w:6,h:2}],'a',3,2)` → `{x:0,y:2}`;
  `insertAfter([{id:'a',x:0,y:0,w:12,h:4}],null,3,2)` → `{x:0,y:4}`.
  `tests/v4-block-menu-browser.test.ts`: right-click the first widget of a Meta Ads block → menu shows
  "Add metric here" → click → popover picker opens → type and press Enter → the new widget's grid position equals
  `insertAfter(<block widgets before>, <clicked id>, w, h)` (read `data-x`, `data-y`, `data-w`, `data-h` on the grid
  items; `src/components/grid.tsx` already renders `data-w` near line 172, add the other three there); Escape closes an
  open menu; Shift+right-click opens no app menu.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run; expect PASS.** Sloplint 0/0.
- [ ] **Step 5: Commit** the files above plus the i18n files: `"Editor: right-click menu with Add metric here, Duplicate, Remove"`.

### Task 8: Row stars

**Files:**
- Modify: `src/lib/layout/types.ts` (`WidgetCustom.starredRows?: string[]`), `src/lib/layout/compose.ts`
  (`customSchema`: `starredRows: z.array(z.string().max(300)).max(100).optional()`)
- Modify: `src/components/widgets.tsx` (`CardProps.onStarRow?: (name: string) => void`; `TableCard`; `WidgetCard`
  passes it through), `src/components/container-card.tsx` (the campaign table: same rule on `r.name`),
  `src/components/report-editor.tsx` (passes `onStarRow` that toggles `custom.starredRows` via `updateCustom`)
- Ruling: the spec says campaign tables use `TableCard`; they use `ContainerCard`, so both cards get the star.
- Modify: `src/app/globals.css` (`--row-star` token for light, dark and print; `.row-starred`)
- Test: `tests/v2-render.test.ts` (add) or `tests/v4-stars.test.ts`, `tests/v4-stars-browser.test.ts`

**Interfaces:**
- Produces: a table row is starred when `customOf(b).starredRows?.includes(String(row[0]))`; it gets
  `className="row-starred"` and `data-starred`. With `onStarRow`, the first cell renders a button
  (`aria-pressed`, `aria-label` `editor.starRow` / `editor.unstarRow`) visible on row hover and focus; without it, no
  button. `.row-starred { background: var(--row-star); font-weight: 600 }`; `--row-star` mixes the report accent at
  about 12% into the card in light, 22% in dark; print uses a light grey token.
- i18n: `{"editor.starRow":["Star this row","Επισήμανση γραμμής"],"editor.unstarRow":["Remove the star","Αφαίρεση επισήμανσης"]}`.

- [ ] **Step 1: Failing tests.** Render test (server render of `WidgetCard` with a table value and
  `custom.starredRows=['Ad 2']`): the row with `Ad 2` has `data-starred`, the others don't, and no star button is
  rendered. `duplicate names`: two rows named `Ad 1` and `starredRows=['Ad 1']` → both rows have `data-starred`.
  `customSchema` rejects 101 entries. The same server render for a container value with
  `starredRows=['Campaign 2']` marks that campaign row. Browser test: in the editor hover a row of a Meta Ads table →
  click the star →
  `/r/<token>` shows that row with `.row-starred` and a computed `font-weight` of 600; click again in the editor →
  the link shows no starred row.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement.** Toggling the star in the editor: add the name if absent, remove it if present.
- [ ] **Step 4: Run; expect PASS.** Sloplint 0/0.
- [ ] **Step 5: Commit** the files above plus the i18n files: `"Tables: star rows in the editor, highlighted on the client link and PDF"`.

### Task 9: Suggestions in "Ask your data"

**Files:**
- Modify: `src/lib/ai/insights.ts` (`suggestedQuestions`), `src/components/ask-box.tsx`,
  `src/components/report-page.tsx` (pass `suggestions`)
- Test: `tests/v4-client-ask.test.ts` (add)

**Interfaces:**
- Produces: `suggestedQuestions(data: ReportData, locale: Locale, audience: 'client' | 'agency' = 'client'): string[]`.
  The client output is unchanged. Agency: `ask.qBestAd` when any block's slug is an ads slug (`isAdsSlug`), then
  `ask.qTellClient`, then the client list; deduplicated; first three.
- Produces: `<AskBox reportId suggestions={string[]} />`: up to three buttons above the input; a click fills the
  input and submits. Its strings move to i18n.
- i18n:
  `{"ask.qBestAd":["Which ad performed best?","Ποια διαφήμιση απέδωσε καλύτερα;"],"ask.qTellClient":["What should I tell the client this month?","Τι να πω στον πελάτη αυτόν τον μήνα;"],"askbox.title":["Ask your data","Ρωτήστε τα δεδομένα σας"],"askbox.placeholder":["Which channel drove the most conversions? Why did spend go up?","Ποιο κανάλι έφερε τις περισσότερες μετατροπές; Γιατί αυξήθηκε η δαπάνη;"],"askbox.ask":["Ask","Ρωτήστε"],"askbox.byClaude":["Answered by Claude from this report’s numbers","Απάντηση από το Claude με βάση τους αριθμούς της αναφοράς"],"askbox.keyword":["Keyword match (set ANTHROPIC_API_KEY for free-form answers)","Αντιστοίχιση λέξεων (ορίστε ANTHROPIC_API_KEY για ελεύθερες απαντήσεις)"]}`.

- [ ] **Step 1: Failing tests:** agency suggestions for data with a `facebook_ads` block start with the best-ad
  question and have length 3; for GA4-only data they start with the tell-the-client question; the client output for
  the same data equals the current output.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run; expect PASS.**
- [ ] **Step 5: Commit** the files above plus the i18n files: `"Ask your data: suggested questions for the agency, strings translated"`.

### Task 10: Docs and the whole-suite check

**Files:**
- Modify: `docs/DESIGN.md` (a short "Editor and report management" section: picker, right-click, stars, period,
  archive), `docs/FEATURE_MATRIX.md` if it lists editor features

- [ ] **Step 1:** Write the docs section (what each feature does and where it lives; no marketing copy).
- [ ] **Step 2:** Run `npm test`; expect 0 failures (browser tests skip without `NAV_BASE`). Re-push the test schema
  afterwards (`npm test` deletes `test.db`).
- [ ] **Step 3:** Run all new browser tests against the mock server; expect PASS (the PDF-menu browser test may fail
  for the known missing-Chromium reason; name it if so).
- [ ] **Step 4:** `npx tsc --noEmit` (then restore `next-env.d.ts` and `tsconfig.json`), sloplint 0/0,
  `npm run i18n:review`.
- [ ] **Step 5: Commit** the docs: `"Docs: editor and report management"`.
