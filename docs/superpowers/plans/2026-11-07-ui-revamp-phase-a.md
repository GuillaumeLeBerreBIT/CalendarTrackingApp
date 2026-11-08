# UI revamp Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-theme Eventli to Compact Mono (light + dark), add the base controls, update the shell, and replace FullCalendar with our own month grid and phone week strip, with weekend shading.

**Architecture:** Token remap in `index.css` restyles every page at once; a tiny `lib/theme.ts` resolves the per-device preference before React mounts. Calendar layout logic lives in a pure `lib/monthGrid.ts` (tested), rendered by new `MonthGrid`, `DayPanel` and `WeekStrip` components inside `CalendarPage`.

**Tech Stack:** React 19, Vite, TypeScript, CSS variables, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-07-ui-revamp-design.md`

## Global Constraints

- Token values exactly as the spec table; keep existing variable names; add `--fill`, `--weekend` (`#f1f1f3` / `#18181d`), `--danger`.
- Weekend = Saturday and Sunday, shaded with `var(--weekend)` in every calendar view.
- Theme key `eventli-theme` in localStorage; values `light|dark|system`; default `dark`.
- No backend changes. All-day `end` stays inclusive.
- Colour only for groups; primary button = ink (`--accent` now ink).
- `npm test` and `npm run typecheck` green after every task.

## Review Focus

1. Month starting on Sunday (6 rows) and February starting Monday (4 rows) — grid row count right.
2. Multi-day all-day events show on every covered day, including days outside the month.
3. Theme stored value corrupted / localStorage throwing → falls back to dark, no crash.
4. Hidden-group filter still hides events in the month grid, day panel and week strip.
5. Tentative events still look tentative (faded/dashed) in the new grid.

---

### Task 1: Tokens + theme preference

**Files:** Modify `client/src/index.css`, `client/index.html`, `client/src/pages/ProfilePage.tsx`; Create `client/src/lib/theme.ts`; Test `tests/theme.test.js`.

**Interfaces — Produces:** `type ThemePref = 'light'|'dark'|'system'`; `THEME_KEY = 'eventli-theme'`; `readThemePref(): ThemePref`; `resolveTheme(pref: ThemePref, prefersDark: boolean): 'light'|'dark'`; `setThemePref(pref: ThemePref): void` (stores + applies).

- [ ] Test: `resolveTheme('light', true) === 'light'`, `resolveTheme('dark', false) === 'dark'`, `resolveTheme('system', true) === 'dark'`, `resolveTheme('system', false) === 'light'`; `parseThemePref('nonsense') === 'dark'`, `parseThemePref(null) === 'dark'`, `parseThemePref('system') === 'system'`.
- [ ] Implement `theme.ts` (all storage access in try/catch); remap tokens in `index.css` for `[data-theme="dark"]` and `[data-theme="light"]`; `--accent*` per theme as ink; radii 6/8/10/12/16.
- [ ] `index.html`: inline script before the module script reads `eventli-theme`, resolves `system` with `matchMedia('(prefers-color-scheme: dark)')`, sets `document.documentElement.dataset.theme`; wrapped in try/catch, default dark.
- [ ] ProfilePage: "Appearance" row with `<Segmented>` Light / Dark / System calling `setThemePref`.
- [ ] Run `npm test`, `npm run typecheck`; commit `feat(ui): compact mono tokens and theme preference`.

### Task 2: Base controls

**Files:** Modify `client/src/components/ui/Button.tsx`, `client/src/components/ui/Primitives.tsx`; Create `client/src/components/ui/Controls.tsx`.

**Interfaces — Produces:** `Switch({ checked, onChange, label })`, `Checkbox({ checked, onChange, shape?: 'square'|'round', label })`, `InsetGroup({ children })`, `InsetRow({ label, value?, onClick?, chevron?, children? })`.

- [ ] Button: primary ink fill / `--accent-text`, no glow; outline `--border-2`; danger `--danger` text.
- [ ] Segmented: `--fill` track, selected = `--surface` (light) / `--surface-hi` (dark) via a CSS var `--seg-on` set per theme.
- [ ] Controls.tsx: real `<button role="switch" aria-checked>` / `<button aria-pressed>`; 44px hit areas.
- [ ] typecheck; commit `feat(ui): restyle buttons and add switch, checkbox, inset rows`.

### Task 3: Shell

**Files:** Modify `client/src/components/AppShell.tsx`, `client/src/index.css` (`.nav-item`).

