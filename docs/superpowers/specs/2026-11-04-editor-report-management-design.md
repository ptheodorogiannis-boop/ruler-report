# Editor and report management (2026-11-04)

Branch `v4`. Sub-project A of the user's improvement list of 2026-11-04, approved in chat section by section (all
recommended options except the period change, where the user chose "re-pull and rewrite the AI analysis").
Sub-projects B (richer live data: conversion types, GA4 page title, ad/post previews, table builder, metrics
research) and C (a real Matomo connector) get their own specs.

## Goal

Remove the daily friction of building reports:

1. **Archive and delete** reports and dashboards from the list, not from a collapsed panel.
2. **Change a report's period** in the editor; the numbers and the AI analysis follow.
3. **Add a metric where you are**: right-click in a channel block instead of scrolling to the block header.
4. **Find a metric quickly**: one picker with search, filter chips and groups in a fixed order; metrics a channel
   cannot return are not offered.
5. **Mark what matters**: star table rows; the client link and the PDF show them highlighted.
6. **Ask your data** in the editor suggests questions, like the client link already does.

Success: a report can be put away and brought back in two clicks; a monthly report is moved to the next month without
rebuilding it; adding a metric to the fifth block of a long report needs no scrolling; Google Ads offers only metrics
that load.

## Out of scope

Everything in B and C. Dashboard presets (dashboards keep their live presets; the period control is for reports
only). Cell-level highlighting, notes on starred rows, a "/" key and a hover "+" button (offered, not chosen).
The existing `DELETE /api/v2/reports/:id` stays a hard delete for API users.

---

## 1. Archive and delete

### Data

`Report.archivedAt DateTime?` (null = active), with `@@index([companyId, kind, archivedAt])`. Applies to reports and
dashboards alike. Pushed to dev, mock and test databases; the production build pushes it to Neon as before.

### Rule for public routes

One helper, `publicReportWhere(token, kind?)` in `src/lib/share.ts`, returns
`{ shareToken: token, shareEnabled: true, archivedAt: null, ...(kind ? { kind } : {}) }`. Every public lookup uses it:

- `src/app/r/[token]/page.tsx`, `src/app/d/[token]/page.tsx` (metadata)
- `src/components/public-report.tsx`
- `src/app/actions/public.ts`
- `src/app/api/pdf/[token]/route.ts`
- `src/app/api/public/ask/[token]/route.ts`

Archiving never touches `shareEnabled`, so Restore brings the link back exactly as it was (same URL; a link that was
off stays off). An archived report answers the same 404 as a disabled link.

### UI

- **List** (`report-index.tsx`): an **Active / Archived** switch beside the project filter (`?archived=1`); the
  query adds `archivedAt: null` or `archivedAt: { not: null }`. Each row gets a "⋯" menu:
  - active: Open, Duplicate, Archive;
  - archived: Restore, Delete permanently (a dialog asks for the report's name typed exactly; the button stays
    disabled until it matches).
- **Report page** (`report-page.tsx`): the Delete button inside "Sharing & delivery" becomes **Archive**; an archived
  report shows a quiet banner "Archived · the client link is off" with **Restore**.
- Project page lists and the search dialog (`searchAll`) skip archived reports.

### Actions

`archiveReportAction`, `restoreReportAction`, `deleteReportAction` (now refuses unless `archivedAt` is set and the
typed name matches) in `src/app/actions/app.ts`, writers only, scoped to the principal's company and projects.
Automations keep running; an archived report is never refreshed (`refreshReportAction` and `changeReportPeriod`
refuse with "Restore the report first").

## 2. Changing the period

### Control

A date control in the editor toolbar (`report-editor.tsx` toolbar row, reports only): the app's existing presets
(`src/lib/util/dates.ts` `Preset`: Previous month, Last 30 days, This month, This quarter, Last 90 days, Year to date)
and Custom (two dates). Ruling: the approved sketch named "Previous quarter", which the app has no preset for; the
existing presets are used and Custom covers any quarter.

Comparison selector beside it: Previous period, Previous year, None, Custom. Its default is inferred from the stored
comparison: equal to `previousPeriod(old)` → Previous period; equal to `previousYear(old)` → Previous year; null →
None; anything else → Custom (the user picks the new comparison dates). Ruling: reports store comparison dates, not
a rule, so "moves with the same rule" means this inference.

### Service

`changeReportPeriod(reportId, companyId, input: { start: string; end: string; comparison: 'previous_period' | 'previous_year' | 'none' | DateRange })`
in `src/lib/services/report-period.ts`:

1. Validate (`isDate`, start ≤ end, not archived).
2. Build the new snapshot with `snapshotReport({ ...report, startDate, endDate, comparisonStart, comparisonEnd })`
   without writing anything.
3. **All-or-nothing check**: an integration that had at least one value in the old snapshot and returns only errors
   in the new one aborts the change; the error names it ("Meta Ads – Ruler: Credentials expired"). Nothing is saved.
4. Rewrite the AI analysis cards (`Report.analysis`, `author: 'ai'`): a block card with `analyseBlock` for its block
   and tone; a top card with `analyse`. A card whose rewrite fails (no key, rate limit) keeps its text and gets the
   stale note plus "Couldn't rewrite: try Regenerate".
5. Cards a person wrote (`author: 'human'`) and `analysis` text widgets in the layout keep their text and get
   `staleFor: { start, end }` (the old range); the card shows "Written for 1–31 Oct 2026", which clears on the next
   edit of that card or widget.
