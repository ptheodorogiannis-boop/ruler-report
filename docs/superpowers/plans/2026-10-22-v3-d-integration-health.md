# v3 Plan D — Integration health, reconnect and data notes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Warn the agency before an integration breaks or a token expires, let them reconnect in one click without losing the integration, let a report retry one failed source, and tell clients why numbers can differ from the platform.

**Architecture:** A pure `alertFor` decides which alert a health transition produces; `checkIntegration` runs a connector's `validate` with a timeout; `checkAll` runs from the cron tick and sends bell + e-mail + webhook. Reconnect reuses the OAuth flow with an `integrationId` in the signed state and a `replaceId` in `connectIntegration`. Data notes are a static per-slug table rendered as a no-JS `<details>` on client pages and as footnotes in print.

**Tech Stack:** Next.js 15 app router, Prisma 6 + SQLite, zod, node:test + tsx (`TSX_TSCONFIG_PATH=tsconfig.test.json` for component tests), Playwright for browser checks (`NAV_BASE=http://localhost:3104`).

**Spec:** `docs/superpowers/specs/2026-10-22-v3-programme-design.md` §1 (and Error handling, Non-goals).

## Global Constraints

- No git: each task ends with `npx tsc --noEmit` clean and `npm test` green, recorded in the ledger `.superpowers/sdd/2026-10-22-v3-d-integration-health/progress.md`.
- Never touch `E:\Claude\ruler-reports`; dev server on 3104 only (`prisma generate` needs it stopped).
- Health values: `unknown | ok | failing | expiring`; alert kinds: `failing | expiring7 | expiring1 | recovered`; failing re-alert after 7 days; expiring thresholds 7 days and 1 day; check cadence 20 hours; `checkAll` limit 50 per tick; validate timeout 15 s.
- Alert recipients: company users with role `owner` or `admin`; e-mails go through `sendEmail` (Outbox when SMTP is unset); the webhook event is `integration_failing`.
- Reconnect never creates a second integration: the picked `sourceId` must equal the existing one.
- Public pages stay no-JS for the data note (`<details>`); public report First Load JS stays ~106 kB.
- Company toggle `showDataNotes` defaults to true.

## Review Focus

- An integration whose `validate` hangs (provider down): `checkIntegration` must return `failing` with "Timed out after 15 s" and `checkAll` must continue with the next row — pinned by Task 1's timeout test.
- A token that is already expired (`expiresAt` in the past) while `validate` still passes (cached session): status must be `failing`, not `expiring` — pinned by Task 1.
- Reconnect where the OAuth account picker returns a different ad account than the stored `sourceId`: nothing is written and the message names the stored id — pinned by Task 3.
- `retrySourceAction` on a report that has a layout with custom widgets referencing the failed account: the store entries of that account must be refreshed, the other accounts' values untouched — pinned by Task 5.
- A company that turned data notes off: no `<details>` on the public page, no footnotes in print, the generic footer sentence still shows the generation time — pinned by Task 6.

---

### Task 1: Health service core

**Files:**
- Modify: `prisma/schema.prisma` (model `Integration` after `lastError`: `health String @default("unknown")`, `healthCheckedAt DateTime?`, `healthError String?`, `tokenExpiresAt DateTime?`, `healthAlertAt DateTime?`, `healthAlertKind String?`)
- Create: `src/lib/services/health.ts`
- Test: `tests/v3-health.test.ts`

**Interfaces:**
- Produces: `type Health = 'unknown' | 'ok' | 'failing' | 'expiring'`; `type Alert = 'failing' | 'expiring7' | 'expiring1' | 'recovered'`; `interface HealthResult { health: Exclude<Health, 'unknown'>; error: string | null; tokenExpiresAt: Date | null }`; `interface HealthSnapshot { health: Health; healthAlertKind: string | null; healthAlertAt: Date | null; tokenExpiresAt: Date | null }`; `alertFor(prev: HealthSnapshot, next: HealthResult, now: Date): Alert | null`; `checkIntegration(row: Pick<Integration, 'id' | 'slug' | 'name' | 'sourceId' | 'config' | 'credentials'>, opts?: { connector?: Connector; now?: Date; timeoutMs?: number }): Promise<HealthResult>`; constants `FAILING_REALERT_MS = 7 * 86400000`, `EXPIRING_DAYS = 7`, `VALIDATE_TIMEOUT_MS = 15000`.

