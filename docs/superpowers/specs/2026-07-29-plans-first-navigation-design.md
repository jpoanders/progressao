# Plans-first navigation and a truly empty fresh install

**Date:** 2026-07-29
**Status:** approved, not yet implemented

## The problem

The app already has full multi-plan support — a plan library screen (`views/plans.js`), a
plan editor (`views/planEditor.js`), and store methods for creating, editing, duplicating,
and deleting plans (`src/state.js`). What it does not have is a plans-first *home*:

- The app opens on the **Log** screen, resuming whichever plan/week/day prefs last pointed
  at. Plans is a screen you navigate *into*, not the front door.
- A fresh install seeds one fully-built example (`DEFAULT_PLAN` in `src/plan.js` — five
  days, bench press, squats, and so on) so there is always something to log against. A new
  user never sees an empty app; they see someone else's plan.
- Because a plan always exists, the whole render path — `activePlan()`, `activeWeek()`,
  `activeDay()`, `deletePlan()` — is written assuming `store.plans.length >= 1` always
  holds. `deletePlan` explicitly refuses to drop the last plan.

None of that is a bug — it's a reasonable design for an app that has always shipped with a
starter block. But it means the app cannot currently do the two things asked for: land on a
plan menu, and start with nothing preset, letting the user build their own first plan from a
blank slate.

## What changes

Two coupled changes:

1. **Plans becomes the permanent landing screen.** Every app open — cold launch, reload,
   post-import — starts on the plan library. Navigating into a plan (`Use`) still works
   exactly as it does today and stays there for the session; only the *first thing you see*
   changes.
2. **A fresh install starts with zero plans**, not one seeded example. `DEFAULT_PLAN` and
   `defaultPlan()` are deleted. The data model, which currently treats "at least one plan"
   as an invariant, is relaxed to tolerate zero — deleting your only plan is now allowed,
   and the render path handles `activePlan() === null`.

### Out of scope

No new plan attributes (goals, difficulty, tags, templates). A plan is still exactly what
`views/planEditor.js` already builds: a name, a week count, and a list of days each holding
an ordered list of exercise slots. This spec changes *when you first see the editor and
what happens before you've used it*, not what it produces. No template/"start from example"
option either — creating a plan always starts from a blank draft, per the decision to remove
the seeded plan entirely rather than keep it as an opt-in.

## Design

### 1. Navigation

