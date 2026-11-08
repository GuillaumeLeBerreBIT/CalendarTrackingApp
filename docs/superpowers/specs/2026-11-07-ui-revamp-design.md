# Eventli UI revamp ("Compact Mono") — design

Date: 2026-11-07. Status: approved by the owner ("write the spec now or implementation").
Reference board (light + dark mockups, component sheet): https://claude.ai/artifact/A9RBbt9H4sEtPy473KvPZo

## Intent

The owner wants Eventli to feel calm and easy: "Apple UI kinda clean, not too much showed, just
fluent components". The old UI is a dark violet theme with competing accents, and the
create-event modal shows too much at once. Direction chosen after two mockup rounds (Codex,
then Claude): **Compact Monochrome** — ink on white (or light ink on near-black), colour only
where it carries meaning (which group an event belongs to).

It must work equally well on a phone (one thumb) and a PC (more room, same parts).

## Goals

- One visual system, light and dark, driven by the existing CSS variables so every page
  changes at once.
- Colour only for groups: dots, 3px bars, checkboxes. Never buttons, backgrounds or text.
- One primary (ink) button per screen; everything else outline or plain text.
- **Weekends (Sat/Sun) always get a slightly darker grey background in calendar views**
  (owner rule): light `#f1f1f3`, dark `#18181d`.
- Own components on top of `client/src/components/ui/` — no Tremor, no shadcn.
- Our own calendar month view instead of FullCalendar.
- Theme choice per device: Light / Dark / System, default Dark (today's default).

## Non-goals (this revamp)

- No backend, API or database changes. No new product features.
- No week/day time-grid view (the app only uses month + agenda today).
- Drag-to-move and drag-to-resize events: dropped in v1 (owner accepted); events move by
  editing. Can come back later.
- Habits feature expansion (owner wants it, separate brief).

## Anti-goals

- Gradient washes, glows, coloured cards, emoji as icons, left-border "accent" cards.
- A second component library alongside our own.
- Losing data paths: every action available today stays reachable.

## Design tokens (decided)

Keep the existing variable **names** (so current components restyle automatically) and remap
their values. Add `--fill`, `--weekend`, `--danger`.

| Token | Light | Dark |
|---|---|---|
| `--bg` (page) | `#ffffff` | `#0e0e11` |
| `--bg-deep` (sidebar, side panel) | `#f6f6f7` | `#121215` |
| `--surface` (cards, sheets) | `#ffffff` | `#16161a` |
| `--surface-2` (hover) | `#f6f6f7` | `#18181c` |
| `--surface-3` / `--fill` (inset groups, inputs, segmented track) | `#f4f4f6` | `#1c1c21` |
| `--surface-hi` (active nav, selected segment in dark) | `#ececef` | `#26262c` |
| `--border` | `#ececef` | `#23232a` |
| `--border-2` (inputs, outline buttons) | `#d9d9de` | `#34343c` |
| `--border-hi` (unchecked checkbox) | `#b4b4bc` | `#55555e` |
| `--text-1` (ink) | `#111114` | `#f2f2f5` |
| `--text-2` | `#55555f` | `#a9a9b4` |
| `--text-3` (≥4.5:1) | `#6b6b75` | `#8e8e99` |
| `--text-inv` | `#ffffff` | `#0e0e11` |
| `--weekend` | `#f1f1f3` | `#18181d` |
| `--danger` | `#b42318` | `#f97066` |
| `--accent` (= ink, primary button) | `#111114` | `#f2f2f5` |
| `--accent-text` | `#ffffff` | `#0e0e11` |

`--accent-hover/-press/-soft/-softer/-line/-glow` become ink shades (soft = ink at 8%, glow =
transparent). Group colours, light / dark: family `#d97706`/`#f59e0b`, friends
`#db2777`/`#f472b6`, work (and "home"-like teal groups) `#0d9488`/`#2dd4bf`, climb
`#2563eb`/`#60a5fa`, book `#7c3aed`/`#a78bfa`, self = `--text-1`. Event colours on the
calendar keep coming from the member's chosen group colour (`resolvedHex`, stored per
membership); these `--g-*` values only cover places that use the CSS variables.

Type: Inter (already bundled). Scale 26/22/19/17/15/13/12; weights 400–700; inputs ≥16px on
phone. Radii: 6/8/10/12/16 (`--r-xs` … `--r-xl`). Shadows: barely there in light, none
needed in dark (elevation = lighter grey). Spacing on a 4px grid; 16px phone gutter.

## Components (decided shape)

- `Button`: primary = ink fill; secondary/outline = `--border-2` outline; ghost = text only;
  danger = `--danger` text. No glow.
- `Segmented`: `--fill` track, raised selected segment (white in light, `--surface-hi` in dark).
- New `Switch` (51×31 on phone, ink track when on), `Checkbox` (square 18px for tasks, round
  22px for shopping items; ink fill + inverse check when done), `InsetGroup` + `InsetRow`
  (iOS-style grouped rows on `--fill`, 48px rows, hairline dividers, label left, value +
  chevron right).
- `Sheet` (bottom sheet on phone, right-hand inspector on desktop), `Disclosure`, `SheetDialog`
  (built in Phase B; every dialog in the app now uses them).

## Layout (decided)

- **Desktop:** 220px sidebar on `--bg-deep` with labelled nav (Calendar, Tasks & shopping,
  Groups, Habits), user row at the bottom (profile, bell). Pages own their headers: title 19px,
  controls on one wrapping toolbar row.
- **Phone:** bottom nav with five labelled tabs: Calendar, Tasks, Groups, Habits, **Me**
  (`/profile`). The top bar stays slim (logo + bell) so notifications remain one tap away.
- **Calendar, desktop:** our own month grid (Mon-first, 5–6 rows), up to 3 event chips per day
  (group dot, time, title; all-day chips on `--fill`), "+N more", weekend columns on
  `--weekend`, selected day as an ink circle. Clicking a day selects it and shows that day's
  events in a 320px right panel; clicking an event opens the existing event view; "New event"
  opens the existing form with the selected date. Group filter stays (sidebar-style checkbox
  list with group colours). Tentative events stay visibly tentative (dashed/faded).
- **Calendar, phone:** "Agenda" = week strip (Mon–Sun, dots per day, weekend tiles on
  `--weekend`, selected day ink circle) above the agenda list from the selected day onward;
  "Month" = existing compact month grid restyled, with weekend shading. The FullCalendar
  "detailed" mobile layout goes away.

## Phasing

- **Phase A (first plan):** tokens + theme preference, base components, shell, calendar
  (own month grid, week strip, weekend shading), FullCalendar removed.
- **Phase B:** new-event form as bottom sheet / inspector with optional sections collapsed
  (invite, location & note, wishlist, repeat & reminder); event view with wishlist restyle.
- **Phase C:** Tasks & shopping, Groups, Habits, Profile, auth pages polish to the board.

Each phase ships on its own; the app keeps working between them.

## Constraints

- Follow CLAUDE.md: CSS variables for design values, `<Icon>`, primitives in `components/ui/`,
  Tailwind for layout only. All-day `end` stays inclusive everywhere (no FullCalendar means no
  exclusive conversion on the client any more; update the CLAUDE.md gotcha).
- `npm test` and `npm run typecheck` stay green; pure logic (month grid building, theme
  resolution) gets Vitest tests in `tests/`.
- No theme flash: the theme is applied to `<html data-theme>` before React mounts.

## Left to the builder

Exact component props, file split inside the calendar page, animation details, how the
"+N more" opens (select the day is enough), icon tweaks.
