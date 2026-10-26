# v2 plan B — media service, client logos, platform icons, Look panel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Images can be uploaded and served; every client shows a logo or monogram; every platform shows its brand mark; a report can carry its own accent, palette, cover image and per-block colours.

**Architecture:** A `Media` table plus files under `data/uploads/<companyId>/<id>.<ext>` behind `POST /api/media` and `GET|DELETE /api/media/[id]`; a client `MediaPicker` returns `{ url, width, height }` to any form. `ClientMark` and `PlatformIcon` are server components used wherever a client or platform is named. Theme lives in `ReportLayout.theme` (zod-validated), composed through to rendering as CSS variables.

**Tech Stack:** Next.js route handlers (`NextRequest`/`NextResponse`), Prisma (SQLite), zod, `simple-icons` (CC0), node:test + tsx, Playwright for smoke checks.

**Spec:** `docs/superpowers/specs/2026-10-21-v2-features-design.md` §2–§5.

## Global Constraints

- No git here: each task ends with `npx tsc --noEmit` clean and `npm test` green (the suite pushes a throw-away DB from `prisma/schema.prisma`, so schema changes are picked up automatically).
- Never touch `E:\Claude\ruler-reports`.
- Upload rules from the spec: `image/png`, `image/jpeg`, `image/webp`, `image/gif` only; 5 MB max (`5 * 1024 * 1024` bytes); no SVG.
- Media ids are cuids (Prisma `@default(cuid())`); file extension from the mime whitelist only (`png|jpg|webp|gif`); never derive a path from user input.
- Public report First Load JS stays around 106 kB: `ClientMark` and `PlatformIcon` are server components (inline SVG, no client JS); the picker is a client component used only on signed-in pages.
- Roles: `canWrite` (owner/admin/editor) may upload; `canAdmin` may delete; `client`/`viewer` get 403.

## Review Focus

- A 5 MB+1 byte upload or a `.svg` renamed to `.png`: the server must reject on size and on sniffed/declared mime, not only on the file name — pinned by Task 2's tests (size, mime).
- A deleted media id still referenced by a widget, cover or logo: pages render a neutral placeholder, never a broken image — pinned by Task 3's `onError` test and Task 5's placeholder assertion.
- Theme with an invalid colour (`#zzz`, `red`, a `url(...)`) coming through the editor's save: rejected by zod, the previous layout kept — pinned by Task 9's tests.
- A project whose name starts with a non-Latin letter (Greek clients): the monogram must show that letter, upper-cased — pinned by Task 4's test with `Όμιλος`.
- A block colour too close to white: the KPI highlight border and badge must stay visible — Task 10 clamps the block colour's lightness (mix with ink when luminance > 0.85) and tests it.

---

### Task 1: `Media` model and file store

**Files:**
- Modify: `prisma/schema.prisma` (add model), `src/lib/db.ts` (nothing), `.gitignore` (done in plan A)
- Create: `src/lib/media/store.ts`
- Test: `tests/v2-media.test.ts` (new file; uses `makeCompany` from `tests/helpers.ts`)

