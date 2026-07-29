# Roadmap — the next steps, in order

**Date:** 2026-07-29
**Status:** steps 1, 2, 4 and 5 shipped; 3 and 6–8 outstanding

Eight steps, each one shippable on its own and each leaving the app in a working state. They
are ordered to be done one at a time, top to bottom: later steps assume earlier ones have
landed, and doing them out of order means reworking the same code twice (noted per step
where it matters).

Each step carries its own status line. Shipped steps are kept rather than deleted: the
problem statement is why the code looks the way it does, and the next person reading it
deserves the reason and not just the result.

When a step is picked up it gets its own spec and implementation plan under
`docs/superpowers/`, the same as the two features already there. This file says *what* and
*in what order*; it deliberately stops short of step-by-step edits.

## Why this order

The app is not in production and has no users, so nothing here is ranked by risk to existing
data. Two consequences shape the sequence:

- **Steps 1–4 come first because they are what you feel every session at the gym**, and each
  is small enough to finish in one sitting. None of them changes the storage schema. Steps 1,
  2 and 4 have landed; step 3 is the one left, and nothing after it depends on it.
- **Step 5 changed the schema, and doing it early was the point.** It landed while there was
  no installed base to migrate and no backup file in anyone's inbox to stay compatible with,
  which is why it came before the polish steps rather than after them.

Step 7 is a launch blocker rather than an urgent fix: nothing is at stake until there is
something to lose, but the app cannot be handed to a real person before it is done.

## Applies to every step

- Any shipped file that changes means bumping `CACHE_VERSION` in `sw.js` and moving the
  previous-version literal forward in `tests/service-worker.test.js`. Do it last, in its own
  commit, once per step. The literal names the version being replaced, so it moves with the
  bump — it was found one behind during step 5, which the assertion cannot catch by itself.
- Only step 5 added a file, and only that step touched `SHELL`. Add the entry in the commit
  that adds the file: `SHELL` is about which files exist, `CACHE_VERSION` about contents.
- New user-facing text goes through `t()` in both locales — `tests/i18n.test.js` enforces
  parity. This includes `aria-label`s and anything inside `confirm()`/`alert()`.
- Anything decidable belongs in the pure layer where `node --test` can reach it. `views/*`
  and `app.js` have no automated coverage and cannot get any, so each step names both its
  test surface and its hand-check.

---

## Step 1: Show which days have been logged

**Status: shipped** (`009b888`). `loggedWeeks`/`loggedDays` in `src/state.js`, read by
`src/views/selectors.js`, marked with `.chip--logged` and spoken through `header.chipLogged`.
One deviation from what is described below: the dot is `currentColor`, not `--ghost`, so it
survives the ink fill a selected chip inverts to.

**The problem.** The week and day chips (`src/views/selectors.js:26-42`) carry no state at
all. Mid-block there is no way to tell Day 2 from Day 3 without tapping into each one and
looking. This is the single most-felt gap in daily use, and the information is already
sitting in the store.

**What changes.** A pure helper in `src/state.js` — alongside the existing
`countDayEntries` — that answers, for one plan, which days of a given week hold records and
which weeks hold any at all. The chip row reads it and marks the chips that do.

The mark cannot be colour: `styles/app.css` spends colour in exactly one place, the gain
badge. A small dot in `--ghost`, or a weight change on the chip label, stays inside that
rule. It also cannot be visual-only — the chip's accessible name has to say it too, which
means a new pair of i18n keys rather than a bare `aria-label` reuse.

**Test surface.** The new helper, in `tests/state.test.js`: a day with records, a day
without, a week with nothing in it, and a plan whose records all sit in another plan (which
must not count).

**Hand-check.** Log one set on Day 1 of Week 1, confirm exactly that chip is marked in both
locales, clear the day, confirm the mark goes.

---

## Step 2: Day chips carry the day's name

**Status: shipped** (`009b888`). The key cleanup went further than "one of them should go":
both were deleted for a single `plan.dayFallback` behind `dayLabel()` in `src/plan.js`, now
shared by the chips, the day heading, the editor's day cards and the clear-day confirmation.

**The problem.** `src/views/selectors.js:38` always renders `t("header.dayChip", { n })` —
"Day 1", "Day 2" — even after the user has named the day "Push" in the editor. The heading
directly below it (`src/views/day.js:246`) does use the name, so the same day is called two
different things one line apart.

**What changes.** The chip shows the day's name when there is one, falling back to the
position exactly as it does today. Names are unbounded, so the chip needs a `max-width` with
ellipsis; the accessible name keeps the full text. The chip row already scrolls
(`.seg` has `overflow-x: auto`), so a few long names degrade rather than break.

Worth folding in while here: `header.dayChip` ("Day {n}") and `planEditor.dayFallback`
("Day {n}") are two keys saying the same thing in two places. One of them should go.

**Depends on Step 1** — same chip markup and the same CSS block. Doing this first means
reworking both twice.

**Test surface.** None automated; the fallback logic is one `||` over the existing
`displayName`, which `tests/plan.test.js` already covers.