`src/app.js` initializes `let screen = "plans"` instead of `"log"`. Since `screen` is
already documented as in-memory-only and never persisted (CLAUDE.md: "reopening the app in
the editor would be exactly wrong halfway through a session"), this is the entire change for
cold-start behavior — every reload now starts at the plan library regardless of what was
active before.

`handleImportFile` currently hardcodes `screen = "log"` after a successful import. That
becomes `screen = "plans"` (or simply `goTo("plans")`), which is both consistent with the
new philosophy and sidesteps an edge case: an imported backup could legitimately contain zero
plans once `DEFAULT_PLAN` is no longer a fallback (see §2), and there would be nothing for
`"log"` to show.

`renderPlansView`'s existing "Back" button (`onBack: () => goTo("log")`) only makes sense
when there's an active plan to return to. It's rendered conditionally on `activePlanId`
being non-null — with zero plans, or before the user has ever tapped **Use** on one, there's
nothing to go back to and the button is omitted.

**Invariant that keeps the rest of the app simple:** the `"log"` screen is only ever entered
through `usePlan(plan)`, which is only ever called with a real plan object from a non-empty
list (the card you tapped). So `views/day.js` and everything the Log screen renders can
continue to assume a real, active plan — no empty-state branching needed inside the Log
screen itself. All the "zero plans" handling concentrates in the screens that *can* be
entered with nothing yet: Plans and Editor.

### 2. Data model: tolerating zero plans

`src/plan.js`: delete `DEFAULT_PLAN` and `defaultPlan()`.

`src/state.js`:
- `emptyState()` starts with `plans: []`.
- `normalizePlans()` currently falls back to `[defaultPlan()]` when the incoming array ends
  up empty (after filtering invalid/duplicate entries). That fallback is removed — an empty
  array is now a valid, terminal result. This also means a corrupt or duplicate-id-laden
  backup can legitimately normalize to zero plans; that's fine, it lands the user on an empty
  Plans screen instead of failing to import.
- `deletePlan()` drops its `if (state.plans.length <= 1) return false` guard. Deleting your
  only remaining plan is now allowed and returns `true`, taking every one of its records with
  it exactly like any other delete. The `plans.removeLast` alert in `app.js`'s `deletePlan`
  wrapper, and its i18n key, are removed since the case they guarded against no longer exists.

`src/app.js` `render()`: `activePlan()` can now return `null`. Concretely:

```js
const plan = activePlan();          // may be null
const week = plan ? activeWeek(plan) : null;
const day  = plan ? activeDay(plan) : null;
```

`renderSelectors` (the week/day chip bar) is already gated on `isLog`, and `isLog` can only
be true when a plan exists (per the invariant in §1), so it needs no additional guard.
`currentView(plan, week, day)` passes `plan` through to `renderPlansView` as
`activePlanId: plan?.id ?? null` — the Plans screen only ever compares this against real
plan ids in its card list, so `null` simply matches nothing, which is correct when nothing is
active. The Editor branch already ignores `plan`/`week`/`day` (it only reads `draft`), so it
is unaffected. The `"log"` branch keeps assuming a non-null `plan` per the invariant above.

The scroll-anchor string (`` `${screen}|${plan.id}|${week}|${day.id}` ``) needs the same
null-safe treatment, e.g. `plan?.id ?? "none"`, `week ?? ""`, `day?.id ?? ""`.

### 3. Plans screen empty state

`views/plans.js` currently renders a title, zero or more plan cards, and a `Create`/`Back`
action row — it never had to consider zero cards because a plan always existed. With zero
plans this is a legitimate first-run (or post-delete-everything) view. Add a short message
above the action row, shown only when `store.plans.length === 0`, using the existing `.note`
style (no new CSS): something like *"No plans yet — create one to start logging."* (exact
copy goes through `t()`, new key `plans.empty` in both locales). The `Create plan` button is
unaffected and remains the primary action; `Back` is omitted per §1.

### 4. Plan creation itself is unchanged

`views/planEditor.js` already covers the full attribute set a plan needs: a free-text
**name** (seeded as `t("plans.newName")`, i.e. "New plan"), a **week count** (stepper, 1–24,
default 4), and a list of **days**, each with its own optional name and an ordered list of
**exercise slots** (exercise, set count, rep range), added from the catalog picker. Tapping
`Create plan` opens this editor on a blank draft exactly as it does today
(`newPlan(t("plans.newName"))` → one empty day). Tapping `Done` saves and returns to the
Plans screen (`goTo("plans")`, already the case), where the user's new plan now appears as a
card and they tap `Use` to start logging. Nothing here changes; it's included so the full
create-a-plan path is documented in one place.

## Testing

`tests/state.test.js`:
- `describe("a fresh install", ...)` — `"starts on the built-in plan..."` is replaced with an
  assertion that a fresh store starts with `plans.length === 0` and `state.entries` empty.
- `describe("deletePlan", ...)` — the *"refuses to delete the last plan"* test is replaced
  with the opposite: deleting the only remaining plan succeeds, returns `true`, and leaves
  `store.plans` empty.
- Any other fixture currently built via `defaultPlan()` for convenience gets a small local
  fixture built from `newPlan()`/`newDay()`/`newSlot()` instead.

`tests/plan.test.js`:
- `describe("the built-in plan", ...)` (lines ~30–65) is deleted entirely — every assertion
  in it is about `DEFAULT_PLAN`, which no longer exists.
- `describe("lookups", ...)` currently seeds itself with `defaultPlan()` purely as a
  multi-day/multi-slot fixture (unrelated to default-plan semantics); replace with a small
  hand-built fixture plan local to that test file.

`tests/i18n.test.js` continues to enforce key parity automatically — removing
`plan.defaultName`, `plan.defaultDays.*`, and `plans.removeLast` from `en.js` and
`pt-BR.js`, and adding `plans.empty`, keeps it passing as long as both locale files are kept
in sync.

### Hand-checks

`views/plans.js`, `app.js`'s screen wiring, and the render-path null handling have no
automated coverage (no DOM in `node --test`). In the browser (`npm run serve`), with
storage cleared, in both locales:

- Fresh load lands on Plans, showing the new empty-state message and a `Create plan` button,
  no `Back` button.
- Creating a plan, filling in a day and an exercise, and tapping `Done` returns to Plans with
  the new plan listed and no crash.
- Tapping `Use` enters the Log screen and logging works normally.
- Reloading the page (simulating app relaunch) returns to Plans, not the Log screen you were
  just on.
- From Plans, deleting your only plan succeeds, returns to an empty Plans screen with the
  empty-state message back, `Back` button gone.
- Importing a backup lands on Plans afterward regardless of how many plans it contains,
  including a backup with zero plans.

## Bookkeeping

- `SHELL` in `sw.js` is **untouched** — no files are added, renamed, or removed.
- `CACHE_VERSION` `progression-v7` → `progression-v8` (shipped files change: `app.js`,
  `plan.js`, `state.js`, `views/plans.js`, `i18n/en.js`, `i18n/pt-BR.js`).
- The guard literal on the last line of `tests/service-worker.test.js` moves
  `progression-v6` → `progression-v7`.
- `src/state.js`'s schema header doesn't need a version bump (no storage schema shape
  change) but its "a fresh install still needs something to log against, so it starts on the
  built-in plan" comment on `emptyState()` is now wrong and must be corrected.
- `src/plan.js`'s header comment references `DEFAULT_PLAN` in its module doc — update once
  it's removed.

## Files touched

| File | Change |
|---|---|
| `src/plan.js` | delete `DEFAULT_PLAN`, `defaultPlan()`; update module doc comment |
| `src/state.js` | `emptyState()` → `plans: []`; `normalizePlans()` drops the default-plan fallback; `deletePlan()` drops the last-plan guard; update `emptyState()` comment |
| `src/app.js` | initial `screen = "plans"`; `handleImportFile` lands on `"plans"`; `render()`/`currentView()` tolerate `plan === null`; `deletePlan()` wrapper drops the `removeLast` alert |
| `src/views/plans.js` | empty-state message when `store.plans.length === 0`; `Back` shown only when an active plan exists |
| `src/i18n/en.js`, `src/i18n/pt-BR.js` | remove `plan.defaultName`, `plan.defaultDays.*`, `plans.removeLast`; add `plans.empty` |
| `sw.js` | `CACHE_VERSION` |
| `tests/state.test.js`, `tests/plan.test.js`, `tests/service-worker.test.js` | per Testing section above |