- [ ] **Step 1: Write the failing tests**

```ts
test('alertFor: transitions and dedupe', () => {
  const now = new Date('2026-10-22T09:00:00Z');
  const snap = (h: Health, kind: string | null = null, at: Date | null = null, exp: Date | null = null): HealthSnapshot => ({ health: h, healthAlertKind: kind, healthAlertAt: at, tokenExpiresAt: exp });
  const ok: HealthResult = { health: 'ok', error: null, tokenExpiresAt: null };
  const failing: HealthResult = { health: 'failing', error: 'Invalid OAuth access token', tokenExpiresAt: null };
  assert.equal(alertFor(snap('ok'), failing, now), 'failing');
  assert.equal(alertFor(snap('failing', 'failing', new Date(now.getTime() - 86400000)), failing, now), null, 'already alerted yesterday');
  assert.equal(alertFor(snap('failing', 'failing', new Date(now.getTime() - 8 * 86400000)), failing, now), 'failing', 're-alert after 7 days');
  const in5 = { ...ok, tokenExpiresAt: new Date(now.getTime() + 5 * 86400000), health: 'expiring' as const };
  assert.equal(alertFor(snap('ok'), in5, now), 'expiring7');
  assert.equal(alertFor(snap('expiring', 'expiring7', now), in5, now), null);
  const in12h = { ...in5, tokenExpiresAt: new Date(now.getTime() + 12 * 3600000) };
  assert.equal(alertFor(snap('expiring', 'expiring7', now), in12h, now), 'expiring1');
  assert.equal(alertFor(snap('failing', 'failing', now), ok, now), 'recovered');
  assert.equal(alertFor(snap('ok'), ok, now), null);
});

test('checkIntegration: demo rows are ok; a throwing validate is failing with the message; expiresAt within 7 days is expiring; a past expiresAt is failing; a hanging validate times out', async () => {
  const demo = { id: 1, slug: 'facebook_ads', name: 'x', sourceId: 'act_1', config: {}, credentials: encryptJson({ demo: true }) };
  assert.deepEqual(await checkIntegration(demo), { health: 'ok', error: null, tokenExpiresAt: null });
  const bad: Connector = { id: 'fake', daily: async () => ({}), breakdown: async () => [], validate: async () => { throw new Error('Invalid OAuth access token'); } };
  const live = { ...demo, credentials: encryptJson({ accessToken: 't' }) };
  assert.deepEqual(await checkIntegration(live, { connector: bad }), { health: 'failing', error: 'Invalid OAuth access token', tokenExpiresAt: null });
  const good: Connector = { ...bad, validate: async () => undefined };
  const now = new Date('2026-10-22T09:00:00Z');
  const soon = { ...demo, credentials: encryptJson({ accessToken: 't', expiresAt: now.getTime() + 3 * 86400000 }) };
  assert.equal((await checkIntegration(soon, { connector: good, now })).health, 'expiring');
  const past = { ...demo, credentials: encryptJson({ accessToken: 't', expiresAt: now.getTime() - 60000 }) };
  assert.deepEqual(await checkIntegration(past, { connector: good, now }), { health: 'failing', error: 'The access token expired', tokenExpiresAt: new Date(now.getTime() - 60000) });
  const hang: Connector = { ...bad, validate: () => new Promise(() => {}) };
  assert.deepEqual(await checkIntegration(live, { connector: hang, timeoutMs: 50 }), { health: 'failing', error: 'Timed out after 0 s', tokenExpiresAt: null });
});
```
(The timeout message prints whole seconds: `Timed out after ${Math.round(timeoutMs / 1000)} s`.)

- [ ] **Step 2: Run to verify failure** — `TSX_TSCONFIG_PATH=tsconfig.test.json npx tsx --test tests/v3-health.test.ts` → FAIL: cannot find module `health`.
- [ ] **Step 3: Schema fields; stop the dev server; `npx prisma generate && npx prisma db push --skip-generate`; restart with preview_start `ruler-reports-v2`.**
- [ ] **Step 4: Implement `src/lib/services/health.ts`** — `checkIntegration` decrypts credentials with `decryptJson` (null-safe), returns ok for `{ demo: true }` or no credentials-based connector; computes `tokenExpiresAt` from `expiresAt` (ms number) before validating; past expiry → failing without calling validate; otherwise `Promise.race([connector.validate?.({ integration }), timeout])`; `connector` defaults to `connectorFor(row)`.
- [ ] **Step 5: Run the tests** → PASS 2/2.
- [ ] **Step 6: Checkpoint** — `npx tsc --noEmit` clean; `npm test` green; ledger `Task 1: complete (…)`.