**Hand-check.** Name one day and leave another blank; confirm the named chip reads "Push",
the blank one still reads "Day 2", and a 30-character name doesn't blow out the row.

---

## Step 3: Pull last week's numbers for a whole exercise at once

**Status: not started.** The only step of 1–4 still outstanding.

**The problem.** The ghost row *is* the control — tapping it fills that set from last week
(`src/views/day.js:168`). That is a nice piece of design, but it is per-set: a four-set
exercise needs four taps before you can start editing, and you take them one-handed with a
phone in the other.

**What changes.** One button per exercise card that fills every set that has something to
fill. No new concept — it is the action that already exists, at the scope people actually
want it.

The wiring needs a small change: the fill logic currently lives inside a click handler
closed over within `setRow`, so nothing above it can call it. `setRow` returns the node
today; it should return the node plus its fill function, and `exerciseCard` wires the
card-level button to call each one. The button is disabled when no set in the card has a
previous record.

**Test surface.** None automated — it is view wiring over `store.findPrevious`, which
`tests/state.test.js` already covers thoroughly.

**Hand-check.** An exercise with a full history (all sets fill, gain badges update), one with
a partial history (only the sets that have a previous fill), one with none (button disabled).
Confirm cardio fills distance and time, not kg and reps.

---

## Step 4: Say when the day was last trained

**Status: shipped** (`7d51cd9`). `lastLoggedAt` in `src/state.js`, rendered by
`lastTrainedNote` in `src/views/day.js` through `day.lastLogged`. `formatAge` gained the
`style` argument this needed, so the line reads "3 days ago" rather than the ghost tag's
"3d ago".

**The problem.** Records have carried an `at` timestamp since schema 3
(`src/state.js:22`), and nothing on the log screen shows it. "Week 3, Day 2" tells you
nothing about whether that was Tuesday or in March — which matters most when you come back
to a block after a break and cannot remember where you actually stopped.

**What changes.** A pure helper returning the most recent `at` across a day's records, or
null. The day view renders it under the heading with the existing `formatAge`
(`src/format.js:66`), which already produces exactly this shape of string for the
cross-block ghost tag.

Records written before schema 3 have no timestamp; they get no line, the same rule the ghost
tag already follows. Better nothing than a wrong date.

**Test surface.** The new helper in `tests/state.test.js`: newest of several, a day with no
records, and a day whose records predate `at`.

**Hand-check.** Log a set and confirm the line appears and reads sensibly in both locales.

---

## Step 5: User-defined exercises

**Status: shipped.** `state.exercises` in `progression:v2`, a `makeLookup`/registry pair in
`src/catalog.js`, and a fourth screen in `src/views/exercises.js`.

Three deviations from what is described below. **The registry alone was not safe enough:**
anything that can delete — `normalizeState`, `normalizePlan`, `normalizeEntry` — takes an
explicit lookup argument instead, because `parseBackup` normalizes a candidate file *before*
the import confirm (`app.js:205`), so a list installed during normalization would survive a
cancelled import and the next plan edit would delete every custom slot. The registry is kept
for the read path only. **`CATALOG` stayed the shipped 22** rather than becoming a merged
list, which is what let `tests/i18n.test.js` go untouched — the parity worry below never
fired. And **the picker became a filter over one-tap rows** rather than a `<select>` with a
filter field, since a native wheel cannot be filtered at all.

**The problem.** The catalog is 22 hardcoded entries (`src/catalog.js:34`). Anything you
actually do that isn't on that list cannot be logged. This is already the stated next feature
in both the README and `catalog.js`'s own header comment, and the module is deliberately
indirected for it — nothing outside `catalog.js` touches `CATALOG` directly.

**Do this before the polish steps below.** It is the only step that changes the storage
schema, and with no installed base and no backup files in circulation, it will never be
cheaper.

**What changes.**

- **Schema.** A user exercise list in the log state (`progression:v2`), not in preferences —
  it is user data, so it belongs in the backup, the same argument that puts plans there. Ids
  need a prefix that can never collide with a catalog slug, since both are written into plans
  and resolved through one lookup.
- **The lookup.** `findExercise`/`byGroup`/`entryFields`/`exerciseKind`/`isKnownExercise`
  have to see the user's list. Threading it through every call site is invasive — `slotName`
  in `plan.js` and `entryFields` in `day.js` sit deep in view code. Module-level registry
  state set by the store on write is the pragmatic shape, and there is precedent for exactly
  that in this codebase: `setLocale` in `src/i18n/index.js` works the same way. Tests have to
  reset it, which is the cost.
- **One ordering trap.** `normalizeSlot` (`src/plan.js:110`) *drops* any slot whose
  `exerciseId` the catalog doesn't know, taking its records with it. So `normalizeState` must
  normalize the user's exercises **before** it normalizes plans, or the first load after an
  import silently deletes every custom slot in the file. This is the one thing in this step
  that fails quietly rather than loudly.
- **Deleting a custom exercise** orphans every slot using it, exactly like removing a day
  orphans records. It needs the same count-before-you-do-it treatment `countOrphans` already
  models for the plan editor.
