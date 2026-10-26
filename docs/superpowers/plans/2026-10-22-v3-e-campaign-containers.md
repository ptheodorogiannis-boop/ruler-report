# v3 Plan E — Campaign containers and campaign selection

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an ads block show only chosen campaigns (pick or rule), add a campaign table widget with one row per campaign, and ask for campaigns in the report wizard.

**Architecture:** A pure `CampaignScope` (`all | pick | rule`) lives on the integration config, can be overridden per block, and is frozen into the report's sources at generation. Connectors gain `listCampaigns` and an "in" filter; Meta implements both on the Graph API, the demo connector synthesises six campaigns per account. `container_v1` is a new widget component resolved from the existing `campaign` breakdown.

**Tech Stack:** as plan D. Meta Graph API v-current (`insights` with `filtering`, `/campaigns`).

**Spec:** `docs/superpowers/specs/2026-10-22-v3-programme-design.md` §2.

## Global Constraints

- Ledger: `.superpowers/sdd/2026-10-22-v3-e-campaign-containers/progress.md`; checkpoints instead of commits; demo untouched.
- Scope modes: `all | pick | rule`; rule ops `contains | not_contains`, case-insensitive, AND-combined; `pick` keeps the listed order.
- Demo campaigns (exact names, in this order): "Brand search", "Prospecting – video", "Retargeting – catalog", "Spring launch", "Always-on – leads", "Promo weekend"; statuses active, active, active, paused, active, other.
- Container: slug `container`, component `container_v1`, size 12×4, min 6×3, `data-kind="container"`, default metrics `spend, impressions, clicks, cpc, conversions` (those the catalog has), `rows` default 10 (1–50), `kindOf('container') = 'container'`.
- Every registry in docs/DESIGN.md "v2 — report look and custom widgets" gets a `container` entry.
- Public report First Load JS stays ~106 kB (the card is a server-rendered table).
- Ads blocks = integrations whose `IntegrationDef.category` is the ads category used by `src/lib/catalog/integrations.ts` (read the exact enum value in Task 1 and pin it in a constant `ADS_CATEGORY`).

## Review Focus

- A `pick` scope whose ids no longer exist on the account: generation must ignore them, keep the others, and the source's data note must say "N selected campaigns no longer exist" — pinned by Task 5.
- A `rule` scope that matches nothing: the block's widgets must show an error value "No campaign matches the rule" rather than account totals — pinned by Task 5.
- The container on an account whose connector has no `campaign` breakdown (e.g. GA4): the value is an error "This account has no campaigns" and the drawer does not offer the widget for non-ads blocks — pinned by Tasks 6 and 7.
- Two blocks of the same account with different scopes: the store keys must differ (scope hash) so one does not overwrite the other — pinned by Task 5.
- A comparison period where a campaign had no rows: its `comparison` cell is `null`, the delta is blank — pinned by Task 6.

---

### Task 1: Scope model

**Files:**
- Create: `src/lib/engine/campaigns.ts`
- Modify: `src/lib/engine/types.ts:142-159` (`Campaign` type; `Connector.listCampaigns?`; `daily` filter value `string | string[]`), `src/lib/catalog/integrations.ts` (export `ADS_CATEGORY` and `isAdsSlug(slug)`)
- Test: `tests/v3-campaigns.test.ts`

**Interfaces:**
- Produces: `interface Campaign { id: string; name: string; status: 'active' | 'paused' | 'other'; objective?: string }`; `type CampaignScope = { mode: 'all' } | { mode: 'pick'; ids: string[] } | { mode: 'rule'; rules: { op: 'contains' | 'not_contains'; text: string }[] }`; `scopeSchema` (zod); `applyScope(campaigns: Campaign[], scope?: CampaignScope): Campaign[]`; `scopeIds(scope: CampaignScope | undefined, campaigns: Campaign[]): string[] | undefined` (undefined for `all`); `scopeHash(scope?: CampaignScope): string` (`''` for all/undefined, else 8 hex chars of sha1 of the canonical JSON); `scopeLabel(scope, campaigns): string` ("All campaigns" / "3 campaigns: A, B, C" / 'Name contains "brand"').

