# Ruler Reports — Claude-hosted client demo (design)

Date: 2026-10-23. Status: approved in conversation; this file is the written spec for review.

## Goal

A link the agency can send a client: a Claude-hosted page (claude.ai Artifact, private by default, shareable) that
shows Ruler Reports v3 with every feature, in English and Greek, with the real look and animations, always online and
independent of the agency's PC. It replaces the tunnel demo (`https://….lhr.life/login`) for client presentations.

Success: a client opens the link, signs in with the demo credentials, can reach every screen of the app, can create a
report in the wizard, edit it in the editor and see the client link change, switch a dashboard's period, get an AI
analysis, download the PDF, and switch to Greek — with no script errors and no dead ends.

## Decisions (from the user's answers, 2026-10-23)

- **Hosting:** a Claude-hosted replica. The real server, database and PDF engine cannot run in a Claude page.
- **Brand and data:** Ruler Agency with the sample client projects the v2 database already has (Acme Running Co and the
  others), sample numbers only.
- **Depth:** hybrid — agency screens captured from the real app; the report wizard, editor, client links, dashboards,
  AI analysis and PDF/CSV export live, built from the app's own code.
- **Language:** the viewer's browser decides at first load (Greek browser → Greek), the account menu switches.

## Constraints of a Claude page (from the Artifact contract)

- Static files only: one page plus published supporting files fetched by relative URL; no server, no service worker.
- Scripts only from our own published files or the allowed CDNs; stylesheets from our files or Google Fonts.
- `window.print()`, `alert/confirm/prompt` and `<a download>` do nothing; the address bar never shows internal routes.
- Size: page ≤ 16 MB, each file ≤ 16 MB, ≤ 255 files per publish.
- Runtime capabilities used: `sample` (ask Claude, viewer consent on first use) and `downloads` (save a file, viewer
  confirms). Both may be `null` for some viewers; the page works without them.

## Scope

**Captured screens** (rendered HTML of the real app, English and Greek, scripts removed):
overview; projects list; project page with every tab (overview, integrations, reports, automations, goals, timeline,
settings); reports list; dashboards list; templates list and one template; automations; goals; integrations catalog;
connect wizard (catalog and one platform form); notifications; settings (every tab); metrics catalog; custom metrics;
API docs; not-found. In captured screens links, tabs, the account menu and `<details>` menus work; a submit or a
button that would write shows a toast "Saved in the demo" (Greek: «Αποθηκεύτηκε στο demo»).

**Live parts** (the app's own client code, bundled for the browser):
- Sign-in (`LoginForm`), accepting the demo credentials shown on the page.
- New report / dashboard wizard (`ReportBuilder`) → creates a report in the browser store from sample data.
- Report and dashboard page: header actions, analysis panel, timeline, `ReportEditor` (drag, resize, add metrics and
  custom widgets, Look panel, block options, campaign scope, Preview as client), AI per block and "Analyse all".
- Client links `/r/<token>` and `/d/<token>`: cover (banner / header / none), ruler band, data notes, sources,
  timeline, PDF menu, dashboard period picker and comparison, `?lang` — a client-side mirror of `PublicReport`.
- PDF download: real PDFs rendered by the v2 server at capture time for the sample reports (continuous and one block per
  page, English and Greek), offered through `downloads`. CSV export through `downloads`.
- AI analysis: `sample` with the app's own prompts and facts; fallback to the app's rule-based analysis
  (`heuristicAnalysis`, `heuristicBlock`) when `sample` is unavailable, refused or fails, with the note the app shows.
- Reports created or edited persist in the viewer's browser (localStorage, try/catch); "Reset demo" in the account menu
  restores the start state. A report created in the wizard is added to the top of the captured reports/dashboards list.

**Out of scope:** real data and connectors, e-mails, webhooks, automations running, saving on captured screens, shared
state between viewers, the Studio deck, OAuth flows, the API itself (its docs page is captured).

## Architecture

All new code lives in `demo-host/` inside `E:\Claude\ruler-reports-v2`; the app's own source is imported, never edited.

1. **Capture** (`demo-host/capture.ts`, Playwright + Prisma, run against a v2 server): signs in as throw-away users
   (removed afterwards), visits the route list, saves each page's `.frame` HTML (scripts,
   Next attributes and preload links removed) to `views/<lang>/<route-key>.html`; saves the compiled CSS and the font
   files it references (URLs rewritten to relative); saves referenced images; renders the PDFs through `/api/pdf`;
   exports `seed.json` from `dev.db` for company 1 (branding; 9 projects; 42 integrations without credentials; 11
   templates; goals; timeline; all 12 reports and dashboards with layout, data, analysis, theme — about 0.3 MB).
   Report 7 ("dsd", a scratch report) is left out of the seed and removed from the captured lists. The throw-away users
   are `demo-en@demo.local` and `demo-el@demo.local`. Re-runnable; output in `demo-host/build/`.
