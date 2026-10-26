# v3 Plan F — Delivery and control

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Daily and weekday-position schedules, hold a report whose sources failed, goal alerts by e-mail, a public goals page, a client-side period picker with auto-refresh on shared dashboards, and convert/duplicate.

**Architecture:** The scheduler stays pure (`nextRunAfter`, `periodForRun`); `runAutomation` splits into generate and deliver so a held run can be sent later; new public route `/g/[token]` mirrors `/r`'s unlock flow; the dashboard page reads `preset`/`compare` query params validated against the report's allow-list; services `duplicateReport`/`convertReport` are pure DB operations exposed through actions and the API.

**Tech Stack:** as plan D.

**Spec:** `docs/superpowers/specs/2026-10-22-v3-programme-design.md` §3.

## Global Constraints

- Ledger: `.superpowers/sdd/2026-10-22-v3-f-delivery/progress.md`; checkpoints instead of commits; demo untouched.
- Frequencies: `daily | weekly | biweekly | monthly`; `weekdaysOnly` applies to daily only; `monthlyRule`: `day | first:<0-6> | last:<0-6>` (0 = Sunday, as `Date.getUTCDay`); `periodForRun('daily')` = yesterday.
- `AutomationRun.status`: `ok | error | held`; `holdOnFailure` default true; `attachPdf` default false (used by plan G).
- Goal e-mails use the same dedupe keys as the bell (`lastMetPeriod`, `lastClosedPeriod`, `lastSituation`).
- `/g/[token]` uses the `rr_pw_g_<projectId>` cookie with `unlockCookie(projectId, hash)`; 404 for unknown tokens.
- Dashboard presets a client may pick come only from `Report.clientPresets`; the saved preset is always allowed.
- Auto-refresh: 120 s, only while `document.visibilityState === 'visible'`, only for rolling presets.
- Duplicate title: `Copy of <title>`; convert report → dashboard uses preset `last_30d`; dashboard → report freezes today's range.
- Public report First Load JS stays ~106 kB (`AutoRefresh` ≤ 1 kB; the period form is plain HTML).

## Review Focus

- Daily at 08:00 Europe/Athens across the October DST change (2026-10-25): consecutive runs stay at 08:00 local — pinned by Task 1.
- `last:5` (last Friday) in a month whose last day is a Friday, and `first:1` when the 1st is a Monday — pinned by Task 1.
- A held run whose source was reconnected: "Send now" sends the stored report without regenerating, and the run turns `ok` with the delivery detail — pinned by Task 3.
- `/d/[token]?preset=last_90d` when `clientPresets` is null: the saved preset is served, no error — pinned by Task 6.
- Converting a password-protected report to a dashboard keeps the password; duplicating drops it — pinned by Task 7.

---

### Task 1: Scheduler

**Files:**
- Modify: `prisma/schema.prisma:171-200` (`Automation.weekdaysOnly Boolean @default(false)`, `monthlyRule String @default("day")`, `holdOnFailure Boolean @default(true)`, `attachPdf Boolean @default(false)`; `AutomationRun.status` comment `ok | error | held`), `src/lib/services/automations.ts:11` (`FREQUENCIES` + `'daily'`), `:33-58` (`nextRunAfter` handles daily/weekdaysOnly/monthlyRule), `:60-73` (`periodForRun('daily')`), `src/lib/api/routes.ts` (automation schemas: `frequency` enum, `weekdays_only`, `monthly_rule`)
- Test: `tests/v3-delivery.test.ts`

**Interfaces:**
- Produces: `nextRunAfter(a: { frequency; dayOfWeek; dayOfMonth; hour; weekdaysOnly?: boolean; monthlyRule?: string }, tz, from, lastRun?)`; `parseMonthlyRule(s: string): { kind: 'day' } | { kind: 'first' | 'last'; dow: number }`; `nthWeekday(y, m0, dow, which: 'first' | 'last'): number` (day of month).

- [ ] **Step 1: Failing tests** — daily from 2026-10-24T05:00Z at hour 8 in Europe/Athens → 2026-10-24T05:00Z is in the past? (08:00 EEST = 05:00Z) → next is 2026-10-25T06:00Z (08:00 EET after DST ends) and the one after is 2026-10-26T06:00Z; `weekdaysOnly` from Friday 2026-10-23 after 08:00 → Monday 2026-10-26; `monthlyRule: 'first:1'` from 2026-05-20 → 2026-06-01 (a Monday); `'last:5'` from 2026-10-01 → 2026-10-30 (Friday); `periodForRun('daily', '2026-10-22')` → `{ start: '2026-10-21', end: '2026-10-21' }`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Schema + generate (dev server stopped) + implement.** **Step 4: Run** → PASS; existing `tests/services.test.ts` scheduler cases still pass. **Step 5: Checkpoint.**

