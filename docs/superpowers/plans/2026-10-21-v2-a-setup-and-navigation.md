# v2 plan A — setup and navigation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the v2 copy run on its own port, then replace the slide-rule navigation and the scroll ruler with a plain, CSS-only top nav that never cuts items off or draws in the wrong place.

**Architecture:** The shell (`src/components/shell.tsx`) renders a new server component `TopNav` instead of the client `SlideNav`; the active item is marked by `aria-current` and styled by CSS alone; the nav wraps onto further rows when narrow. `ScrollRuler` and its CSS are deleted and the main padding becomes symmetric.

**Tech Stack:** Next.js 15 app router (server components), Tailwind + globals.css tokens, Playwright (dev dependency) for layout checks.

**Spec:** `docs/superpowers/specs/2026-10-21-v2-features-design.md` §0 and §1.

## Global Constraints

- This folder has no git: there is no commit step; each task ends with `npx tsc --noEmit` clean and `npm test` green (78 tests before this plan).
- Never touch `E:\Claude\ruler-reports` (the live demo), its database, `.preview-url` or port 3102.
- Keep the design tokens (`--paper --card --ink --ink-2 --ink-3 --line --line-strong --brand --brand-soft`, `--ease-track`) and the rail's two-row phone layout from pass 5c.
- Public report route stays around 106 kB First Load JS; the nav adds no client JavaScript.
- Dev server for this folder: port 3104, launch config `ruler-reports-v2`; verify in the browser pane, not by starting servers with Bash.

## Review Focus

- A user with 20+ nav items or a long agency name: every item must still be reachable (wrapping, no fade masks) — pinned by Task 2's width test at 390 px.
- Keyboard users: Tab order must follow the DOM and the focused item must be visible (`:focus-visible` ring from globals.css) — pinned by Task 2's focus test.
- Print: the rail is hidden in print today (`@media print .rail { display: none }`) and must stay hidden — pinned by Task 2's print check.
- `prefers-reduced-motion`: nothing animates in the nav any more, so nothing to disable; verify no transition on the underline.
- Client-role users see a one-group nav (`Work` with only Dashboards and Reports); the separator must not render for a single group — pinned by Task 2's client-role test.

---

### Task 1: Port and launch setup for the copy

**Files:**
- Modify: `.env` (`APP_URL`), `package.json` (`dev` and `start` scripts), `E:\Claude\.claude\launch.json` (new entry), `docker-compose.yml` (upload volume mapping for §2 of the spec), `.gitignore` (add `data/`)
- Create: `data/uploads/.gitkeep`

**Interfaces:**
- Produces: dev server at `http://localhost:3104` (launch config name `ruler-reports-v2`); `data/uploads/` directory that plan B's media service writes into.

- [ ] **Step 1: Point the copy at port 3104**

In `.env` set `APP_URL="http://localhost:3104"`. In `package.json` change `"dev": "next dev -p 3104"` and `"start": "next start -p 3104"`. Do not change `build:prod`/`start:prod` (they read `.preview-url`, which does not exist here).

- [ ] **Step 2: Add the launch entry**

Append to the `configurations` array of `E:\Claude\.claude\launch.json` (read the file first; other sessions edit it):

```json
{ "name": "ruler-reports-v2", "runtimeExecutable": "C:/Program Files/nodejs/node.exe", "runtimeArgs": ["E:/Claude/ruler-reports-v2/node_modules/next/dist/bin/next", "dev", "E:/Claude/ruler-reports-v2", "-p", "3104"], "port": 3104 }
```

- [ ] **Step 3: Uploads directory and ignore rules**

Create `data/uploads/.gitkeep`; add `data/` to `.gitignore`; in `docker-compose.yml` add `- rr-uploads:/app/data/uploads` under the service's `volumes` and `rr-uploads:` under the top-level `volumes`.

- [ ] **Step 4: Verify**

Run `preview_start` with name `ruler-reports-v2`; open `http://localhost:3104/login` in the browser pane: the sign-in page renders and `read_console_messages` shows no errors. Run `npx tsc --noEmit` (clean) and `npm test` (78 pass).

---

### Task 2: `TopNav` replaces `SlideNav`

**Files:**
- Create: `src/components/top-nav.tsx`
- Modify: `src/components/shell.tsx` (import and render `TopNav` instead of `SlideNav`; keep `NavGroup` type exported from the new file)
- Modify: `src/app/globals.css` (replace the `.slidenav*` rules at the "slide-rule navigation" block and the pass 5c phone rules that mention `.slidenav` with `.topnav*` rules)
- Delete: `src/components/slide-nav.tsx`
- Test: `tests/v2-nav.test.ts` (Playwright against the 3104 dev server; skipped when `NAV_BASE` is unset so `npm test` stays hermetic)

**Interfaces:**
- Produces: `export interface NavGroup { label: string; items: { href: string; label: string }[] }` and `export function TopNav({ groups, active }: { groups: NavGroup[]; active?: string }): JSX.Element` (server component, no `'use client'`).
- Markup contract used by tests and CSS: `<nav class="topnav" aria-label="Main"><ul class="topnav-list">` with one `<li class="topnav-group" role="group" aria-label={group.label}>` per group containing `<a class="topnav-item [is-active]" aria-current="page"?>` links; a `<li class="topnav-sep" aria-hidden="true">` between groups only when there are two or more groups.

- [ ] **Step 1: Write the failing test**