### Task 2: checkAll, alerts and the cron tick

**Files:**
- Modify: `src/lib/services/health.ts`, `src/lib/services/webhooks.ts:4-12` (`WEBHOOK_EVENTS` + `'integration_failing'`), `src/app/api/cron/tick/route.ts` (run `checkAll()` after goals; returned as `health`), `package.json` `tick` script unchanged (it calls the same functions), `src/app/actions/app.ts` (new `checkIntegrationAction(fd)` with `integrationId`, write right), `src/lib/services/messaging.ts` (no change; reuse `notify`/`sendEmail`)
- Test: `tests/v3-health.test.ts`

**Interfaces:**
- Consumes: Task 1 types; `notify(companyId, projectId, title, body, link)`, `sendEmail(to, subject, html, { companyId })`, `emitEvent(companyId, projectId, event, payload)`.
- Produces: `checkAll(opts?: { now?: Date; limit?: number; connectorFor?: (row) => Connector }): Promise<{ checked: number; alerts: { integrationId: number; alert: Alert }[] }>`; `reconnectUrl(i: { id: number; projectId: number; slug: string }): string` → `/projects/${projectId}/connect/${slug}?reconnect=${id}`; `healthEmailHtml(i: { name: string; slug: string; projectName: string }, alert: Alert, error: string | null, url: string): string`; `alertRecipients(companyId): Promise<string[]>`.

- [ ] **Step 1: Write the failing test**

```ts
test('checkAll: writes snapshots, alerts once per transition (bell + e-mail to owners/admins + webhook), skips rows checked within 20 h, and never throws', async () => {
  const { company, project } = await makeCompany();
  const row = await addIntegration(company.id, project.id, 'rest', { demo: false, credentials: { accessToken: 't' } });
  const fresh = await addIntegration(company.id, project.id, 'facebook_ads'); // demo → ok
  await db.integration.update({ where: { id: fresh.id }, data: { healthCheckedAt: new Date() } });
  const bad: Connector = { id: 'fake', daily: async () => ({}), breakdown: async () => [], validate: async () => { throw new Error('HTTP 401'); } };
  const out = await checkAll({ now: new Date(), connectorFor: () => bad });
  assert.equal(out.checked, 1, 'the fresh row is skipped');
  assert.deepEqual(out.alerts, [{ integrationId: row.id, alert: 'failing' }]);
  const saved = await db.integration.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(saved.health, 'failing');
  assert.equal(saved.healthError, 'HTTP 401');
  assert.equal(saved.healthAlertKind, 'failing');
  assert.equal(await db.notification.count({ where: { companyId: company.id, title: { contains: 'failing' } } }), 1);
  assert.equal(await db.outbox.count({ where: { companyId: company.id, subject: { contains: row.name } } }), 1, 'one e-mail to the single owner');
  const again = await checkAll({ now: new Date(Date.now() + 21 * 3600000), connectorFor: () => bad });
  assert.deepEqual(again.alerts, [], 'no second alert within 7 days');
});
```

- [ ] **Step 2: Run** → FAIL: `checkAll` is not a function.
- [ ] **Step 3: Implement** — select `status: 'active'` rows with `healthCheckedAt` null or `< now - 20h`, `orderBy healthCheckedAt asc`, `take limit`; per row try/catch; write `health/healthError/healthCheckedAt/tokenExpiresAt`; on an alert write `healthAlertKind/healthAlertAt`, `notify(...)` with `reconnectUrl`, `sendEmail(alertRecipients, subject, healthEmailHtml)` except for `recovered` (bell only), `emitEvent(..., 'integration_failing', { integration_id, name, error, url })` for `failing`. Add the tick call and the server action.
- [ ] **Step 4: Run** → PASS. **Step 5: Checkpoint.**

### Task 3: Reconnect without losing the integration