**Interfaces:**
- Produces (store.ts): `export const MEDIA_MIME: Record<'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif', 'png' | 'jpg' | 'webp' | 'gif'>`; `export const MEDIA_MAX_BYTES = 5 * 1024 * 1024`; `export function mediaDir(companyId: number): string` (absolute, under `process.env.MEDIA_DIR ?? path.join(process.cwd(), 'data', 'uploads')`); `export async function putMedia(input: { companyId: number; projectId?: number | null; name: string; mime: string; bytes: Buffer; width?: number; height?: number }): Promise<{ id: string; url: string; width: number | null; height: number | null }>` (validates mime and size, writes the file, inserts the row; removes the file if the insert fails); `export async function readMedia(id: string): Promise<{ mime: string; path: string; size: number } | null>`; `export async function deleteMedia(id: string, companyId: number): Promise<boolean>`; `export const mediaUrl = (id: string) => \`/api/media/${id}\``.
- Prisma: `model Media { id String @id @default(cuid()) companyId Int company Company @relation(...) projectId Int? name String mime String size Int width Int? height Int? createdAt DateTime @default(now()) }` plus `media Media[]` on `Company`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/v2-media.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { db } from '../src/lib/db';
import { makeCompany } from './helpers';
import { MEDIA_MAX_BYTES, deleteMedia, mediaDir, putMedia, readMedia } from '../src/lib/media/store';
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ff0f000101010079c0b9890000000049454e44ae426082', 'hex'); // 1×1 png
test('media store: put writes file + row, read streams it, delete removes both', async () => {
  const { company } = await makeCompany();
  process.env.MEDIA_DIR = 'prisma/test-uploads';
  const m = await putMedia({ companyId: company.id, name: 'dot.png', mime: 'image/png', bytes: PNG, width: 1, height: 1 });
  assert.match(m.url, /^\/api\/media\/[a-z0-9]+$/);
  const r = await readMedia(m.id);
  assert.equal(r?.mime, 'image/png');
  assert.deepEqual(readFileSync(r!.path), PNG);
  assert.ok(r!.path.startsWith(mediaDir(company.id)));
  assert.equal(await deleteMedia(m.id, company.id + 1), false, 'another company cannot delete');
  assert.equal(await deleteMedia(m.id, company.id), true);
  assert.equal(await readMedia(m.id), null);
  assert.equal(await db.media.count({ where: { id: m.id } }), 0);
});
test('media store: rejects svg, unknown mime and oversize', async () => {
  const { company } = await makeCompany();
  await assert.rejects(putMedia({ companyId: company.id, name: 'a.svg', mime: 'image/svg+xml', bytes: PNG }), /type/i);
  await assert.rejects(putMedia({ companyId: company.id, name: 'a.png', mime: 'image/png', bytes: Buffer.alloc(MEDIA_MAX_BYTES + 1) }), /5 MB/);
});
```

- [ ] **Step 2: Run to see it fail** — `npm test` → fails importing `../src/lib/media/store`.

- [ ] **Step 3: Add the Prisma model and implement `store.ts`** with the signatures above (`fs/promises` `mkdir({ recursive: true })`, `writeFile`, `unlink`; error messages: `Unsupported image type` and `Images must be 5 MB or smaller`). Also append `prisma/test-uploads` to `.gitignore` and make `scripts/test.mjs` remove `prisma/test-uploads` with the test DB.

- [ ] **Step 4: Run `npm test`** → the two tests pass, the rest still green. `npx tsc --noEmit` clean. On the dev DB run `npx prisma db push` (the dev server must be stopped, or expect the EPERM on the engine DLL noted in the hand-over; rerun after stopping it).

---

### Task 2: `/api/media` routes

**Files:**
- Create: `src/app/api/media/route.ts` (POST), `src/app/api/media/[id]/route.ts` (GET, DELETE)
- Test: `tests/v2-media.test.ts` (extend; call the handlers directly like `tests/helpers.ts › api()` does)

**Interfaces:**
- `POST /api/media`: multipart form with `file` (required) and `projectId` (optional); session via `getPrincipal()`; `canWrite` required → 403 otherwise, 401 when signed out; validates with `putMedia`; responds `201 { id, url, width, height }`, `422 { message }` on validation errors. Width/height are read from form fields `width`/`height` (integers the picker sends), ignored when absent.
- `GET /api/media/[id]`: public; 404 when unknown; `Content-Type` from the row, `Cache-Control: public, max-age=31536000, immutable`, `Content-Length`, body streamed from disk (`fs.createReadStream` wrapped with `Readable.toWeb`).
- `DELETE /api/media/[id]`: `canAdmin` of the owning company → `204`; 403 otherwise.

- [ ] **Step 1: Write the failing tests** — `POST` with a session (use `tests/principal.ts` helpers to create a signed-in principal the way `api.test.ts` does for sessions) and a `FormData` with a `File`: expect 201 and a `/api/media/` url; `GET` returns the bytes and the cache header; `DELETE` by a `viewer` is 403, by the owner 204 then `GET` is 404; `POST` without a session is 401; a 5 MB+1 file is 422.

- [ ] **Step 2: Run to see it fail** — route modules do not exist.

- [ ] **Step 3: Implement both route files** (`export const dynamic = 'force-dynamic'`; `await req.formData()`; `Buffer.from(await file.arrayBuffer())`; declared mime from `file.type`, additionally sniff the first bytes: PNG `89 50 4E 47`, JPEG `FF D8 FF`, GIF `47 49 46 38`, WebP `52 49 46 46 … 57 45 42 50`; mismatch → 422 `Unsupported image type`).

- [ ] **Step 4: Run `npm test`** → green; `npx tsc --noEmit` clean.

---

### Task 3: `MediaPicker` client component and the placeholder

**Files:**
- Create: `src/components/media-picker.tsx` (`'use client'`), `src/components/media-image.tsx` (server-safe `<MediaImage>`: an `<img>` that swaps to a placeholder `onError`; the swap needs a tiny client wrapper `media-image-client.tsx`)
- Modify: `src/app/globals.css` (`.media-ph` placeholder: dashed hairline, paper background, centred file name in `--ink-3`, 11 px)
- Test: `tests/v2-media.test.ts` (pure render test of the placeholder markup via `react-dom/server` `renderToStaticMarkup`)

**Interfaces:**
- `export function MediaPicker({ value, onChange, projectId, accept }: { value?: string | null; onChange: (m: { url: string; width: number | null; height: number | null } | null) => void; projectId?: number; accept?: 'image' }): JSX.Element` — a button "Choose image" that opens a panel: drop zone + `<input type="file">`, an "Image URL" text field with "Use", the company's recent media (fetched from `GET /api/media?recent=1` — add this listing to Task 2's `route.ts`: returns `{ items: [{ id, url, name, width, height, createdAt }] }`, newest 24, `canWrite` required), a thumbnail of the current value with "Remove". Reads `naturalWidth/Height` from an `Image()` before uploading and sends them as form fields. Errors shown inline (`role="alert"`).
- `export function MediaImage({ src, alt, className, fit }: { src: string | null | undefined; alt: string; className?: string; fit?: 'cover' | 'contain' }): JSX.Element` — renders the placeholder when `src` is empty; otherwise the client image that swaps to the placeholder on error. Placeholder text: the last path segment of `src` or "No image".

- [ ] **Step 1: Write the failing test** — `renderToStaticMarkup(<MediaImage src={null} alt="x" />)` contains `class="media-ph"` and the text `No image`; with `src="/api/media/abc"` it contains `<img` with `src="/api/media/abc"` and `alt="x"`.

- [ ] **Step 2: Run to see it fail.**

- [ ] **Step 3: Implement the three files.** Keep the picker's panel inside a `<div role="dialog" aria-label="Choose image">` positioned under the button (same `.umenu-panel` shadow treatment).

- [ ] **Step 4: Run the test, `tsc`, `npm test`.** Browser pane: a throwaway page is not needed yet — the picker is exercised in Task 4.

---

### Task 4: `ClientMark` and the project logo form

**Files:**
- Create: `src/components/client-mark.tsx`
- Modify: `src/app/actions/app.ts` (new `updateProjectAction`), `src/app/projects/[id]/page.tsx` (a "Settings" tab with the form: name, logo via `MediaPicker` through a hidden `logo` input, timezone, currency, date format, decimal format), `src/app/projects/page.tsx` (card: `<ClientMark>` replaces the letter tile)
- Test: `tests/v2-marks.test.ts` (pure render tests)

**Interfaces:**
- `export function ClientMark({ name, logo, color, size }: { name: string; logo?: string | null; color?: string; size?: 24 | 32 | 48 }): JSX.Element` — with `logo`: `<span class="cmark" style="--cm:{size}px"><img src alt={name} class="cmark-img"></span>` (`object-fit: contain`, hairline border, radius 8); without: `<span class="cmark cmark-mono" style="--cm;--brand">{first grapheme of name, upper-cased}</span>` (brand colour on `--brand-soft`). Grapheme: `[...name.trim()][0]`.
- `updateProjectAction(_: unknown, fd: FormData)`: fields `id, name, logo, timezone, currency, dateFormat, decimal`; `writer()` + `assertProject`; zod as in `createProjectAction`; `logo` must be empty, start with `/api/media/`, or be an `https://` URL; `revalidatePath('/projects/' + id)`; returns `{ error }`.