- [ ] **Step 1: Failing tests** — `applyScope` with `pick` returns `[c3, c1]` in the listed order and drops unknown ids; `rule` `[contains 'brand', not_contains 'test']` is case-insensitive and ANDed; `all`/undefined returns the input; `scopeIds` undefined for all; `scopeHash` stable and different for different picks; `scopeSchema` rejects an empty `ids` and a rule with empty text.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5: Checkpoint.**

### Task 2: Meta connector

**Files:**
- Modify: `src/lib/connectors/meta.ts:17-28` (`DIM.campaign` gets `idField: 'campaign_id'`), `:57-70` (`insights()` passes `params.filtering` through), `:79-120` (`daily` with `filter.dimension === 'campaign'` → `filtering` JSON, no breakdowns; `breakdown('campaign')` keys rows by `campaign_id`, label `campaign_name`; new `listCampaigns`)
- Create: pure helpers exported from `meta.ts`: `metaDailyParams(range, filter?)`, `metaCampaignRows(rows): BreakdownRow[]`
- Test: `tests/v3-campaigns.test.ts`

**Interfaces:**
- Consumes: `Connector.listCampaigns`, filter `string | string[]`.
- Produces: `metaDailyParams(range, { dimension: 'campaign', value: ['1','2'] })` → `{ time_increment: '1', time_range: …, level: 'account', filtering: '[{"field":"campaign.id","operator":"IN","value":["1","2"]}]' }`; `metaCampaignRows([{ campaign_id: '1', campaign_name: 'A', spend: '10', … }])` → `[{ key: '1', label: 'A', values: { spend: 10, … } }]`; `metaConnector.listCampaigns(ctx)` → `GET /act_<id>/campaigns?fields=id,name,status,objective&limit=200` with paging (`paging.next`), status mapped `ACTIVE → active`, `PAUSED → paused`, else `other`.

- [ ] **Step 1: Failing tests** (pure helpers only; no network): the two cases above plus `metaDailyParams(range)` without filter has no `filtering`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5: Checkpoint.**

### Task 3: Demo campaigns

**Files:**
- Modify: `src/lib/connectors/demo.ts:100-160` (`listCampaigns` for ads slugs; `daily` with a `campaign` filter sums the shares of the chosen ids; `breakdown('campaign')` rows keyed by id with label = name, shares from `demoWeights('camp:<integrationId>', 6, 1.2)`)
- Create: `demoCampaigns(integrationId: number): Campaign[]` exported from `demo.ts`
- Test: `tests/v3-campaigns.test.ts`

- [ ] **Step 1: Failing tests** — `demoCampaigns(1)` returns the six names/statuses in order with ids `c1…c6`; for a demo Meta integration over 2026-09-01..07: the sum over all six filtered `daily` calls equals the unfiltered `daily` per primitive (±0.5 per day for rounding), and `breakdown('campaign')` returns six rows whose `spend` sums to the unfiltered total (±1).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (shares deterministic per integration id; stock prims not split). **Step 4: Run** → PASS. **Step 5: Checkpoint.**

### Task 4: Scope on the integration and the campaigns API

**Files:**
- Modify: `src/app/projects/[id]/page.tsx:87-130` (ads rows get a "Campaigns: <scopeLabel>" line and an "Edit campaigns" link to `?tab=integrations&campaigns=<id>` which renders the editor below the row), `src/app/actions/app.ts` (`updateIntegrationCampaignsAction(fd)`: `integrationId`, `scope` JSON → `scopeSchema` → `Integration.config.campaigns`), `src/lib/api/routes.ts` (`GET /integrations/:id/campaigns` → `{ data: Campaign[] }`; `PUT /integrations/:id` accepts `campaigns`)
- Create: `src/components/campaign-scope-editor.tsx` (client: mode radios; pick = checklist with search and status badges, loaded from `/api/v2/integrations/:id/campaigns`… use a server action `listCampaignsAction(integrationId)` instead of the bearer API; rule = list of `{op, text}` rows; hidden input `scope`)
- Test: `tests/v3-campaigns.test.ts` (action/API) and `tests/api.test.ts` surface list (new route)

- [ ] **Step 1: Failing tests** — `GET /integrations/:id/campaigns` on a demo Meta integration returns six rows (API helper `api(token, 'GET', …)`); `PUT /integrations/:id` with `{ campaigns: { mode: 'pick', ids: ['c1'] } }` stores it in `config.campaigns`; with an invalid scope → 422; listRoutes includes the new path.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5: Checkpoint.**