- [ ] Sidebar 220px on `--bg-deep`; nav labels Calendar, Tasks & shopping, Groups, Habits; active item `--surface-hi`.
- [ ] Mobile bottom nav: five tabs, fifth = Me (`/profile`, icon user); top bar keeps logo + bell, drops the settings button.
- [ ] typecheck; commit `feat(ui): compact mono app shell`.

### Task 4: Month grid logic

**Files:** Create `client/src/lib/monthGrid.ts`; Test `tests/monthGrid.test.js`.

**Interfaces — Produces:**
`interface MonthCell { key: string; day: number; inMonth: boolean; isWeekend: boolean; isToday: boolean; events: CalEvent[]; visible: CalEvent[]; more: number }`;
`buildMonthGrid(year: number, month0: number, events: CalEvent[], todayKey: string, maxChips = 3): MonthCell[]` (Monday-first, length = 7 × rows);
`weekKeys(dateKey: string): string[]` (Mon..Sun containing dateKey);
`isWeekendKey(dateKey: string): boolean`;
`eventsOnDay(events: CalEvent[], key: string): CalEvent[]` (sorted all-day first, then start).

- [ ] Tests: Dec 2026 → 35 cells, first key `2026-11-30`, cell 5/6 weekend; Feb 2027 → 28 cells; Mar 2026 → 42 cells first key `2026-02-23`; a 3-day all-day event 2026-12-30..2027-01-01 appears in cells for 30, 31 Dec and 1 Jan; 4 events on a day → `visible.length === 3`, `more === 1`; sort puts all-day before 09:00 before 18:00; `weekKeys('2026-12-24')` = `2026-12-21`..`2026-12-27`; `isToday` true only for todayKey.
- [ ] Implement using `eventDays` from `calendarEvents.ts` and `addDaysStr`.
- [ ] `npm test`; commit `feat(calendar): pure month grid builder`.

### Task 5: Desktop month grid replaces FullCalendar

**Files:** Create `client/src/components/MonthGrid.tsx`, `client/src/components/DayPanel.tsx`; Modify `client/src/pages/CalendarPage.tsx`, `client/src/index.css` (drop `.fc` rules), `client/src/lib/calendarEvents.ts` (drop `toFullCalendarEvents`), `client/package.json` (drop `@fullcalendar/*`), `CLAUDE.md`.

**Interfaces — Consumes:** Task 4. **Produces:** `MonthGrid({ cells, selectedKey, onSelectDay, onEventClick, colorOf })`, `DayPanel({ dateKey, events, onEventClick, onAdd, colorOf })`.

- [ ] MonthGrid: CSS grid 7 × rows filling height; weekday header; weekend cells + header on `--weekend`; out-of-month numbers `--text-3` faded; selected day ink circle; chips = dot (`colorOf(ev)`), time (HH:MM, none for all-day), title ellipsis; all-day chips on `--fill`; tentative chips at 60% opacity with dashed dot; "+N more" selects the day.
- [ ] DayPanel (desktop, 320px right): weekday + date heading, event cards (group dot, time, title), empty state with "Add an event".
- [ ] CalendarPage: desktop month view = MonthGrid + DayPanel; prev/next/today drive a `currentDate` month; `New event` / Add opens existing EventFormModal with the selected date (reuse the synthetic select info used for MobileMonthGrid); remove FullCalendar, drag/resize handlers, mobile "detailed" layout.
- [ ] Remove `@fullcalendar/*` deps, `.fc` CSS, `toFullCalendarEvents` and its tests; update CLAUDE.md (folder list, all-day gotcha, FullCalendar gotcha).
- [ ] `npm test`, `npm run typecheck`, `npm run build` (client); commit `feat(calendar): own month grid and day panel, drop FullCalendar`.

### Task 6: Phone week strip + weekend shading

**Files:** Create `client/src/components/WeekStrip.tsx`; Modify `client/src/pages/CalendarPage.tsx`, `client/src/components/MobileMonthGrid.tsx`.

**Interfaces — Consumes:** `weekKeys`, `isWeekendKey`, `eventsOnDay`.

- [ ] WeekStrip: 7 buttons (dow label, date, up to 3 colour dots), weekend tiles on `--weekend`, selected = ink circle, chevrons/swipe move a week.
- [ ] Phone Agenda view = WeekStrip + AgendaList filtered to events from the selected day onward.
- [ ] MobileMonthGrid: weekend columns/cells on `--weekend`.
- [ ] typecheck, build; commit `feat(calendar): phone week strip and weekend shading`.