- [ ] **Step 1: Write the failing tests** — `renderToStaticMarkup(<ClientMark name="Όμιλος Υγείας" />)` contains `>Ό<`; with `logo="/api/media/x"` contains `<img src="/api/media/x" alt="Όμιλος Υγείας"`; `size={48}` sets `--cm:48px`.

- [ ] **Step 2: Run to see it fail.** - [ ] **Step 3: Implement `client-mark.tsx` + CSS** (`.cmark`, `.cmark-img`, `.cmark-mono` in globals.css), the action, the Settings tab (add `'settings'` to the project page's tab list, write-only), and the projects card swap.

- [ ] **Step 4: Run tests, `tsc`, `npm test`.** Browser pane on 3104: Projects → Acme → Settings → choose an image (any PNG from `public/`) → Save → the card on /projects shows the logo; remove it → the monogram "A" returns.

---

### Task 5: Client mark everywhere

**Files:**
- Modify: `src/app/overview/page.tsx` (board client cell: mark 32 before the name), `src/components/report-rows.tsx` + `src/components/report-index.tsx` (rows need `logo` and `color` in `ReportRow`; mark 24 before the project name in the meta line and 32 in the hover cover), `src/components/report-page.tsx` (mark 32 in the title eyebrow), `src/components/public-report.tsx` (mark 48 above the eyebrow of the cover), `src/components/report-rows.tsx` types
- Test: `tests/v2-marks.test.ts` (extend: `reportToCsv` untouched; a public-report render check is in Task 11 of plan C — here assert via Playwright on 3104 that `/r/<open token>` contains `.cmark`)

- [ ] **Step 1: Failing check** — Playwright (skip without `NAV_BASE`): `/r/ZqssQLL4Hx7JXQaFkIeUxHbJrkLPZTOj` has exactly one `.dossier-cover .cmark`.
- [ ] **Step 2: Run, see it fail.** - [ ] **Step 3: Add the marks** (every placement in Files; pass `project.logo` and the company `brandColor` down; alt = client name).
- [ ] **Step 4: Run, `tsc`, `npm test`; overlap scan at 1440/390 on `/r/…` stays at 0.**

---

### Task 6: Platform icon mapping

**Files:**
- Modify: `package.json` (`npm i simple-icons@15` — exact: `simple-icons@^15.0.0`)
- Create: `src/lib/catalog/platform-icons.ts`
- Test: `tests/v2-icons.test.ts`

**Interfaces:**
- `export function platformIcon(slug: string): { path: string; title: string; hex: string } | null` — maps every `INTEGRATIONS[].slug` to a simple-icons export (`siFacebook`, `siInstagram`, `siYoutube`, `siLinkedin`, `siTiktok`, `siPinterest`, `siThreads`, `siX`, `siMeta` for `facebook_ads`, `siGoogleads`, `siGoogleanalytics`, `siGooglesearchconsole`, `siGooglemybusiness`, `siWoocommerce`, `siShopify`, `siMailchimp`, `siHubspot`, `siKlaviyo`, `siGooglesheets`, …); returns `null` for slugs with no brand (csv, custom data, calls, rest/ingest).
- `export function fallbackGlyph(category: Category): 'table' | 'phone' | 'plug' | 'mail' | 'cart'` — csv/custom → table, calls → phone, email → mail, ecommerce → cart, else plug.

- [ ] **Step 1: Failing test** — for every `INTEGRATIONS` entry: `platformIcon(slug) !== null || fallbackGlyph(category)` is defined; `platformIcon('instagram_business')!.title === 'Instagram'`; `platformIcon('facebook_ads')!.hex` is a 6-hex string.
- [ ] **Step 2: Run, fail (module missing).** - [ ] **Step 3: Install the dependency, implement the map** (import named icons only — never `import * from 'simple-icons'`, it is 3 MB).
- [ ] **Step 4: Run, `tsc`, `npm test`.**

---

### Task 7: `PlatformIcon` component and placements

**Files:**
- Create: `src/components/platform-icon.tsx` (server)
- Modify: `src/components/widgets.tsx` (`PlatformBadge`: icon instead of the dot), `src/components/public-report.tsx` (cover sources), `src/app/integrations/page.tsx`, `src/app/projects/[id]/connect/page.tsx` (the 9×9 coloured tile gets the icon in white on the brand colour), `src/app/projects/page.tsx` (card: icons 16 px instead of dots), `src/components/report-editor.tsx:435` (add-metrics drawer source list), `src/components/report-builder.tsx:182` (source picker), `src/app/reports/new/page.tsx` (passes `slug` so the builder can draw the icon)
- Test: `tests/v2-icons.test.ts` (extend)

**Interfaces:**
- `export function PlatformIcon({ slug, size, tone, className }: { slug: string; size?: 14 | 16 | 20 | 24; tone?: 'brand' | 'ink' | 'white'; className?: string }): JSX.Element` — inline `<svg viewBox="0 0 24 24" aria-hidden="true">` with `<path d>`; `tone="brand"` fills with the integration's catalog colour (keep the app's colour, not simple-icons' hex, so the palette matches the rest of the UI); fallback glyph drawn with the existing nav-icon strokes (`nav-icons.tsx` shapes are `motion` components — do not import them; draw the five fallbacks inline here).

- [ ] **Step 1: Failing test** — `renderToStaticMarkup(<PlatformIcon slug="youtube" />)` contains `<svg` and `fill="#ff0000"`; `slug="csv"` renders the table glyph (`data-glyph="table"`).
- [ ] **Step 2–4 as usual.** Browser pane: `/integrations`, `/projects`, a report's blocks and the public cover show brand marks; the public report First Load JS is unchanged (`NEXT_DIST_DIR=.next-v2 npx next build` prints `/r/[token]` ≤ 110 kB).

---

### Task 8: Theme in the layout model

**Files:**
- Modify: `src/lib/layout/types.ts` (`ReportTheme`, `ReportLayout.theme?`), `src/lib/layout/compose.ts` (`themeSchema`, `layoutSchema.theme`, `normalizeLayout` keeps it, `composeReport` returns `theme` on `ReportData` — add `theme?: ReportTheme` to `ReportData` in `src/lib/engine/types.ts`)
- Test: `tests/layout.test.ts` (extend `normalizeLayout` test)

**Interfaces:**
- `export interface ReportTheme { accent?: string; palette?: 'brand' | 'vivid' | 'calm' | 'mono'; cover?: string; blocks?: Record<string, { color?: string }> }`; `export const HEX = /^#[0-9a-f]{6}$/i`.
- `themeSchema`: `accent` matches `HEX`; `palette` enum; `cover` empty, `/api/media/…` or `https://…`, max 500 chars; `blocks` record of `{ color: HEX }`, max 100 keys.

- [ ] **Step 1: Failing tests** — `normalizeLayout({ version: 1, theme: { accent: '#1a36e6', palette: 'calm', blocks: { b: { color: '#d97a1d' } } }, blocks: [] }).theme` deep-equals the input; `accent: 'red'`, `accent: '#zzz'`, `cover: 'javascript:alert(1)'` each throw; `composeReport(...)` of a layout with a theme returns `out.theme`.
- [ ] **Step 2–4 as usual.**

---

### Task 9: The Look drawer in the editor

**Files:**
- Modify: `src/components/report-editor.tsx` (toolbar button "Look" next to the existing settings entry; a `LookPanel` component in the same file or `src/components/look-panel.tsx` (prefer the new file); block header menu gets "Block colour")
- Create: `src/components/look-panel.tsx` (`'use client'`)
- Test: `tests/layout.test.ts` (the save path: `saveLayout` with a theme persists it — extend the service test)

**Interfaces:**
- `export function LookPanel({ theme, clientColor, onChange, onClose }: { theme: ReportTheme | undefined; clientColor: string; onChange: (t: ReportTheme) => void; onClose: () => void }): JSX.Element` — accent `<input type="color">` + "Use client colour" (deletes `accent`); palette: four radio swatches (strips of 5 colours from `charts.tsx › PALETTES`); cover: `MediaPicker`; the drawer uses the same `.drawer` styling as the settings drawer.
- Block colour lives in the block header's existing menu as `<input type="color">` + "Use platform colour" (deletes `blocks[id]`).
- The editor keeps `theme` in its layout state and autosaves it like widget edits (`saveLayout` already stores the whole layout).

- [ ] **Step 1: Failing service test** — `saveLayout(r, { ...layout, theme: { accent: '#b8321f' } })` then `reportView(r)` → `view.layout.theme.accent === '#b8321f'` and `view.data.theme.accent === '#b8321f'`.
- [ ] **Step 2–4 as usual.** Browser pane: open `/reports/1`, Look → pick a colour → "Saved" → reload keeps it.

---

### Task 10: Rendering the theme (editor, public, dashboard, print)

**Files:**
- Create: `src/lib/layout/theme.ts` (pure: `themeVars(theme, clientColor) → React.CSSProperties` with `--brand`, `--brand-soft` (accent + `1a`), and `blockVars(theme, blockId, platformColor) → { '--block': string }` with the lightness clamp)
- Modify: `src/components/widgets.tsx` (`LayoutSection` sets `blockVars` on the `<section>`; `PlatformBadge` icon tone uses `var(--block)`; `Kpi` highlight border `border-l-[var(--block)]`; `ChartCard` passes `brand={blockColor}`), `src/components/charts.tsx` (`export const PALETTES: Record<'brand'|'vivid'|'calm'|'mono', string[]>`; `TimeChart`/`CategoryChart` accept `palette?: string[]`), `src/components/public-report.tsx` (root `style` merges `themeVars`; cover banner from `theme.cover` via `MediaImage`), `src/components/report-editor.tsx` and `report-page.tsx` (same root vars), `src/app/globals.css` (`.cover-banner` 16:9 rounded; print: half height)
- Test: `tests/v2-theme.test.ts` (pure: `themeVars`, `blockVars` incl. the clamp `blockVars(undefined,'b','#ffffff')['--block'] === '#8b8f94'`-style expectation — define the clamp as mixing 45 % ink `#101418` when relative luminance > 0.85 and assert the exact mixed value you compute)

- [ ] **Step 1: Failing tests** — `themeVars({ accent: '#b8321f' }, '#1a36e6')` → `{ '--brand': '#b8321f', '--brand-soft': '#b8321f1a' }`; without accent → client colour; `blockVars({ blocks: { b: { color: '#0e9f8e' } } }, 'b', '#1877f2')` → `#0e9f8e`; missing block → platform colour; near-white clamps.
- [ ] **Step 2–4 as usual.** Browser pane: the public report of a themed report shows the accent on the band, KPI highlights and the primary chart series; `/d/…` likewise; print preview keeps colours (the existing print CSS does not override variables).