- **The picker** (`src/views/planEditor.js:164`) is a grouped `<select>`, which on iOS is a
  wheel. That is survivable at 22 entries and not at 60. This step should bring a filter
  field with it.

**Test surface.** Substantial, and all of it pure: normalization order, id collision, the
lookup falling through to user exercises, orphan counting on delete, and `tests/i18n.test.js`
continuing to hold (a user exercise has a typed name and no translation — the test that every
catalog exercise is named in every language must not start demanding the same of these).

**Bookkeeping.** The only step that adds a file, if the user-exercise store lands as its own
module — `SHELL` in `sw.js` must gain it. `src/state.js`'s schema header comment documents
the new key.

---

## Step 6: Reach the editor from the day you are looking at

**Status: not started.**

**The problem.** Adding an exercise to today costs five screens: Log → Manage plans → Edit →
scroll to the right day → add → Done. The empty-day state already offers the shortcut
(`src/views/day.js:263-273`); a day with exercises on it does not.

**What changes.** The recommended version is the cheap one: an "Edit this day" action on the
day view that opens the editor, scrolled to that day's card. `onEditPlan` is already plumbed
through `renderDayView` for the empty state, so this is mostly reuse.

**The alternative, deliberately not taken.** A genuinely in-place "add exercise to today"
would mean week-scoped slots — because a plan is the template for *every* week, so adding an
exercise from the Week 3 screen would silently rewrite Weeks 1 and 2 as well. There is
precedent for week-scoping (set counts are already per-week overrides in `setCounts`), so it
is buildable. It is not worth building yet: it doubles what a plan means, and there is no
evidence from actually using the app that the shortcut above is insufficient. Revisit only
if the deep-link still feels wrong after a few weeks of real use.

**Test surface.** None automated. Hand-check that the editor opens on the right day and that
Done returns somewhere sensible — note that `savePlan` currently always lands on Plans
(`src/app.js:173`), which is the wrong destination when you arrived from the log screen.

---

## Step 7: Make backup export work in an installed iOS app

**Status: not started**, including the `markExported()` ordering fix below, which is a
one-line change independent of whatever the iOS check turns up.

**The problem.** `exportBackup` (`src/app.js:178`) builds a blob URL and clicks a synthetic
`<a download>`. In an iOS home-screen PWA there is no download chrome, and that anchor has
historically been a dead end. The install banner (`src/views/banners.js:53`) actively pushes
users into precisely that mode, and the README's whole data-safety story — WebKit evicts
localStorage after about 7 days — rests on export working there.

**Verify before building.** This is a claim about iOS behaviour, not about this code. Install
the app to a real home screen, tap Back up now, and see what happens. If the file lands, this
step is closed for free.

**What changes if it doesn't.** Feature-detect `navigator.canShare({ files })` and hand the
JSON to the share sheet — Files, Mail, iCloud Drive — keeping the anchor as the fallback for
every other platform. Building the JSON is synchronous, so the share call stays inside the
tap's user activation, which Safari requires.

**One thing to fix either way.** `markExported()` is called *before* the download is
attempted (`src/app.js:179`), so the "last backup" timestamp is stamped and the reminder
banner goes quiet whether or not a file was ever produced. With a share sheet — which the
user can cancel — that becomes actively wrong. Stamp on success only.

**Test surface.** None automated (`Blob`, `navigator.share`, and the DOM are all involved).
Hand-check on a real iPhone in standalone mode, plus a desktop browser to confirm the
fallback path still downloads.

---

## Step 8: Say what an import is about to replace

**Status: not started.**

**The problem.** Restoring a backup replaces everything and the confirmation
(`src/app.js:206`) does not say what "everything" currently is. Restore an old file onto a
device with newer sessions on it and they are gone, with nothing having warned you what you
were trading.

**What changes.** `parseBackup` already returns a fully normalized state before anything is
written, so both sides are countable at that moment. The confirmation names them: what is on
the device now, and what the file holds. `countPlanEntries` and the plan count give the
numbers; both need plural-safe keys, not hand-written singular/plural.

A real merge is not proposed. Record keys are plan-scoped, so merging two files means
reconciling plan ids, and there is no correct answer when the same plan has diverged on two
devices. Telling the truth before replacing is the honest version of this feature.

**Test surface.** None new — the counting functions are already covered. The change is the
message.

---

## Not scheduled, and why

- **Undo for destructive actions.** Every mutator writes through immediately and every
  destructive action is a `window.confirm`, which is a jarring system modal in a standalone
  PWA. Undo would need a snapshot held outside the store and fights the no-save-button design
  the whole app is built on. Filed as an accepted cost, not a task.
- **Starter plan templates.** Decided against in
  `docs/superpowers/specs/2026-07-29-plans-first-navigation-design.md` — creating a plan
  starts from a blank draft, and the seeded example was removed on purpose rather than kept
  as an opt-in. Reopening that is a product decision, not a next step.
- **Charts, volume stats, progression maths, accounts, cloud sync, timers.** Out of scope by
  decision; see the end of `README.md`.
