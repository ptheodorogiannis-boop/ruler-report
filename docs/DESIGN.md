# Design review and system — Ruler Reports (2026-10-21)

Reviewed with the Apple Human Interface Guidelines as principles (web app: foundations and principles apply, platform
conventions do not). Files consulted: `design-principles.md`, `branding.md`, `color.md`, `typography.md`,
`accessibility.md`, `layout.md`, `charting-data.md`, `motion.md`, `writing.md`, `cross-platform.md`.

## Design review: Ruler Reports (before)

### Summary
A capable reporting engine wearing a default SaaS skin: Inter-or-Segoe body, indigo `#4f46e5`, white cards on
`#f6f7fb`, pill deltas, lucide icons. Nothing is wrong with the structure; nothing would be remembered either. The
thesis the product deserves — *an instrument that measures marketing results, and a client report you can trust* —
is not expressed anywhere. Rating: **Needs work** (one Critical contrast failure, several High craft findings).

### Critical
- **Metadata text fails contrast.** `text-slate-400` (#94a3b8) on white is **2.56:1**, on the page background
  **2.40:1**; used 75 times at 11–12 px (KPI "vs" values, captions, timestamps). `text-slate-300` (#cbd5e1) is 1.48:1.
  `accessibility.md › Vision`: "Up to 17 pts … minimum contrast ratio 4.5:1". **Fix**: secondary text #525B66
  (6.9:1 on white), tertiary #6B7480 (4.7:1); remap the Tailwind `slate-400`/`slate-300` steps so every existing
  usage is corrected at once.
- **Ten-pixel labels.** 14 uses of `text-[10px]` (badges, eyebrows, panel headers). `typography.md › Ensuring
  legibility`: desktop minimum 10 pt; 10 px CSS sits below it on standard displays. **Fix**: 11 px floor.

### Improvements
- **High — brand colour used for everything.** Indigo is the primary button, the active nav, links, the sparkline, the
  area chart, the highlight and the logo tile. `branding.md › Best practices`: "Using your brand color too broadly can
  overwhelm your interface and dilute its impact." **Fix**: accent for primary actions, selection, links and the
  starred KPI only; charts get their own palette with the accent as series 1.
- **High — the body font is not loading.** `font-family: Inter` is declared but not shipped, so Windows renders Segoe
  UI and macOS renders Helvetica: the product looks different on every machine. **Fix**: load Inter (latin + greek)
  with `next/font`, which self-hosts it.
- **Medium — deltas as coloured pills.** Green/red pills next to every number are the loudest thing on a KPI card and
  repeat 20–40 times per page. `charting-data.md › Best practices`: "Keep a chart simple". **Fix**: arrow glyph +
  percentage in the signal colour as plain text; the glyph also carries direction for colour-blind readers
  (`color.md › Inclusive color`).
- **Medium — no keyboard focus style, no reduced-motion handling.** `accessibility.md › Vision`, `motion.md › Best
  practices` ("Make motion optional"). **Fix**: `:focus-visible` ring in the accent; `prefers-reduced-motion` kills
  transitions and the one animation.
- **Low — inconsistent capitalisation** ("Refresh data", "Save as template", "CSV", "Print / PDF"): sentence case is the
  app's style; keep it (`writing.md › Best practices`) and drop the stray title-case labels.

### Craft notes
- **No point of view (High).** The three dominant generated looks are avoided, but the result is the fourth one:
  "indigo SaaS". A KPI is a big number over a small label by nature; what is missing is a reason for the type, the
  colour and the one element the report will be remembered by.
- **Structure does not encode information.** Section headers are plain text; the period is a sentence
  ("01/09/2026 → 30/09/2026 · vs …") although the period *is* the measurement.

### What works
The 12-column report grid and its blocks; the hover toolbar on widgets; the sticky editor toolbar with a plain-language
save state; the restrained icon set; the white-label variables (`--brand`, `--brand-soft`) already flowing from the
workspace into every page.

## Direction

**Thesis.** Ruler Reports is the agency's measuring instrument. A report is a ruled, calm document whose numbers you
can trust; the agency's name is literally *Ruler*. Everything quiet except two things: the **ruler band** that draws
the report period as a measured scale, and **numbers set in a display face**.

### Tokens (light; dark variants defined, not yet switched on)

| Role | Light | Contrast | Dark |
|---|---|---|---|
| `--paper` page | `#F4F5F2` | — | `#0F1317` |
| `--card` surface | `#FFFFFF` | — | `#171C21` |
| `--ink` text | `#101418` | 18.5:1 on card, 16.9:1 on paper | `#ECEEF1` (16.1:1) |
| `--ink-2` secondary | `#525B66` | 6.9:1 / 6.3:1 | `#A3ABB6` (7.4:1) |
| `--ink-3` tertiary (≥ 11 px, captions) | `#636D7C` | 5.2:1 / 4.8:1 | `#8A93A0` |
| `--line` hairline | `#E3E6E1` | non-text | `#262D34` |
| `--brand` accent (workspace-configurable; new default) | `#1A36E6` | 7.7:1 on white, white on it 7.7:1 | `#7C8CFF` (5.8:1) |
| `--brand-soft` accent tint | accent at 10 % | accent text on tint 6.6:1 | — |
| `--up` positive signal | `#11784A` | 5.5:1 | `#4BC489` |
| `--down` negative signal | `#B8321F` | 6.0:1 | `#F0796A` |
| Chart series | `#1A36E6 #0E9F8E #D97A1D #7C5CE6 #B8321F #557086 #11784A #8A6D3B` | ≥ 3.1:1 for graphics | same |
| Chart comparison | `#C3C9D2` dashed | — | `#4A535E` |

One colour, one meaning: accent = action / selection / highlighted KPI; green and red = direction of change only;
platform colours live in the small badge dot and nowhere else.

### Type

| Use | Face | Size / line |
|---|---|---|
| Report title (cover) | Bricolage Grotesque 600, optical size on | clamp 30–44 px / 1.05 |
| Page title, block title | Bricolage Grotesque 600 | 24 / 28, 18 / 24 |
| KPI value | Bricolage Grotesque 600, `tabular-nums` | 30 / 32 (28 in 2-col) |
| Body, controls | Inter 400/500/600 | 14 / 20 |
| Table numerals, axes | Inter 500, `tabular-nums` | 13 / 12 |
| Captions, eyebrows | Inter 500/600 | 12 / 11 (floor) |

Two families, loaded with `next/font` (Inter with the Greek subset for the agency's market). Bricolage has no Greek
glyphs: Greek titles fall back to Inter automatically.

### Layout
Sidebar (232 px, three labelled groups) + content (max 1152 px). Public report: a centred 1040 px column, a cover
section that is *not* a card, then the blocks.

```
regular (≥ 1024)                                   compact (< 768)
┌─────────────────────────────────────────────┐    ┌───────────────────────┐
│ ACME RUNNING CO              Demo Agency ▣  │    │ ACME RUNNING CO       │
│ Monthly report                              │    │ Monthly report        │
│ Performance analysis                        │    │ Performance analysis  │
│ |..|..|..|..|..|..|..|..|..|..|..|..|..|..| │    │ |....|....|....|....| │
│ 1 Sep 2026        September        30 Sep   │    │ 1 Sep        30 Sep   │
│  ·· compared with 1–31 Aug 2026             │    │  ·· vs 1–31 Aug       │
├─────────────────────────────────────────────┤    ├───────────────────────┤
│ META ADS · Acme Running Co                  │    │ META ADS · Acme       │
│ Paid media                                  │    │ Paid media            │
│ ┌KPI┐┌KPI┐┌KPI┐┌KPI┐ ┌chart 6×4───────┐     │    │ ┌KPI┐┌KPI┐            │
└─────────────────────────────────────────────┘    └───────────────────────┘
```

### Signature
The **ruler band**: the report period drawn as a scale — one tick per day (per week above 60 days, per month above
a year), taller ticks on Mondays and the 1st, the comparison period as a dashed hairline beneath. It encodes the length
of the period and of its comparison truthfully, it is the one place the agency's name becomes form, and it appears
twice only: large on the client cover, small under the title of the internal report. Nothing else is decorated.

### Motion
One moment: the band's ticks are revealed left to right once on load (600 ms, CSS transform on a mask, nothing else
animates). Off under `prefers-reduced-motion`.

### Critique of the plan
Would the same plan appear for another product? The warm-grey paper and a geometric display face could; the band could
not — it exists because of the name and the job. So the paper is kept neutral (`#F4F5F2`, no cream cast, no serif,
no terracotta), the accent stays a saturated blue rather than a fashionable off-colour, and the display face is spent
on titles and KPI values only. Navigation and controls remain the familiar components with familiar sizes.

What was removed: delta pills, the brand-coloured sparkline, the repeated logo in the public header (name + logo
once), the "LIVE" pill colour (now ink), the gradient under single-series charts is reduced to 12 %.

Quality floor: phone width stacks to two columns with no horizontal scroll; `:focus-visible` on every control;
reduced motion and transparency honoured (no blur anywhere); the largest browser text size keeps the hierarchy because
every size is relative to the root.

## Sequence
1. Accessibility: contrast remap, 11 px floor, focus ring, reduced motion.
2. Conventions: sentence case, consistent labels, familiar controls untouched.
3. Craft: tokens, two typefaces, ruler band, KPI typography, chart palette, quiet deltas.
4. Polish: cover, sidebar groups, login.

## Not done
Dark appearance (tokens exist, no switch wired), report themes (Reportei's 17), per-block colours. Listed in
`replica/features.csv` as before.

---

# Award pass (2026-10-21, /awwwards + /apple-design)

## Brief
Subject: Ruler Reports, the reporting instrument of Ruler Agency (Athens). Audience: the agency's marketers every day,
their clients on shared links. Job: a tool the team is proud to open in front of a client, and a report a client trusts
at a glance. Constraints: existing Next.js 15 + Tailwind app, keep the editor and the data model; no loader, no WebGL
(an app, not a launch page). New asks: login + profiles with procedural avatars (bible-strong avatar lab), animated icons.

## Concepts considered

| | A. The instrument (name) | B. The dossier (material) | C. Charakas / incised marks (place) |
|---|---|---|---|
| Idea | Every number is read off a scale, and the scale is drawn wherever a quantity appears | A report is a bound dossier handed across the table; the app is the desk it sits on | In Greek a ruler is a *charakas*, from *charasso*, to engrave: numbers are marks cut into stone |
| Layout rule | scales, tracks, tick marks; things sit on rails | stacked folders, tabs, spines | incised hairlines on a stone-grey ground |
| Motion verb | slide along a track and click into place | paper sliding out of a sleeve | a line being cut, once |
| Signature | the caliper: a KPI measures itself on hover | opening a report slides the dossier out of the stack | the ruler band is engraved as the page loads |
| Anchor | the name Ruler, and the ruler band already on the cover | how agencies present monthly | the Greek word for ruler |
| O / F / Fe / P | 4 / 5 / 4 / 1 | 3 / 3 / 3 / 4 | 4 / 3 / 3 / 3 |

Pick A: it is the only one that cannot be moved (it is the name), it extends the band already built, and it generates
rules for navigation, buttons, icons, KPIs and the login. Nothing stolen from B or C.

## Concept card
```
Idea:        Ruler Reports is a measuring instrument: every number is read off a scale.
Metaphor:    drafting instruments: ruler, caliper, slide rule, dial gauge.
Signature:   the caliper. Hover or focus a KPI card and a scale extends under the number; the marker travels from
             the previous value to the current one and the delta bracket clicks into place. CSS only, reduced motion
             shows the finished measurement.
Emotion:     precise and calm; a small jolt of delight when something measures itself.
Motion verb: slide along a track and click into place (nav marker, button fill, icon parts, scale markers).
Screenshot:  the client cover with the ruler band, and one KPI mid-measurement.
```

## System additions
- **Palette**: unchanged from the first pass (paper #F4F5F2, ink #101418, accent #1A36E6, signals). Avatars get their own
  eight body colours so identities read apart from the UI accent: #1A36E6 #0E9F8E #D97A1D #7C5CE6 #C2362B #557086
  #11784A #B35C9E, eyes always ink.
- **Type**: unchanged (Inter + Bricolage Grotesque). Caliper readouts in Inter 500 tabular 11 px.
- **Motion language**: one ease `cubic-bezier(0.2, 0.7, 0.2, 1)`; hover 250 to 450 ms; the caliper 600 ms; icons 400 ms.
  Everything is `transform`, `opacity` or `clip-path`. `@media (hover: hover)` guards every hover; `:focus-visible`
  mirrors every hover; `prefers-reduced-motion` keeps the state change and drops the travel.
- **Treatments (one per role)**: nav link = a marker that slides in on the left and the icon's moving part travels;
  primary button = fill slides in from the left; inline link = underline rises; KPI = the caliper; utility links =
  colour only.
- **Idle**: live dashboards carry a "now" marker on their ruler band that breathes slowly (it encodes where the period
  stands). Static reports hold still at rest: the brief is a document, the caliper and the band carry the life.
  Written here as the decision.
- **Login**: the instrument gets a face. A procedural avatar (bible-strong avatar lab, AGPL-3.0) watches the pointer,
  turns into *your* avatar as you type your email (derived from the address, no lookup), and closes its eyes while you
  type your password. Wrong password: a sceptical glance. Success: a happy beat, then the app.
- **Profiles**: every user has a deterministic avatar derived from their email (colour, body shape, roundness), shown
  in the sidebar footer and the team list. No uploads, no defaults that look alike.
- **Icons**: the sidebar icons are drawn in-house (24 px, 1.75 stroke) with one moving part each (needle, flap,
  bars, bolt, plug, bell, gear); the part slides or settles on hover in the motion verb. Everywhere else lucide stays.
- **404**: "Nothing measured here": an empty ruler band with no ticks and a link back.

## Genericness test
A generic model would have shipped: a dark hero, a glow, GSAP fade-ups on every card and a magnetic button. None of
that is here. What changed after the test: the nav hover was going to be a letter roll (seen everywhere); it is now the
slide-in marker plus the icon's own part moving, which is the verb. The login was going to be a split screen with a
gradient; it is a paper page where the only moving thing is the face.


---

# Structure pass (2026-10-21, later the same day)

The award pass kept the skeleton of a SaaS admin: sidebar column, page header, cards. The owner asked for a structure
that is itself the idea. The instrument now organises the page:

- **The rail.** One top bar: the mark and workspace name, the **slide-rule navigation** (sections laid on a single
  track with tick marks; a 3 px ink marker under the current section, a brand-coloured ghost slides to whatever you
  point at or focus), notifications and an account menu (avatar, name, role, settings, sign out). No sidebar column.
- **The scroll ruler.** A fixed measuring tape down the left edge on large screens: every heading of the page is a
  tick with its label set along the tape, the current section is marked in ink, and a brand cursor shows how far down
  the document you are. It reads the DOM, so it is always true; hidden on phones.
- **The board (overview).** Every client is a rail across the page: display name on the left, the headline numbers
  as instrument readouts (display 22 px numerals, the delta beneath, a 96 px caliper under each), an arrow at the end.
  Hairlines only, no cards, no table chrome. Hovering a rail replays every caliper and nudges the name and the arrow
  along the track. Phones: each rail becomes a two-column block.
- **The index (reports, dashboards).** A type-led list: date, display title, client and period. Pointing at a row lifts
  the report's **cover** (client eyebrow, title, its ruler band) beside the pointer on a spring; keyboard focus and
  touch show the same cover anchored under the row. The title slides 6 px along the track on hover.
- **The dossier (client link).** Two columns on large screens: a pinned cover (client, title, subtitle, band with the
  comparison, sources with their platform dots, timeline) and the blocks scrolling beside it. Stacked on phones and in
  print.

Removed: the sidebar, the "Overview" page title, the KPI table and its header strip, the button-styled client links in
the reports list. The page header now carries the measured fact as its title ("6 clients, last 30 days", "4 reports").


---

# QA log (2026-10-21)

Method: `/awwwards` QA loop against the production build on port 3102. `shoot.mjs` photographed the four pages reachable
without signing in (login, a shared report, a live dashboard, the 404) on desktop 1440, a throttled phone at 390,
reduced motion, keyboard focus and hover pairs; `audit.mjs` read the served HTML. A fresh critic subagent scored the
evidence with the rubric and nothing else.

## Pass 1 (first structure, before the critic)
Measured: 0 console errors, 0 serious axe violations after the scroll regions became focusable, mobile LCP 0.6–0.9 s,
CLS 0, 60 fps, no overflow, nothing hidden under reduced motion. Audit: no `<main>` on login/signup, no OG/Twitter
tags, no favicon, no robots, h1 → h3 skip on the report, em dashes in generated copy. All fixed.

## Pass 2 (the structure pass) — critic's verdict
One-sentence idea read from the screenshots: *"a paper-white ruler that measures a client's month"*, legible on the
login and the 404, thinner on the report and the dashboard. **Weighted 6.45** (Design 6.5 · Usability 6 · Creativity
7 · Content 6.5; developer: SEO 7, Animations 6, Accessibility 7, WPO 8, Responsive 4, Markup 6).

Fixes taken from the ranked list, in order:
1. Charts blank on the phone: the chart area was a `flex: 1` box inside an auto-height card, so it had no height.
   Phones now give it 220 px. Verified: six charts at 220 px, 18 axes rendered at 375 px.
2. Chart axes missing on every chart: Recharts resolves axes by direct child type and my refactor had wrapped them in a
   Fragment. They are an array now.
3. Right KPI column and cover text clipped at 390 px: the dossier grid child could not shrink. `min-width: 0` on the
   columns, truncation on source lines, captions that wrap.
4. Empty columns beside a chart that ends a row: seeded charts now widen to the edge when nothing sits to their right.
5. Titles wrapping onto a pipe: the cover shows the title without the client prefix the eyebrow already carries.
6. One number format per page: the analysis writer now takes the project's decimal format.
7. Category bar labels colliding: long labels are shortened with an ellipsis.
8. KPI cards were ten tab stops: `tabindex` removed (scrollable tables and funnels keep theirs for axe).
9. Primary buttons now draw a ruler tick along their bottom edge on hover and focus, on top of the sliding sheen.
10. Shared reports carry the share image in their metadata; login and signup have titles and canonicals; the demo
    credentials hint is dev-only; the 404 has a skip link and sends visitors to the start.

Not fixed on purpose: placeholder-looking rows in demo data ("Post 11", "/page 13") are the synthetic connector's
output and go away with real accounts; no sitemap for a private tool; the critic's suggestion to give the second chart
series its own axis is left for the chart-type work in the editor.

## Decisions written down
- Static reports hold still at rest; live dashboards breathe through the "now" marker.
- The face appears on the login only. Clients see the instrument, not the mascot.

## Pass 3 — second critic's verdict and the fixes taken
Idea read from the screenshots: *"every number is a reading on a ruler"*, with the login face judged as a second idea.
**Weighted 7.0** (Design 7 · Usability 7 · Creativity 7 · Content 7; SEO 7, Animations 7, Accessibility 6, WPO 8,
Responsive 7, Markup 7). Taken from the ranked list: scroll regions as labelled regions with an inset focus ring;
table and funnel cards hug their rows in read-only grids; a chart beside KPIs that would leave a void drops below them
at full width (with overlap resolution); angled bar labels when they are long; sources and timeline follow the blocks
on phones; a taller login form on a 26 rem column, the face at 168 px on phones with the form in the first screen; the
face now sits on a ruler of the current month with today's marker, and the 404 shows the face looking off the scale,
so the two ideas are one; the span label shortens to "21 Sep – 20 Oct 2026"; every caliper measures itself once on
load (staggered by position) and replays on hover; the live marker's pulse is visible; longer descriptions.
Left as is: demo row names, the sitemap (private tool), the 404 title (not-found.tsx cannot export metadata).

## Pass 4 — third critic's verdict and the fixes taken

Same brief, fresh subagent, on the production build after pass 3. **Weighted 7.0** (Design 7 · Usability 7 · Creativity 7 ·
Content 7; SEO 7, Animations 7, Accessibility 8, WPO 7, Responsive 5, Markup 7). Honorable Mention range again; the idea
(the instrument: ruler band, caliper, slide-rule nav, dossier) read clearly, the letdown was the phone.

Confirmed and fixed:

- **Phone column wider than the viewport.** Pass 3 let tables render without an inner scroll so the keyboard would not get
  stuck; the widest table (eight columns) then forced the dossier column past 390 px and clipped the second KPI column and
  the analysis text. Now the dossier grid column is `minmax(0, 1fr)` below 1024 px and table cards scroll sideways inside
  their card on phones only (`overflow-x: auto`, table `min-width: 100%`). Measured at 390 px: document width 390, no
  horizontal scroll, KPI right edge 376, every table region scrollWidth > clientWidth with `overflow-x: auto`.
- **Dashboard band caption wrapped.** The small band dropped the year from the centre label when the range sits inside one
  year (`21 Sep – 20 Oct`); the end labels still carry it. One line at 390 px.
- **Last x-axis label clipped.** Right margin of the bar/line/area charts 8 → 18 px; last tick right edge 802 vs. wrapper
  804 at 1440 px.
- **Live without motion.** The `live` word on a dashboard band now breathes (2.8 s opacity cycle, off under reduced motion).
- **Cover sources repeated the client and the platform** ("Meta Ads · Acme Running Co – Meta Ads") and truncated on phones;
  the account name is now stripped of both and omitted when nothing is left.

Not taken (ranked by the critic, left as follow-ups): lazy-loading recharts/motion on the report (310 KB gz JS), the login
CLS of 0.066 (avatar canvas mounts after the first paint), desktop section voids where a wide chart follows a short row,
the 404 title, the Print/PDF hover underline, a contrast pass on `--ink-3` captions.

## Pass 5 — performance and polish (the third critic's "not taken" list)

Same build line, no new critic. Four of the six follow-ups from pass 4 are taken; the `--ink-3` contrast pass is still
open. Measured with a production build in a scratch dist dir (`NEXT_DIST_DIR=.next-pass5 npx next build`, 2026-10-21)
and with Playwright against that build served on a spare port (fresh contexts, 1440 × 900 and 390 × 844, slow-4G + 4×
CPU throttling for CLS, buffered `layout-shift` entries without recent input). The 3102 server and the tunnel were not
touched, so they still serve the pre-pass-5 build until `.next-prod` is rebuilt.

**Report JS.** Recharts is split off from the widget renderer and fetched only by pages that render a chart; `motion` is
wrapped around the signed-in shell (`AppShell`) instead of the root layout, so public pages ship no motion runtime.
Two things worth knowing. A `next/dynamic` written in a server component (`widgets.tsx`) does not split: Next collects
the client module into the page's client entry and the route size did not move (218 → 219 kB). The split has to be
declared in a client module, `src/components/charts-lazy.tsx` (`'use client'`, `next/dynamic` with SSR on), which
`widgets.tsx` imports in place of `charts.tsx`. And the chart stays server-rendered, so the chart box is in the HTML and
nothing shifts while the module arrives; `.chart-loading` holds the cell on client-side navigations.

| Route (First Load JS, `next build`, gzip) | before  | after   |
| ----------------------------------------- | ------- | ------- |
| `/r/[token]`                              | 218 kB  | 106 kB  |
| `/d/[token]`                              | 218 kB  | 106 kB  |
| `/login`                                  | 165 kB  | 165 kB  |
| `/_not-found`                             | 103 kB  | 103 kB  |
| `/overview`                               | 323 kB  | 212 kB  |
| `/reports/[id]` (editor)                  | 363 kB  | 252 kB  |
| shared by all                             | 103 kB  | 103 kB  |

Bytes actually transferred on a full load at 1440 px (every JS response, encoded size, production server): a report with
six charts 272.4 → 273.0 kB, because that page does render charts and the 109 kB Recharts chunk is now fetched as a
separate async chunk instead of a page chunk; login 164.1 → 163.3 kB; 404 159.4 → 158.7 kB. Pages without a chart never
request the chunk. The motion runtime (45 kB gz, the chunk shared by the nav icons and the report-index cover) is loaded
by shell pages only.

Found on the way, not taken: every route also downloads the avatar library (49.5 kB gz, plus 8 kB of 404 code) because
the root `not-found.tsx` renders `UserAvatar`, and the root not-found boundary's client components ride along in every
page's flight data (`app/not-found` chunk group referenced from `/r`, `/d` and `/login`). Taking the 404 face out of the
client bundle (a static SVG, or a client wrapper that lazy-loads the library inside a reserved box) would cut about 57 kB
from every public page.

**Login CLS.** The avatar box was React state (240, then 168 below 1024 px after mount), so the server rendered 240 px
and the phone shrank it after hydration: 0.066 at 390 px, 0 at 1440 px. The box is now sized by CSS at both breakpoints
(`.login-avatar-lg`: 168 px, 240 px from 1024 px) and the SVG fills it (`size="100%"`); the state and the `matchMedia`
effect are gone. Measured: 1440 px 0 → 0, 390 px 0.066 → 0; the avatar box is 168 × 168 at first paint and settled on
the phone, 240 × 240 on the desktop, and the form no longer moves.

**Section voids.** `fillRows` (seed time, `src/lib/layout/compose.ts`) now also justifies a block's leading rows of
default-sized KPIs (`justifyKpiRows`): the run is re-packed as evenly as possible (nine → 3 + 3 + 3, five → 3 + 2,
not 4 + 4 + 1 or 4 + 1) and each row is spread across the twelve columns (three KPIs → 4 columns each, two → 6), so a
full-width chart under a short row meets no empty cells. A lone KPI keeps its three columns (one number stretched across
the page would overstate it), a row that also holds a chart or a table is left alone, and the row count never changes,
so nothing below moves. Phones keep KPIs two to a row whatever their desktop width (`data-w` 5 and 6 on
`data-kind="number"`). This applies to layouts seeded from now on: reports 1–4 and 6 have no stored layout and the
public page seeds in memory on each view, so they show it already (Acme at 1440 px: three rows of three KPIs filling the
grid, 464–1332 px, chart and table below; no horizontal scroll at 1440 or 390), while stored layouts (report 5, the
user's edit, and 7–10) keep their positions. Tests: the seed expectation was updated (the two Meta KPIs of the fixture
now take 6 + 6; the service seed's nine take 4 each) and `justifyKpiRows` has its own case; 78/78.

**Minor.** `not-found.tsx` exports `metadata` (`Page not found · Ruler Reports`; Next 15.5 collects metadata from the
root not-found segment, verified on the dev server and the production build). The Print / PDF button in the public
header loses the sliding hairline: it was the `.btn::after` verb, now `content: none` under `.dossier-head`; the border
still darkens on hover.

Still open from the critic: a contrast pass on `--ink-3` captions.

## Pass 5b — the 404 face without the avatar library

The item pass 5 found and left. The root `not-found.tsx` rendered `UserAvatar`, a client component wrapping
`@bible-strong/avatar-react`, and because the root not-found boundary's client components ride in every page's flight
data, the library chunk (`3204`, 49.5 kB gzip) and the wrapper's helper chunk (`82`, 4.7 kB) were downloaded by every
route, public reports included. The library, given a fixed `defaultExpression`, draws one frame of avatar-core's
`renderAvatarDefinition(definition, key)` and never touches it again (stopped playback; `far-right-glance` has no
ambient motion), so that frame can be computed on the server. `src/components/avatar-static.tsx` (`StaticAvatar`, a
server component) calls avatar-core directly and emits the library's own markup — the `bs-avatar` box with its inline
width and height, `bs-avatar__svg`, the `-150 -150 300 300` viewBox, the head clip, body and eye paths — so the library
stylesheet (still imported by the root layout) and the `.bs-avatar` rule in globals.css apply unchanged, and the face is
in the HTML at first paint instead of appearing, and switching from neutral to its glance, at hydration. The 404 uses
it; `UserAvatar` and `LoginAvatar` (settings, login) are untouched. The lazy-load alternative (`next/dynamic`, SSR off,
a reserved box) was not taken: it keeps 50 kB of JS on the 404 and shows an empty box until it arrives.

Verified with Playwright against the old and the new production build (scratch dist on a spare port, 2026-10-21): the
hydrated face before and the static face after have the same four non-empty paths (`d`, fill, opacity), the same
120 × 120 box, class, role and label, and a 2× screenshot of the box differs in 0 of 58 080 pixels. The old markup also
carried 36 empty `<path>` placeholders for body nodes the base character does not have; the static one emits only paths
with data.

| | before | after |
| --- | --- | --- |
| `/r/[token]`, `/d/[token]` First Load JS (`next build`, gzip) | 106 kB | 106 kB |
| `/login` First Load JS | 165 kB | 165 kB |
| `/_not-found` First Load JS | 103 kB | 103 kB |
| JS transferred, Acme monthly report (full load, 1440 px) | 273.0 kB | 218.8 kB |
| JS transferred, Acme live dashboard | 273.0 kB | 218.8 kB |
| JS transferred, `/login` | 163.3 kB | 163.2 kB |
| JS transferred, 404 | 158.7 kB | 104.4 kB |

The route table does not move because `next build` counts a page's own chunks, not the not-found boundary's; the
transfer does: `3204` and `82` are no longer requested by `/r`, `/d` or the 404 (54 kB less per public page), the 404's
own client chunk is 197 bytes (the `Link`), and `/login` still loads the library for its watching face. CLS (slow-4G,
4× CPU, buffered `layout-shift`): 404 at 1440 px 0.0001 → 0.0001 (the title's font swap, identical before and after, not
the face), at 390 px 0 → 0; login 0 → 0 at both widths, its face box 240 × 240 and 168 × 168 at first paint and settled,
no console errors. `tsc` clean, 78/78 tests. Still open from the critic: the `--ink-3` contrast pass.

## Pass 5c — text that sat on other text

The user saw text overlapping. Rather than hunt by eye, a Playwright scan (`overlap-scan.cjs` in the pass 5 side
session's scratchpad) walked every text node of a page at 1440, 1280, 1024, 768 and 390 px and reported pairs of
text boxes that intersect without one containing the other, on the public report, dashboard, login and 404 and, signed
in, on the overview, the reports index, a project page and the editor. Four findings were real; the rest were the closed
"Sharing & delivery" panel and the account menu (closed `<details>`, not painted), clipped table rows inside a fixed
editor cell, and truncated KPI labels, all of which the scan cannot tell from visible text.

- **Category chart labels on phones** (public report, 390 px): seven angled channel names overlapped by 16–32 px and the
  first was clipped at the card edge. `CategoryChart` now lets Recharts drop the labels that would collide
  (`interval="preserveStartEnd"`, angle-aware since Recharts 2.15) and keeps a 12 px left margin when labels are angled.
  At 390 px every other label shows (Organic Search, Organic Social, Paid Search, Email); at 1440 px all seven still do.
- **The "0" on the chart origin** touched the first date label on time charts; x-axis labels sit 4 px lower
  (`tickMargin` 6).
- **Brand over the nav on phones** (signed-in rail, 390 px): "Demo Agency" covered the first slide-rule items. Below
  768 px the rail is two rows: brand and icons, then the nav full width with its fades at the edges; the rail grows from
  60 to about 92 px there.
- **Overview wider than a tablet** (768 px: document 896 px): the board now sits in `.board-scroll`, which scrolls sideways
  below 1024 px like phone tables do. A second cause hid behind it: the board's screen-reader-only spans are absolutely
  positioned and resolved against the page, so they escaped the scroll box and still widened the document to 884 px;
  the wrapper is `position: relative` so they resolve inside it. Document width at 768 px is now 768.

After the fixes the scan reports no overlapping text on any public page at any of the five widths, and only the closed
account menu on the signed-in pages. tsc clean, 78/78.

## v2 — navigation

The slide-rule nav and the scroll ruler are gone: the nav is a plain wrapping list with a CSS underline on the active
item (no measured marker, no masks), and the content keeps symmetric 40 px gutters. Reason: the measured marker lagged
and landed wrong after navigation and font load, items disappeared behind the fades on narrow windows, and the fixed
ruler covered content. Component: src/components/top-nav.tsx (server, no client JavaScript).

## v2 — report look and custom widgets

What was added (spec docs/superpowers/specs/2026-10-21-v2-features-design.md, plans B and C):

- **Per-report look.** The layout carries a `theme` (`accent`, `palette`, `cover`, per-block colours). `themeVars` turns it
  into CSS variables on `.report-root` (`--brand`, the chart palette) and `blockVars` sets `--block` per section; a block
  colour with less than 3:1 contrast on white is mixed 45 % towards ink before it is used for text (`blockColorOf`).
  The editor's "Look" panel and the block-header swatch write it; the public page reads the same variables.
- **Client marks and platform icons.** `ClientMark` (logo from an upload or https, else a lettermark in the brand colour)
  on the overview board, the reports index, the report head and the public cover; `PlatformIcon` (simple-icons, 36 slugs,
  lettermark fallback with the qualifier words dropped: "LinkedIn Ads" → "Li").
- **Media.** PNG, JPEG, GIF or WebP up to 5 MB, sniffed by magic bytes, stored on disk under `data/uploads/<company>/`
  (`MEDIA_DIR` overrides; a Docker volume `rr-uploads` in compose) and served by `/api/media/[id]` with immutable caching.
  One rule for every image address the product accepts (`isMediaOrHttps`): one of our uploads or an https URL that parses.
  `MediaImage` swaps a missing file for a placeholder instead of a broken image.
- **Three widget components.** `custom_chart_v1` (any metrics from any connected account, or typed data; line, bar,
  area, stacked, donut; group by date or by category), `infographic_v1` (progress ring, big number, compare, ranking tiles
  with a 24-icon set) and `image_v1` (an upload or https picture in the grid). They sit in the add drawer's
  "Customizable" tab and each has its own settings panel under src/components/widget-settings/.
- **Pictures in prose and context.** Analysis cards keep `<img>` from uploads or https (alt, width, height only; the
  sanitizer drops everything else); a milestone can carry an image (96 px thumbnail in the project timeline and on the
  public cover); the cover banner (16/9, 32/9 in print) sits above the client mark when the theme has a cover.

Registries to update when adding a widget component, in this order:

1. src/lib/engine/types.ts — the `Component` union and the value type the card renders.
2. src/lib/layout/types.ts — `SPECIAL_SLUGS`, the `WidgetCustom` fields it reads, its default size.
3. src/lib/layout/compose.ts — `customSchema` (what the editor may save), the component enum, `SPECIAL_COMPONENT`,
   `componentOfValue`, `valueKey` and the `renderWidget` branch that builds the value.
4. src/lib/engine/report.ts `ensureWidgetValues` — which metric refs to fetch into the store (none for images).
5. src/lib/services/export.ts (rows in CSV/XLSX) and src/lib/api/routes.ts (what the API serialises).
6. src/components/widgets.tsx — the `WidgetCard` dispatch and the card itself.
7. src/components/report-editor.tsx — `COMP_LABEL`, `SPECIAL_COMPONENT`, `SPECIAL_KEY`, `SPECIAL_DEFAULT`, `kindOf`
   and the drawer's Customizable list; src/components/widget-settings/ — the panel and the `SettingsPanel` dispatch.

Measured on 2026-10-21 (`NEXT_DIST_DIR=.next-v2 npx next build`): `/r/[token]` 124 B route, 106 kB First Load JS, of
which 103 kB is shared by every route (the Recharts chunk still loads lazily, only when a chart is on the page); the
target was 110 kB. Login CLS under Slow 4G + 4× CPU: 0 at 1440 and 390. The overlap scan on the public report with a
cover set: 0 pairs at 1440, 1280, 1024, 768 and 390.
## v3 — integration health and data notes

Spec `docs/superpowers/specs/2026-10-22-v3-programme-design.md` §1, plan D.

- **Status model.** `Integration.health` is `unknown | ok | failing | expiring`, written by `checkAll()` (cron tick and
  `npm run tick`): rows not checked in 20 hours, oldest first, 50 per pass, each connector's `validate()` under a 15 s
  timeout; the token expiry comes from the OAuth credentials (`expiresAt`), so Meta long-lived tokens turn `expiring`
  seven days before the end. Demo rows are always ok. `alertFor()` is pure: `failing` on the transition and again after
  seven days, `expiring7` and `expiring1` once each, `recovered` in-app only. Alerts go to the bell, to owners and admins by
  e-mail (`healthEmailHtml`), and to the `integration_failing` webhook event. "Check now" on a row runs one check.
- **Reconnect keeps the row.** `reconnectUrl()` (pure, `src/lib/health-url.ts`) sends the user to the connect page with
  `?reconnect=<id>`; the OAuth state and the pending cookie carry `integrationId`, `finalizeSelection` only accepts the
  account already stored, and `connectIntegration({ replaceId })` updates credentials in place and resets the health
  fields. Reports, dashboards and automations keep their integration ids.
- **Retry one source.** `regenerateSource(report, integrationId)` regenerates that account only and merges by widget key
  across sections (a layout names its sections after blocks, the stored data keeps the template's ids), refreshes that
  account's store entries through `ensureWidgetValues`, and replaces its `sources[]` entry. `SourceStatusList` shows
  Reconnect and Retry only when the report page passes `sourceActions`; the public page never does.
- **About these numbers.** `dataNote(slug)` returns one to five sentences per platform (attribution window, time zone,
  delay, sampling, counting) from `src/lib/catalog/data-notes.ts`; `DataNote` is a no-JS `<details>` in each block
  header on client pages, `DataFootnotes` lists them under the cover's Sources in print only, and the cover footer carries
  the generic sentence with the generation date. `Company.showDataNotes` (Settings) switches all three off.
## v3 — campaigns

Spec `docs/superpowers/specs/2026-10-22-v3-programme-design.md` §2, plan E.

- **Scope model.** `CampaignScope` (`src/lib/engine/campaigns.ts`, pure, browser-safe): `all`, `pick` (ids in display
  order) or `rule` (name contains / does not contain, case-insensitive, ANDed). Three places hold one: the account
  (`Integration.config.campaigns`, the default), the report (`Report.campaignScopes` by account id, set by the wizard or
  the API, wins over the account default) and a layout block (`LayoutBlock.campaigns`, wins over both for that block).
  At generation the effective default per account is frozen into `data.sources[].campaigns/campaignNames/missingCampaigns`
  (an `all` default is frozen explicitly too), so a snapshot never changes when the account's default changes later;
  `ensureWidgetValues` and `composeReport` both read the frozen default and never the live config.
- **Connectors.** `listCampaigns(ctx)`; the scope travels as `campaignIds` on `daily`, `totals` and `breakdown` next to the
  widget's own filter (a platform slice keeps slicing under a scope); Meta sends `filtering=[{campaign.id IN […]}]` on all
  three (with `breakdowns` when there is one) and a campaign breakdown keyed by `campaign_id`; the demo connector has six fixed
  campaigns per ads account, splits every day's value with a largest-remainder allocation (so scoped days and the campaign
  breakdown add up exactly to the account) and scales non-campaign breakdowns by the scoped share. The fetch plan is per
  (account, scope), so a scoped section batches like an unscoped one. Other ads platforms stay on the demo connector.
- **Store keys.** `storeKey(integrationId, key, period?, scope?)` and `valueKey(w, scope?)` append `#<8-hex FNV-1a of the
  scope>`, so two scopes of one account keep separate values; generation-time section values register under their scoped
  key (`RenderedBlock.campaignScope`) and `composeReport` looks a block up with `effectiveScope(block, data)` =
  `block.campaigns ?? the frozen source default` (an explicit `all` on a block overrides a narrowing default; `withBlockScope`
  stores it). Refs inside custom widgets (chart series, tile refs, formula prefixes) to the block's own account follow the
  block scope; refs to other accounts read account totals. A scope that matches nothing is `no_data`, not an error, and
  never reaches `Integration.lastError`; an unresolved pick notes "N selected (names unavailable)".
- **Campaign table.** `container_v1` (slug `container`, 12×4, min 6×3): `resolveContainer` plans the chosen number metrics'
  primitives, fetches one campaign breakdown per period and stores the full row set (`containerFromRows`: ratio metrics as
  num/den×mult per row, comparison gaps as null); hidden campaigns, the sort column, the row limit and the status dot are
  per-widget settings applied at compose time (`applyContainerCustom`, `layout/container-custom.ts`), so changing them never
  re-fetches; key `account:container:<metrics hash>[#scope]`;
  a container added from the drawer carries `integrationId 0` and resolves through its block. Registries touched:
  engine/types `ContainerValue`, layout/types sizes + `SPECIAL_SLUGS`, compose `customSchema`/`SPECIAL_COMPONENT`/
  `componentOfValue`/`valueKey`/`sizeOfValue`, engine/report `ensureWidgetValues`, export (kind `campaign`), API
  serialisation, `WidgetCard` → `ContainerCard`, editor `COMP_LABEL`/`SPECIAL_*`/`kindOf`, `widget-settings/container.tsx`.
- **UI.** Integrations tab: "Campaigns: <summary> · Edit campaigns" with the inline `CampaignScopeEditor`; editor: a
  scope button in ads block headers (inline Apply/Cancel) and "Campaign table" in the drawer's Customizable tab; wizard: a
  Campaigns step per selected ads account. Data notes say "Campaigns: …" and count picked ids that no longer exist.

## v3 — delivery

Spec `docs/superpowers/specs/2026-10-22-v3-programme-design.md` §3, plan F.

- **Schedules.** `Automation.frequency` gains `daily`; `weekdaysOnly` skips Saturday and Sunday; `monthlyRule` is `day`
  (the day-of-month field) or `first:<0-6>` / `last:<0-6>` (0 = Sunday). `nextRunAfter` walks local days through
  `zonedToUtc`, so 08:00 stays 08:00 across a DST change; `periodForRun('daily')` is yesterday. On the form and the API
  (`weekdays_only`, `monthly_rule`, `hold_on_failure`, `attach_pdf`).
- **Held runs.** `runAutomation` generates first; when a source failed and `holdOnFailure` is on, the run is stored as
  `held`, nothing goes to the client, and owners/admins get a bell and an e-mail with reconnect links (`failureAlert`).
  "Send now" (`deliverRun`, `POST /automations/:id/runs/:runId/send`) delivers the stored report without regenerating.
  A campaign scope that matches nothing is `no_data`, not a failure, so it never holds a report.
- **Goal alerts by e-mail.** `Goal.alertEmails` (validated, at most 10) receives the same met / missed / off-track
  events as the bell, with the same dedupe (`goalMail`).
- **Public goals page.** `/g/<Project.goalsToken>` (`services/goals-share.ts`: create / password / stop; `PublicGoals`):
  the client mark, one card per goal with a progress `Ring`, a situation chip, now / target / projected and the period;
  optional password through the shared `UnlockClient` (`kind="goals"`, cookie `rr_gpw_<projectId>`); `?embed=1` drops
  the chrome and the footer. The goals tab carries the "Share control" block (admins).
- **Client period picker.** `Report.clientPresets` (dashboards): the presets the client may switch to on `/d/<token>`;
  `clientPreset()` honours `?preset=` only when allowed, `?compare=` toggles the comparison; `liveDashboardData(report,
  { preset, compare })` keys its cache on the resolved range and comparison and returns `updatedAt`. `DashboardControls`
  renders "Live · updated HH:MM", the plain GET form and `AutoRefresh` (client, 120 s, only while the tab is visible, only
  on rolling presets; a soft `router.refresh()` when the app router is mounted).
- **Duplicate and convert.** `duplicateReport` copies layout, theme, data, analysis, sources and preset under a new link
  (no password, no views, not tied to an automation); `convertReport` report → dashboard (live on the last 30 days, data
  dropped, password kept) and dashboard → report (frozen on today's range of its preset). Report page "More" row;
  `POST /reports|dashboards/:id/duplicate` and `…/convert { kind }`.

## v3 — output

Spec `docs/superpowers/specs/2026-10-22-v3-programme-design.md` §4, plan G.

- **PDF service.** `src/lib/services/pdf.ts`: one Chromium (Playwright, now a runtime dependency; the Docker runtime
  stage is `mcr.microsoft.com/playwright:v1.64.1-noble`) launched lazily and closed after five idle minutes; at most two
  renders at a time, the rest wait; 60 s timeout; `PDF_ENABLED=auto|off`; `pdfAvailable()` is cached. The page renders
  itself: `GET /api/pdf/<token>?layout=flow|pages` resolves the share token (404 / 401 without the unlock cookie / 503
  when off / 504 on timeout), opens `/r|/d/<token>?print=1&layout=…` with the cookie forwarded and answers
  `application/pdf` as an attachment (`pdfFilename`: ASCII, `| : / \` → `-`, ≤ 80 chars). The public page carries
  `data-print` / `data-print-layout`; `?print=1` hides the chrome on screen too and `pages` adds `break-before: page`
  between blocks. The print button becomes a `<details class="pdf-menu">` (continuous / one block per page / browser
  print) when the service is up — no client JS added to the public page. Automations with `attachPdf` attach
  `<title>.pdf` (`sendEmail` attachments, Outbox `attachmentNames`); the run detail says why when not (service off,
  password-protected, > 15 MB, render error) and the delivery never waits on a failed PDF.
- **Cover layouts.** `ReportTheme.coverLayout` `banner` (default, image above the title in the cover column) | `header`
  (image full width above both columns, `.cover-hero` 21/9 on screen and 32/9 in print, titles overlaid on a dark
  gradient) | `none` (no cover column: the titles open the document, sources and timeline close it in `.dossier-foot`);
  `coverText` colours the eyebrow and title (`--cover-text`); `showPeriod: false` hides the band. `ReportCover`
  (`src/components/report-cover.tsx`) renders every layout in two slots (hero / head) and the Look panel has a "Cover"
  group; `cleanTheme` drops the defaults.
- **Block options.** `LayoutBlock.icon` (one of the 24 names in `src/lib/layout/icon-names.ts`, drawn in `var(--block)`
  before the title), `subtitle` (≤ 120 chars, under the title) and `hideHeader` (no title row on the client link and in
  print; the editor keeps it dimmed with a "hidden" tag; the block colour still applies). Carried into template sections
  and rendered sections by `blockOptions()`; every section now has `id=<block id>`. Editor: "Options" per block.
- **Per-block AI.** `AnalysisCard.blockId` places a card right after its block (cards without one stay at the top);
  `tone` is one of `general | performance | worst | opportunities | executive` (`src/lib/ai/tones.ts`).
  `analyseBlock` scopes `extractFacts` to one section and adds the tone instruction (`TONE_PROMPTS`); `heuristicBlock`
  shapes the offline fallback the same way (a block without number widgets says so). "Analyse ▾" per block and "Analyse
  all blocks" on the editor toolbar; a re-run replaces the block's earlier AI card of that tone. `POST /reports/:id/analysis`
  takes `block_id` + `tone`. The whole-report `analyse()` and automations' single card are unchanged.

### v3 — output: review fixes

- **Cover `none`** takes the full width on desktops (`.dossier[data-cover-layout='none']`), and the page-per-block rule
  uses `.print-section ~ .print-section` so a block card between two sections keeps the break.
- **Print renders are not views.** `?print=1` skips the view counter and the `report_viewed` webhook, so the PDF service
  and an automation's own render never show as a client opening the report.
- **Filenames.** `pdfFilename(title, { ascii })`: downloads send `filename=` (ASCII, `"` dropped) plus RFC 5987
  `filename*` (`pdfContentDisposition`), mail attachments keep the title's own letters.
- **The download follows the client's view.** The menu links carry `preset`, `compare` and `lang`; the route forwards
  only those three (values limited to `[A-Za-z0-9_-]`) into the page URL.
- **One AI language.** `src/lib/ai/language.ts` + `src/components/ai-language.tsx`: the analysis panel's select sets a
  shared store that the per-block controls read; the default is Greek for a Greek workspace, English otherwise.
- **Block cards in the editor** render after their block in the editing view and in "Preview as client" (`cards` prop).
- **Queue bound.** Two renders run, ten wait, the next caller gets `PdfBusyError` → 429 with `Retry-After: 10`; the idle
  timer re-arms instead of closing a browser with a render in flight.
- **`PDF_BASE_URL`** (default `APP_URL`): the address the renderer opens; the Docker image sets `http://127.0.0.1:3100`
  so the container never depends on reaching its own public hostname.
- **API block cards** replace the earlier AI card of the same block and tone, as the editor action does.

## v3 — Greek

Spec `docs/superpowers/specs/2026-10-22-v3-programme-design.md` §5, plan H.

- **Dictionaries.** `src/lib/i18n/en.json` and `el.json`: flat, namespaced keys (`area.item`: `nav.*`, `common.*`, `auth.*`,
  `projects.*`, `automations.*`, `goals.*`, `editor.*`, `look.*`, `analysis.*`, `media.*`, `campaigns.*`, `share.*`,
  `settings.*`, `templates.*`, `public.*`, `email.*`, `presets.*`, `tones.*`, …), `{name}` interpolation, fallback
  el → en → key (a missing key logs once outside production). `npm run i18n:check` (also run before the test suite) fails
  on a key missing from either file, a placeholder mismatch, a key that is not `area.item`, or a `t('x.y')` literal in
  `src/` that no dictionary has.
- **How to add a string.** Put the key in both JSON files; in a server component `const { t } = await getT()`
  (`src/lib/i18n/server.ts`); in a client component `const t = useT()` (`src/components/i18n-provider.tsx`, the shell
  wraps the app in the provider with the namespaces the app needs); in a shared component that cannot take a locale
  (cards, data notes, the cover, the dashboard controls) `tr(key)` from `src/lib/i18n/request.ts`, which reads the
  request's locale (set by the root layout, the shell, the public pages and the client provider). E-mails take the
  locale explicitly: `t(localeForPublic(project), 'email.…')`.
- **Locale rules.** App: `User.locale` (account menu EN / EL) → `Company.locale` (Settings → Language, default `en`)
  → `Accept-Language` starting with `el` (signed-out pages) → `en`. Public pages (`/r`, `/d`, `/g`): `?lang=el|en` →
  `Project.locale`; an unknown `?lang` is ignored. `<html lang>` follows the app locale. Dates: month names through
  `Intl` on the ruler band; numbers keep the project's decimal setting.
- **Metric labels.** `src/lib/catalog/labels.ts`: Greek labels for the most used metrics; `metricLabel(w, locale)` returns
  the catalog's English title for anything else. A title typed in the editor always wins. Catalog descriptions, API
  docs, MCP, AI output and platform names are not translated (spec §5).
- **Review.** `npm run i18n:review` regenerates `docs/i18n-review.md` (every key with EN and EL, the glossary, the metric
  labels, the data notes, the known gaps) for a native reviewer; the Greek is a draft until reviewed.
  `scripts/i18n-review.mjs --check` fails when the document is stale.

### v3 — Greek: review fixes

- **Where the client provider lives.** `AppShell` wraps every signed-in page in `I18nProvider` with the app namespaces
  (`APP_NAMESPACES` in `shell.tsx`, `public` included because the editor preview renders the client chrome on the client);
  the login page mounts its own with `auth` + `common` (Accept-Language decides there). A client component outside a
  provider renders its keys, visibly — `useT()` no longer falls back to English.
- **The request store holds a lookup, not the dictionaries.** `src/lib/i18n/request.ts` imports nothing from
  `index.ts`/`dicts.ts`; the server registers `lookupFor(locale)` (`setServerLocale` in `server.ts`), the client provider
  hands over the page's dictionary. Neither JSON file enters a client chunk (the build check: no Greek in
  `.next-v2/static/chunks`).
- **Project language.** `Project.locale` is set on the project settings tab (`data-project-locale`), defaults to the
  company's language for new projects, and drives client links, e-mails, PDFs and the CSV export.
- **`?lang=` and `?embed=` survive** the dashboard period picker (hidden inputs) and the password unlock
  (`publicPath()` in `share.ts`); the public roots carry `lang="el|en"`.
- **Whole e-mails.** KPI cells use `metricLabel`, the frequency is a dictionary word, the health footer and the missed-goal
  line are keys; the in-app "report ready" title too.
- **Data notes** have a Greek copy per platform (`DATA_NOTES_EL`); `dataNote(slug, config, locale)`.
- **Known, deferred (ledger):** the module-level fallback of the request store is process-global on the server, so a
  shared component rendered in the SSR pass of a client tree under concurrent requests can read the other request's
  locale (a label in the wrong language, corrected on hydration); setup help texts, OAuth nouns, anomaly metric names and
  page titles stay English.