2. **Browser server** (`demo-host/src/server/`): `store.ts` (seed + localStorage overlay, reset), `actions.ts`
   (the server actions the live components import, same names and result shapes, backed by the store),
   `engine.ts` (report generation and new-widget values with the app's resolve + demo connector + compose, no database),
   `ai.ts` (sample → html, fallback to the heuristics).
3. **Shims** resolved by the bundler: `@/lib/db` (throws if reached), `@/app/actions/app` and `@/app/actions/editor`
   (→ actions.ts), `next/navigation` and `next/link` (→ the demo router), `node:crypto` (browser hash and random),
   `@/lib/crypto` (no decryption needed), and any other server-only module the live graph pulls in.
4. **Live views** (`demo-host/src/views/`): client mirrors of the server pages for the live routes (`LoginView`,
   `ReportPageView`, `PublicReportView`, `NewReportView`) reusing the app's components and markup classes.
5. **Shell and router** (`demo-host/src/shell.tsx`): an in-memory router over app paths; a click on any internal link
   (captured or live) routes in place; captured views are fetched, injected and wired (toasts on forms, language links);
   the language and the signed-in state live in the shell; the `.frame` chrome is shared so navigation never flashes.
6. **Build** (`demo-host/build.mjs`): esbuild bundles React and the live graph to `app.js`; copies CSS, fonts, views,
   PDFs, images and `seed.json`; writes `index.html` (title, fonts, tokens for the loading state, the mount point).
7. **Test** (`demo-host/test.mjs`): serves `demo-host/build/` on a local static server with a CSP like the Artifact's,
   then Playwright signs in, visits every route in both languages, asserts no page errors, drags a widget, adds a metric,
   changes the cover, opens the client link, switches a dashboard preset, runs the AI fallback, and checks the PDF and
   CSV handlers are wired.

## Data flow

`seed.json` → store (memory + localStorage overlay) → live views and actions. Editor saves go through
`saveLayoutAction` → store → engine values for new widgets → `{ layout, data }` back to the editor, exactly the shape the
real action returns. The client link renders from the same store, so edits show at once. Captured views never read the
store, except the reports/dashboards list, which gets the demo-created rows injected at the top.

## Error handling

- A view file that fails to load shows an error card with "Back"; an unknown route shows the captured not-found view.
- `sample` `null`, refused, rate-limited or failing → rule-based analysis, and the toast names which was used.
- `downloads` `null` → the PDF and CSV entries say "Download not available in this view" instead of failing silently.
- localStorage unavailable → the demo works for the session and the reset button is hidden.

## Size budget

`app.js` ≤ 3 MB, CSS + fonts ≤ 1 MB, views ≈ 70–90 files ≤ 12 MB in total, PDFs ≤ 4 MB, `seed.json` ≤ 1 MB; well under
the 255-file and 64 MB per-publish limits. Views load on demand, so the first paint fetches only the shell, CSS and the
first view.

## Testing and verification

Local: `demo-host/test.mjs` green, `npx tsc --noEmit` unaffected (demo-host has its own tsconfig), the app's own test
suite untouched. After publishing: open the artifact once, sign in, visit the editor and a client link, and read the
console; report to the user what was exercised and what could not be (consent prompts for `sample` and `downloads`
behave per viewer).