### Task 5: Scope in generation, the store and blocks

**Files:**
- Modify: `src/lib/layout/types.ts:84-90` (`LayoutBlock.campaigns?: CampaignScope`), `src/lib/layout/compose.ts` (`layoutSchema` block gets `campaigns: scopeSchema.optional()`; `normalizeLayout` keeps it; `storeKey` unchanged, new `scopedKey(integrationId, key, period, scopeHash)` = `${integrationId}:${key}${periodSuffix}${hash ? '#' + hash : ''}`; `valueKey(w, scope?: CampaignScope)` appends `#<scopeHash>` when a scope is given — every caller (`compose`, `ensureWidgetValues`, `layoutFingerprint`, the editor's `rawIdx`) passes the widget's block scope), `src/lib/engine/resolve.ts:88-125` (`dkey` joins array filter values sorted; `want/getDaily` accept the array), `src/lib/engine/report.ts` (`generateReportData` and `ensureWidgetValues`: resolve the scope per ads block — `listCampaigns` once per account per run, `scopeIds`, pass `filter: { dimension: 'campaign', value: ids }` to `resolveWidget`; breakdown widgets filter rows by ids; `sources[i].campaigns`, `campaignNames`, `missingCampaigns`), `src/lib/engine/types.ts` (`SourceStatus.campaigns?: CampaignScope; campaignNames?: string[]; missingCampaigns?: number`), `src/lib/catalog/data-notes.ts` (plan D's note adds "Campaigns: A, B" and "N selected campaigns no longer exist")
- Test: `tests/v3-campaigns.test.ts`

**Interfaces:**
- Produces: `resolveScope(ctx: IntegrationCtx, scope: CampaignScope | undefined, session): Promise<{ ids: string[] | undefined; names: string[]; missing: number; empty: boolean }>`; widgets of a block whose scope resolves to `empty: true` get `{ type: 'error', code: 'no_data', message: 'No campaign matches the rule' }`.

- [ ] **Step 1: Failing tests** — a report created with a Meta demo account and a layout block scoped `pick: ['c1','c2']`: after `saveLayout`, the block's spend KPI equals the sum of the two campaigns' spend from `breakdown`; the store has `#<hash>` keys and the unscoped key is untouched; `sources[0].campaignNames` equals the two names; `pick: ['c1','zzz']` → `missingCampaigns === 1`; `rule contains 'nothing-matches'` → every widget of the block is the "No campaign matches the rule" error; two blocks of the same account with different picks keep separate values.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `npm test` (the v2 compose/service tests still pass). **Step 5: Checkpoint.**

### Task 6: The container widget

**Files:**
- Modify: `src/lib/engine/types.ts` (`Component` + `'container_v1'`; `ContainerValue`; `WidgetValue` union), `src/lib/layout/types.ts` (`SPECIAL_SLUGS` + `'container'`; `WidgetCustom.metrics?: string[]; rows?: number; sortBy?: string; showStatus?: boolean; hidden?: string[]`; sizes 12×4 / min 6×3), `src/lib/layout/compose.ts` (`customSchema` fields; component enum; `SPECIAL_COMPONENT.container = 'container_v1'`; `componentOfValue('container')`; `valueKey` for `container` = `${integrationId}:container:${hash(metrics)}${scope hash}`; `renderWidget` branch reading the store), `src/lib/engine/report.ts` (`ensureWidgetValues` resolves `container` via `resolveContainer`), `src/lib/services/export.ts` (one CSV row per campaign: block, campaign, metric columns), `src/lib/api/routes.ts` (serialise `rows`), `src/components/widgets.tsx` (`WidgetCard` dispatch; `kindOf`-style CSS kind), `src/app/globals.css` (`.ctable*`; phone: sideways scroll; print: `tr { break-inside: avoid }`), `src/components/report-editor.tsx:51-71` (`COMP_LABEL.container_v1 = 'Campaign table'`, `SPECIAL_COMPONENT`, `SPECIAL_KEY.container = 'campaigns'`, `SPECIAL_DEFAULT.container`, `kindOf`)
- Create: `src/lib/layout/container.ts` (`resolveContainer`, pure `containerFromRows`), `src/components/container-card.tsx` (`ContainerCard`)
- Test: `tests/v3-campaigns.test.ts`, `tests/v2-widgets.test.ts` (registry parity test extended)

**Interfaces:**
- Produces: `interface ContainerValue { type: 'container'; metrics: { key: string; label: string; format: Format }[]; rows: { id: string; name: string; status: Campaign['status']; values: (number | null)[]; comparison?: (number | null)[] }[]; truncated: number }`; `containerFromRows(rows: BreakdownRow[], prev: BreakdownRow[] | null, metrics: CatalogWidget[], c: WidgetCustom, campaigns: Campaign[]): ContainerValue`; `resolveContainer(ctx, w, range, comparison, session): Promise<ContainerValue | ErrorValue>` (errors: "This account has no campaigns" when the connector lacks `listCampaigns`).

- [ ] **Step 1: Failing tests** — `containerFromRows` sorts by `sortBy` desc, applies `hidden`, truncates to `rows` with `truncated` count, computes virtual metrics per row (cpc = spend/clicks rounded 2, null when clicks 0), fills `comparison` null for a campaign absent in `prev`; `ContainerCard` render shows one `<tr>` per row, the status dot class, deltas, "+2 more"; registries: `componentOfValue`, sizes, `valueKey` with and without scope; CSV export rows.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5: Checkpoint.**

### Task 7: Editor: drawer, settings panel, block scope

**Files:**
- Modify: `src/components/report-editor.tsx` (drawer Customizable tab: "Campaign table" only when the active block is an ads block; `SettingsPanel` dispatch to `ContainerSettings`; block header gear → `BlockScope` control for ads blocks (All / Pick / Rule using `CampaignScopeEditor` from Task 4 with `listCampaignsAction`), writes `block.campaigns`, saves, re-resolves), `src/components/widget-settings/container.tsx` (new: metric multi-select from `useCatalog(source, m => m.component === 'number_v1')`, rows, sort, status switch, hidden campaigns list from the current value)
- Test: `tests/v3-campaigns-browser.test.ts` (NAV_BASE)

- [ ] **Step 1: Browser test (skip without NAV_BASE)** — sign in, open `/reports/1`, add a Campaign table to the Meta block from the drawer, wait for "Saved", assert the editor shows `[data-kind="container"] tr` ≥ 3; open the block gear, choose Pick with the first two campaigns, save, assert the block's first KPI value changed; open `/r/ZqssQLL4Hx7JXQaFkIeUxHbJrkLPZTOj` and assert the table renders; remove the widget and reset the scope to All in `finally` (report 1 must end with 9 blocks and no scope).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5: Checkpoint.**

### Task 8: Wizard step and API

**Files:**
- Modify: `src/components/report-builder.tsx:27-120` (after the integrations list, for each selected ads integration a `CampaignScopeEditor` initialised from `integration.config.campaigns`; sends `campaigns: Record<integrationId, CampaignScope>`), `src/lib/services/reports.ts:9-60` (`CreateReportInput.campaigns?: Record<number, CampaignScope>`; the seeded layout's ads blocks get `campaigns`; generation uses them), `src/lib/api/routes.ts` (`POST /reports` / `POST /dashboards` accept `campaigns`), `src/app/actions/app.ts` (`createReportAction` passes it), `src/app/reports/new/page.tsx` (passes `config.campaigns` per integration to the builder)
- Test: `tests/v3-campaigns.test.ts`

- [ ] **Step 1: Failing test** — `createReport({ …, campaigns: { [meta.id]: { mode: 'pick', ids: ['c1'] } } })` → the layout's Meta block has that scope and `data.sources[meta].campaignNames` is `['Brand search']`; API `POST /reports` with an invalid scope → 422.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5: Checkpoint.**

### Task 9: Docs and final verification

**Files:** `docs/DESIGN.md` (append "v3 — campaigns": scope model, store keys with scope hash, the container registries), `tests/v3-campaigns-browser.test.ts` (wizard shows the campaign control for the demo Meta account).

- [ ] Steps: browser tests with NAV_BASE; `npm test`; `npx tsc --noEmit`; `NEXT_DIST_DIR=.next-v2 npx next build` → `/r/[token]` still ≤ 110 kB; ledger.