### Task 2: Automation form and API fields

**Files:**
- Modify: `src/app/projects/[id]/page.tsx:215-320` (frequency `daily` option; "Weekdays only" checkbox shown for daily; monthly rule select "On day N / First <weekday> / Last <weekday>"; "Hold the report when a source fails" checkbox; `attachPdf` checkbox disabled with "(needs the PDF service)" until plan G), `src/app/actions/app.ts` (`createAutomationAction`/`updateAutomationAction` read the fields), `src/lib/api/routes.ts` (serialise `weekdays_only`, `monthly_rule`, `hold_on_failure`, `attach_pdf`)
- Test: `tests/api.test.ts` (automation CRUD case extended with the new fields)

- [ ] **Step 1: Failing test** — `POST /automations` with `frequency: 'daily', weekdays_only: true` → 201 and the fields echo; `monthly_rule: 'first:9'` → 422.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5: Checkpoint.**

### Task 3: Hold on failure and failure alerts

**Files:**
- Modify: `src/lib/services/automations.ts:88-150` (split: `generateForAutomation(a, project)` → report; `deliverRun(runId)` → sends channels from the stored report; `runAutomation` = generate → inspect `data.sources` → hold or deliver; agency e-mail `failureEmailHtml` listing failed sources with reconnect links from plan D's `reconnectUrl` when available, else the integrations tab), `src/app/actions/app.ts` (`sendHeldRunAction(fd)` with `runId`, write right), `src/app/projects/[id]/page.tsx:190-210` (automation row: last run status chip `Held` + "Send now" button; `Error` as today), `src/app/automations/page.tsx` (same chip), `src/lib/api/routes.ts` (`POST /automations/:id/runs/:runId/send`)
- Test: `tests/v3-delivery.test.ts`

**Interfaces:**
- Produces: `runAutomation(id, opts)` returns `{ report, detail, status: 'ok' | 'held' }`; `deliverRun(runId: number): Promise<{ detail }>` (throws when the run is not `held`); `failedSources(data: ReportData): SourceStatus[]`.

- [ ] **Step 1: Failing test** — an automation (channels `email` + `in-app`, `emails: ['client@x.test']`, `holdOnFailure: true`) on a project whose demo integration is forced to fail (`addIntegration` with `demo: false` and a `rest` connector pointing at `http://127.0.0.1:9` so generation records `data_status: 'error'`): `runAutomation` → status `held`, no Outbox row to `client@x.test`, one Outbox row to the owner with subject containing "held", one notification; `deliverRun(run.id)` → Outbox row to the client, run status `ok`. With `holdOnFailure: false` → client row sent and the owner still gets the failure e-mail.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5: Checkpoint.**

### Task 4: Goal alerts by e-mail

**Files:**
- Modify: `prisma/schema.prisma:214-232` (`Goal.alertEmails Json?`), `src/lib/services/goals.ts:97-150` (after each `notify`, `sendEmail(alertEmails, subject, goalEmailHtml(...), { companyId })` when the list is non-empty), `src/components/goal-form.tsx` (field "Alert e-mails (comma-separated)"), `src/app/actions/app.ts` (`createGoalAction`/`updateGoalAction` parse the list, validate addresses), `src/lib/api/routes.ts` (`alert_emails`)
- Test: `tests/v3-delivery.test.ts`

- [ ] **Step 1: Failing test** — a goal with `alertEmails: ['pm@x.test']` whose demo value meets the target: `evaluateGoals(company.id)` → one Outbox row to `pm@x.test` with subject starting "Goal met"; a second evaluation sends nothing.
- [ ] **Step 2: Run** → FAIL. **Step 3: Schema + implement.** **Step 4: Run** → PASS. **Step 5: Checkpoint.**

### Task 5: Public goals page

**Files:**
- Modify: `prisma/schema.prisma:73-95` (`Project.goalsToken String? @unique`, `goalsPassword String?`), `src/app/actions/app.ts` (`shareGoalsAction` create token / set password / stop, admin), `src/app/projects/[id]/page.tsx` (goals tab: "Share control" block with link, password form, stop), `src/lib/share.ts` (`goalsUnlockCookie(projectId, hash)`), `src/lib/services/reports.ts:93` (`shareUrl('goals', token)` → `/g/<token>`)
- Create: `src/app/g/[token]/page.tsx`, `src/components/public-goals.tsx` (`PublicGoals({ token, embed })`: client mark, project name, one card per goal with `Ring` from `infographic.tsx`, situation chip, current/target/projection, period; password gate reusing `UnlockClient` with `kind="goals"`), `src/app/api/unlock/…` (extend the existing unlock endpoint to `goals`)
- Test: `tests/v3-delivery.test.ts` (render through the page component with a DB project) and `tests/v3-delivery-browser.test.ts`

- [ ] **Step 1: Failing tests** — `shareGoalsAction` creates a 32-char token; rendering `PublicGoals` for that token shows each goal title and a `.ring`; an unknown token → `notFound()`; with a password and no cookie → the lock view.
- [ ] **Step 2: Run** → FAIL. **Step 3: Schema + implement.** **Step 4: Run** → PASS. **Step 5: Checkpoint.**

### Task 6: Client period picker and auto-refresh

**Files:**
- Modify: `prisma/schema.prisma:142-165` (`Report.clientPresets Json?`), `src/components/report-page.tsx:87-100` (dashboard: multi-select of presets the client may pick, saved by `updateDashboardPresetAction`), `src/app/actions/app.ts` (`updateDashboardPresetAction` reads `clientPresets[]`), `src/app/d/[token]/page.tsx` (`searchParams.preset`, `compare`), `src/components/public-report.tsx` (dashboard head: `<form method="get">` with `<select name="preset">` of allowed presets + comparison checkbox + "Apply" (hidden when JS submits on change); "Live · updated HH:MM" label; `<AutoRefresh />` when rolling), `src/lib/engine/report.ts:326-345` (`liveDashboardData(report, { force?, preset?, compare? })`; cache key adds `compare`), `src/lib/api/routes.ts` (`client_presets`)
- Create: `src/components/auto-refresh.tsx` (client; `useEffect` interval 120 s → `router.refresh()` when visible)
- Test: `tests/v3-delivery.test.ts`

**Interfaces:**
- Produces: `clientPreset(report, requested: string | undefined): Preset` — returns `requested` only when it is in `clientPresets`, else `report.preset`; `liveDashboardData(report, { preset, compare })`.

- [ ] **Step 1: Failing tests** — `clientPreset` with `clientPresets: null` returns the saved preset for any input; with `['last_7d','last_30d']` returns `last_7d` when asked, the saved one for `last_90d`; `liveDashboardData` cache: two calls with `compare` true/false produce different keys (spy on the exported `liveCacheSize()` helper or assert the `comparison` field differs); render of the dashboard head contains `<select name="preset">` only when `clientPresets` is set and `AutoRefresh` only for rolling presets.
- [ ] **Step 2: Run** → FAIL. **Step 3: Schema + implement.** **Step 4: Run** → PASS. **Step 5: Checkpoint.**

### Task 7: Duplicate and convert

**Files:**
- Modify: `src/lib/services/reports.ts` (new `duplicateReport(id: number, companyId: number)`, `convertReport(id: number, companyId: number, kind: 'report' | 'dashboard')`), `src/app/actions/app.ts` (`duplicateReportAction`, `convertReportAction`), `src/components/report-page.tsx:102-150` ("Sharing & delivery" details gains a "More" row: Duplicate, Convert to dashboard / report), `src/lib/api/routes.ts` (`POST /reports/:id/duplicate`, `POST /reports/:id/convert { kind }`)
- Test: `tests/v3-delivery.test.ts`

- [ ] **Step 1: Failing tests** — `duplicateReport`: new id, title `Copy of …`, same `layout`/`analysis`/`integrationIds`/`data`, new `shareToken`, `password null`, `viewCount 0`; `convertReport(report → dashboard)`: `kind dashboard`, `preset last_30d`, `data null`, password kept, `reportView` then generates live data; `convertReport(dashboard → report)`: `kind report`, `preset custom`, `startDate/endDate` = today's `last_30d` range, `data` frozen (non-null); API surface includes both routes.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5: Checkpoint.**

### Task 8: Docs and browser verification

**Files:** `docs/DESIGN.md` (append "v3 — delivery": schedule rules, held runs, goals page, client presets), `tests/v3-delivery-browser.test.ts` (NAV_BASE: the dashboard link `/d/<dashboard token>` with `clientPresets` set switches period through the form and shows the Live label; "Duplicate" from the report page opens the copy; both cleaned up in `finally`).

- [ ] Steps: browser tests; `npm test`; `npx tsc --noEmit`; ledger.