6. One `db.report.update`: dates, comparison, `data`, `dataSyncedAt`, `analysis`.

Widgets with their own `custom.period` keep it. The action shows "Updating numbers…" while it runs and revalidates
the report page.

`AnalysisCard` gains `staleFor?: DateRange`; `WidgetCustom` gains `staleFor?: DateRange` for `analysis` widgets.

## 3. Metric picker

`src/components/metric-picker.tsx` (client) replaces the list inside `AddMetricsPanel` (`report-editor.tsx` ~800-953)
and is reused by the right-click box. Props: the block's integration, `existing: Set<string>` (metric keys already in
the report), `onPick(metric)`, `variant: 'panel' | 'popover'`.

- **Search** across title and description, accent-folded (the fold from `list-filter.tsx`, moved to
  `src/lib/util/text.ts`).
- **Chips**: All, KPI, Chart, Table (from the catalog component).
- **Groups** in a fixed order per archetype family, declared in `src/lib/catalog/groups.ts`
  (`GROUP_ORDER`, keyed by archetype id, each an ordered list of group ids); a group not listed sorts last. Group names become i18n keys
  (`catalog.group.<id>`), EL and EN. Groups collapse; the header shows the count.
- **Ticks** on metrics already in the report; picking one again is allowed (a second widget).
- **Only metrics the channel can return**:
  - the platform-split variants ("… on Facebook", "… on Instagram") move from the ADS archetype to the integration
    definition (`integrations.ts`: `variants` on Meta Ads only); Google Ads, TikTok Ads and the other ads platforms
    no longer list them;
  - catalog entries whose primitives are in the connector's `unsupported` list are left out of the picker
    (`resolve.ts` already refuses them).
- Keyboard: arrows move, Enter picks, Esc closes (popover) or clears the search (panel).

The `/api/v2/metrics` response keeps every entry for API users; the filtering is a picker concern
(`pickableMetrics(def, catalog)` in `src/lib/catalog/pickable.ts`, unit-tested).

## 4. Right-click menu

`src/components/block-menu.tsx`. Right-click inside a channel block, on a widget or on empty space, opens a small menu
at the cursor:

- **Add metric here**: opens the picker as a popover at the same spot; the pick is inserted right after the clicked
  widget (same row if it fits, otherwise the next row), or at the end of the block from empty space.
- **Duplicate** (widget only), **Remove** (widget only).

Shift + right-click keeps the browser's own menu. The menu closes on Esc, outside click or scroll. Inserting uses
the editor's existing layout functions, so autosave and Undo/Redo cover it.

## 5. Row stars

- `WidgetCustom.starredRows?: string[]`: row names (the table's first-column label), kept even when a re-pull drops
  the row, shown again if it comes back.
- Editor: hovering a row in `TableCard` shows a ☆ at the row's start; click toggles. Only in the editor.
- Client link, live dashboard, PDF and print: starred rows get `.row-starred`: `background: var(--row-star)` (the
  report accent at low strength, a new token in `globals.css` with a print value) and `font-weight: 600`.
- Container (campaign) tables and the GA4/Search Console tables all use `TableCard`, so all of them can be starred.

## 6. "Ask your data" suggestions

`suggestedQuestions(data, locale, audience: 'client' | 'agency')` in `src/lib/ai/insights.ts`. The client set stays
as it is. The agency set adds "Which ad performed best?" when the report has an ads source and "What should I tell the
client this month?". `AskBox` (`src/components/ask-box.tsx`) shows up to three as buttons above the input; a click
asks. AskBox's hard-coded English moves to i18n keys.

---

## 7. Errors

- Period change: all-or-nothing as in §2; the dialog shows the named source and keeps the old period selected.
- Archive: public routes 404 as for a disabled link; refresh and period change refuse on an archived report.
- Delete: only from Archived and only with the typed name; anything else is refused server-side as well.
- Stars and the right-click menu change only the layout (autosave, Undo/Redo).

## 8. Testing

TDD, as in the previous plan.

- Service and route tests (`node:test` via tsx, `test.db`):
  - archive → restore round trip; `publicReportWhere` used by the page, PDF and Ask routes (404 while archived);
  - a link that was off stays off after Restore;
  - delete refused when not archived or when the name does not match;
  - `changeReportPeriod`: re-pulls with the new dates; rewrites only AI cards; human cards and analysis widgets
    get `staleFor`; a failed AI rewrite keeps the text; an integration with only errors aborts and changes nothing;
    comparison inference for the four cases;
  - `pickableMetrics`: Google Ads has no "on Facebook/Instagram" entries; Meta Ads keeps them; unsupported primitives
    are dropped; group order follows `GROUP_ORDER`;
  - `suggestedQuestions(..., 'agency')`.
- Browser tests (mock server on 3106, as before):
  - right-click a widget → Add metric here → the new widget sits right after it;
  - picker search, chips and collapsing groups;
  - star a row → the client link shows `.row-starred`;
  - the Active / Archived switch and Restore;
  - the date control changes the numbers on the page.
- Hallmark sloplint stays at 0 FAIL / 0 WARN; `npm run i18n:review` passes for the new keys.

## 9. Constraints

- Another session has uncommitted edits in this checkout (among them `src/components/report-rows.tsx`,
  `src/app/reports/[id]/studio/page.tsx`, `package.json`, `package-lock.json`). Those files are never staged by
  this work; where the list menu needs `report-rows.tsx`, the plan says how to avoid overwriting the other edits.
- Production (`main`) is updated only with the user's explicit OK, as before.