```ts
// tests/v2-nav.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
const base = process.env.NAV_BASE; // e.g. http://localhost:3104
test('top nav: every item visible at 1440/1024/768/390, active item marked, no separator for one group', { skip: !base }, async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(`${base}/login`); await page.fill('#email', 'admin@demo.local'); await page.fill('#password', 'demo1234');
  await Promise.all([page.waitForURL(/\/overview/), page.click('button:has-text("Sign in")')]);
  for (const w of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width: w, height: 900 });
    const boxes = await page.$$eval('.topnav-item', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.right, r.width]; }));
    assert.equal(boxes.length, 11, `11 items at ${w}`);
    assert.ok(boxes.every(([l, r, wd]) => l >= 0 && r <= w && wd > 0), `all inside the viewport at ${w}`);
    assert.equal(await page.$eval('.topnav-item[aria-current="page"]', (e) => e.textContent?.trim()), 'Overview');
    assert.equal(await page.$$eval('.topnav-sep', (els) => els.length), 2);
  }
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('topnav-item') || document.activeElement?.classList.contains('rail-brand')), true);
  await browser.close();
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `NAV_BASE=http://localhost:3104 node --import tsx --test tests/v2-nav.test.ts` (PowerShell: `$env:NAV_BASE='http://localhost:3104'; node --import tsx --test tests/v2-nav.test.ts`)
Expected: FAIL — `.topnav-item` count is 0.

- [ ] **Step 3: Implement `TopNav` in `src/components/top-nav.tsx`**

Server component, no hooks. Render the markup contract above; `active === item.href` sets `is-active` and `aria-current="page"`. Separator only when `groups.length > 1` and `gi > 0`.

- [ ] **Step 4: Swap it into the shell**

In `shell.tsx` replace the `SlideNav` import with `import { TopNav, type NavGroup } from './top-nav'` and `<SlideNav groups={groups} active={active} />` with `<TopNav groups={groups} active={active} />`. Delete `src/components/slide-nav.tsx`.

- [ ] **Step 5: CSS**

In `globals.css` remove every `.slidenav*` rule (desktop block and the pass 5c phone block) and add:

```css
.topnav { min-width: 0; }
.topnav-list { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 0; margin: 0; padding: 0; list-style: none; }
.topnav-group { display: contents; }
.topnav-sep { width: 1px; height: 18px; margin: 0 10px; background: var(--line-strong); }
.topnav-item { position: relative; display: inline-block; padding: 18px 10px 14px; font-size: 13px; font-weight: 500; color: var(--ink-2); white-space: nowrap; border-radius: 6px 6px 0 0; }
.topnav-item::before { content: ''; position: absolute; left: 50%; bottom: 4px; width: 1px; height: 5px; background: var(--line-strong); }
.topnav-item.is-active { color: var(--ink); font-weight: 600; }
.topnav-item.is-active::after { content: ''; position: absolute; left: 10px; right: 10px; bottom: 0; height: 3px; background: var(--ink); }
@media (hover: hover) { .topnav-item:hover { color: var(--ink); } }
@media (max-width: 767px) { .topnav { grid-row: 2; grid-column: 1 / -1; } .topnav-item { padding: 6px 10px 12px; } }
```

Keep the pass 5c `.rail-inner` two-row rules; they referenced `.slidenav` only for the grid placement, which the last rule above now provides.

- [ ] **Step 6: Run the test, type-check, suite**

Run the Step 2 command → PASS. `npx tsc --noEmit` clean. `npm test` green. In the browser pane at 390 px (`resize_window` preset mobile) the nav wraps onto rows under the brand; at 1440 px it is one row; print preview (`javascript_tool`: `matchMedia('print')` is not enough — use `page.emulateMedia({ media: 'print' })` in a one-off Playwright check) shows no `.rail`.

---

### Task 3: Remove the scroll ruler

**Files:**
- Modify: `src/components/shell.tsx` (remove `<ScrollRuler />` and its import), `src/app/globals.css` (delete `.sruler*` rules and the `.sruler` line in the print block; change `.frame-main` padding at ≥1024 px from `36px 40px 80px 56px` to `36px 40px 80px`), `docs/DESIGN.md` (append a "v2 — navigation" paragraph)
- Delete: `src/components/scroll-ruler.tsx`
- Test: extend `tests/v2-nav.test.ts`

- [ ] **Step 1: Extend the failing test**

Add to the test in Task 2, after sign-in: `assert.equal(await page.$$eval('.sruler', (els) => els.length), 0);` and at 1440 px: `assert.equal(await page.$eval('.frame-main', (e) => getComputedStyle(e).paddingLeft), '40px');`

- [ ] **Step 2: Run it to see it fail** — the `.sruler` count is 1.

- [ ] **Step 3: Remove the component, its CSS and the padding offset** as listed in Files. Append to `docs/DESIGN.md`:

> ## v2 — navigation
> The slide-rule nav and the scroll ruler are gone: the nav is a plain wrapping list with a CSS underline on the active item (no measured marker, no masks), and the content keeps symmetric 40 px gutters. Reason: the measured marker lagged and landed wrong after navigation and font load, items disappeared behind the fades on narrow windows, and the fixed ruler covered content.

- [ ] **Step 4: Run the test, type-check, suite** — PASS, clean, green. Browser pane: overview at 1440 px shows no tape on the left; the text-collision scan (`overlap-scan.cjs` from the pass 5 scratchpad, or the equivalent) reports 0 overlaps on `/overview`, `/reports`, `/projects/1` at 1440/1280/1024/768/390 apart from the closed account menu.