**Files:**
- Modify: `src/lib/oauth/state.ts:10-16` (`OAuthState.integrationId?: number`), `src/lib/oauth/flow.ts` (`startOAuth` reads `?reconnect=`; `handleCallback`/`finalizeSelection` pass `integrationId` through the pending blob to `connectIntegration({ replaceId })`), `src/lib/oauth/pending.ts:10` (`Pending.integrationId?: number`), `src/lib/services/integrations.ts:7-40` (`ConnectInput.replaceId?: number`; update path), `src/app/projects/[id]/connect/[slug]/page.tsx:26-60` (accept `searchParams.reconnect`, hidden `replaceId` in the token form, OAuth button link carries `reconnect`), `src/app/projects/[id]/connect/[slug]/pick/page.tsx` (shows "Reconnecting <name>: pick the same account" when pending has `integrationId`), `src/app/actions/app.ts` (`connectIntegrationAction` reads `replaceId`)
- Test: `tests/v3-health.test.ts`

**Interfaces:**
- Produces: `connectIntegration(inp: ConnectInput & { replaceId?: number })` — with `replaceId`: throws `Error('Pick the same account (<sourceId>) to reconnect, or add a new integration')` when `inp.sourceId !== row.sourceId`; otherwise updates `credentials`, `config` (merged with `validate`'s), `name` only when the row's is empty, sets `health: 'ok', healthError: null, lastError: null, healthAlertKind: null`, returns the updated row.

- [ ] **Step 1: Write the failing test**

```ts
test('reconnect: the same account replaces credentials in place; a different account is refused and nothing changes', async () => {
  const { company, project } = await makeCompany();
  const row = await addIntegration(company.id, project.id, 'facebook_ads', { sourceId: 'act_1' });
  await db.integration.update({ where: { id: row.id }, data: { health: 'failing', healthError: 'x', lastError: 'x' } });
  await assert.rejects(connectIntegration({ companyId: company.id, projectId: project.id, slug: 'facebook_ads', sourceId: 'act_2', credentials: { demo: true }, replaceId: row.id, skipValidation: true }), /Pick the same account \(act_1\)/);
  assert.equal((await db.integration.findUniqueOrThrow({ where: { id: row.id } })).health, 'failing');
  const updated = await connectIntegration({ companyId: company.id, projectId: project.id, slug: 'facebook_ads', sourceId: 'act_1', credentials: { demo: true, v: 2 }, replaceId: row.id, skipValidation: true });
  assert.equal(updated.id, row.id);
  assert.equal(updated.health, 'ok');
  assert.equal(updated.lastError, null);
  assert.equal(await db.integration.count({ where: { projectId: project.id } }), 1, 'no second integration');
});
```

- [ ] **Step 2: Run** → FAIL (a second row is created / no rejection). **Step 3: Implement** the service, the state/pending fields and the page wiring; `reconnectUrl` (Task 2) is what the pages link to. **Step 4: Run** → PASS. **Step 5: Checkpoint.**

### Task 4: Health in the UI

**Files:**
- Modify: `src/app/projects/[id]/page.tsx:87-130` (integrations tab rows: chip `Connected` / `Expires in N days` / `Failing since <date>` (title = error) + `Reconnect` link (OAuth defs) or `Replace credentials` link (`/connect/<slug>?reconnect=<id>`), `Check now` button → `checkIntegrationAction`), `src/lib/services/overview.ts:49` (`broken` counts `failing` or `expiring` or `lastError`), `src/app/overview/page.tsx:48-60` ("Needs attention" lines say "token expires in N days" / "failing: <error>" with the reconnect link), `src/components/shell.tsx` (no change; the bell count already includes notifications)
- Create: `src/components/health-chip.tsx` (`HealthChip({ health, tokenExpiresAt, healthCheckedAt, error })`, server component)
- Test: `tests/v3-health.test.ts` (render) and `tests/v3-health-browser.test.ts` (NAV_BASE)

- [ ] **Step 1: Failing render test** — `HealthChip` for `expiring` with `tokenExpiresAt` in 3 days renders `Expires in 3 days`; `failing` renders `Failing` and the error in `title`; `ok` renders `Connected`; `unknown` renders `Not checked yet`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Browser test (skip without NAV_BASE)** — sign in, force `health: 'failing'` on demo integration 1 through `db`, open `/projects/1?tab=integrations`, assert the chip text and a link whose href contains `?reconnect=1`; restore `health: 'ok'` in `finally`. **Step 6: Checkpoint.**

### Task 5: Report failure state with retry

**Files:**
- Modify: `src/components/widgets.tsx:350-366` (`SourceStatusList({ sources, reportId?, canWrite? })`: per failing source a `Reconnect` link and a `Retry` form button when `canWrite`), `src/components/report-page.tsx` (passes `reportId` and `canWrite`), `src/components/public-report.tsx` (passes nothing extra), `src/app/actions/app.ts` (new `retrySourceAction(_: unknown, fd: FormData)` with `reportId`, `integrationId`), `src/lib/engine/report.ts` (new `regenerateSource(report: ReportFull, integrationId: number): Promise<ReportData>`)
- Test: `tests/v3-health.test.ts`

**Interfaces:**
- Produces: `regenerateSource(report, integrationId)` — runs `generateReportData` for the report's template sections and only that integration, replaces in `report.data`: `sections` whose `source.integrationId` matches (same index position), `widgets` store keys starting with `${integrationId}:`, the `sources[]` entry; keeps everything else byte-identical; writes `Report.data`; returns the new data.

- [ ] **Step 1: Failing test** — make a report with two demo integrations (`createReport`), corrupt the store: set every `widgets` key of integration B to an error value and `sources[B].data_status = 'error'`; `regenerateSource(r, B.id)` → B's keys are numbers/charts again, `sources[B].data_status === 'ok'`, and `JSON.stringify` of A's section and store keys is unchanged.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** the engine function, the action (write right, `assertProject`, `revalidatePath`), the list UI. **Step 4: Run** → PASS. **Step 5: Checkpoint.**

### Task 6: "About these numbers"

**Files:**
- Create: `src/lib/catalog/data-notes.ts`, `src/components/data-note.tsx` (`DataNote({ slug, config, mode: 'details' | 'footnote', index? })`, server)
- Modify: `prisma/schema.prisma` (`Company.showDataNotes Boolean @default(true)`), `src/app/settings/page.tsx:60-70` (checkbox "Show 'About these numbers' on client pages"), `src/app/actions/app.ts:445-450` (`updateCompanyAction` reads it), `src/components/widgets.tsx:291` (`LayoutSection` header: `<DataNote mode="details">` after the block title when `theme.showDataNotes !== false` — pass `showDataNotes` through `ReportBody` props from the public page), `src/components/public-report.tsx` (cover "Sources" list gets `.print-only` footnotes `[1] Meta Ads: …`; footer sentence `GENERIC_DATA_NOTE` + `Data fetched <generated_at>`), `src/app/globals.css` (`.data-note` summary as a 14 px `i` circle; `.print-only` shown only in print; `@media print .data-note { display: none }`)
- Test: `tests/v3-health.test.ts`

**Interfaces:**
- Produces: `DATA_NOTES: Record<string, DataNote>`; `interface DataNote { attribution?: string; timezone: string; delay?: string; sampling?: string; counting?: string }`; `dataNote(slug: string, config?: Record<string, unknown>): string[]`; `GENERIC_DATA_NOTE` (the exact sentence from spec §1.4).

- [ ] **Step 1: Failing tests** — `dataNote('facebook_ads')` contains a sentence with "attribution window" and one with "time zone"; `dataNote('google_analytics_4')` mentions "sampling" or "thresholding"; `dataNote('unknown_slug')` equals `[GENERIC_DATA_NOTE]`; render `LayoutSection` with `showDataNotes` true → markup contains `<details class="data-note"` and "About these numbers"; with false → no `data-note`; public cover footnotes render `[1]` for the first source.
- [ ] **Step 2: Run** → FAIL. **Step 3: Schema + generate + implement.** **Step 4: Run** → PASS. **Step 5: Checkpoint.**

### Task 7: Docs, browser verification, final suite

**Files:** `docs/DESIGN.md` (append "v3 — integration health and data notes": the status model, alert cadence, where the note renders), `tests/v3-health-browser.test.ts` (public report shows the `i` control in a block header; overlap scan on `/r/<token>` at 1440/390 still 0 using the scratchpad `overlap-scan.cjs`).

- [ ] Steps: run the browser tests with NAV_BASE; `npm test`; `npx tsc --noEmit`; ledger.
