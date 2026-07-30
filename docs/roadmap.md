# Roadmap — the next steps, in order

**Date:** 2026-07-30
**Status:** steps 1–6 and 8 shipped; 7 outstanding, and 9 added by what its verification found
(see `docs/ios-export-2026-07-30.md`)

Nine steps, each one shippable on its own and each leaving the app in a working state. They
are ordered to be done one at a time, top to bottom: later steps assume earlier ones have
landed, and doing them out of order means reworking the same code twice (noted per step
where it matters). Steps 1–8 were planned as a set; step 9 was found on the device on
2026-07-30 while verifying step 7, and is appended rather than renumbered into place.

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
  is small enough to finish in one sitting. None of them changes the storage schema. All four
  have landed.
- **Step 5 changed the schema, and doing it early was the point.** It landed while there was
  no installed base to migrate and no backup file in anyone's inbox to stay compatible with,
  which is why it came before the polish steps rather than after them.

Step 7 is a launch blocker rather than an urgent fix: nothing is at stake until there is
something to lose, but the app cannot be handed to a real person before it is done. Step 9 looked
like the harder blocker of the two when it was found — it makes a logged session *look* deleted on
the target platform, and looking deleted is what makes someone stop trusting a training log — but
**step 7 goes first, because step 9's only known trigger is step 7's own export path.** Nothing
else in the app leaves the document, and backgrounding the app does not reproduce it (checked
2026-07-30). If step 7 ships `navigator.share`, which opens a native sheet without navigating, the
one route into step 9 may close on its own. That does not retire step 9 — the latent fault in
`numericField` is real and any future navigation re-opens it — but it stops being the thing a user
meets first.

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

**The problem.** The week and day chips (`src/views/selectors.js:22-30`) carried no state at
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

**The problem.** The day chips (`src/views/selectors.js:47-58`) always rendered
`t("header.dayChip", { n })` — "Day 1", "Day 2" — even after the user had named the day "Push"
in the editor. The heading directly below them (`src/views/day.js:325`) did use the name, so the
same day was called two different things one line apart. (`header.dayChip` no longer exists:
both now go through `dayLabel`, which falls back to `plan.dayFallback`.)

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

**Status: shipped.** `setRow` returns `{ node, fill, canFill }`; `exerciseCard` drives every
row from one `.btn` in the `.ex-actions` row, spoken through `exercise.fillSets`.

Two deviations. **It fills only the empty boxes** — the roadmap left the question open, and
overwriting a card's worth of typed numbers on one tap has no undo anywhere in this app, so the
per-set ghost row stays the way to replace something already logged. That rule turned out to be
decidable after all, so it went to the pure layer as `fillableFields` in `src/state.js` with
tests, rather than staying the view wiring this step predicted. **The disabled state is live**:
each row reports back through a new `onEntryChange`, so the button switches off when the last
box is filled and on again when one is cleared, without a `render()`.

**The problem.** The ghost row *is* the control — tapping it fills that set from last week
(`src/views/day.js:73`). That is a nice piece of design, but it is per-set: a four-set
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
(`src/state.js:25`), and nothing on the log screen shows it. "Week 3, Day 2" tells you
nothing about whether that was Tuesday or in March — which matters most when you come back
to a block after a break and cannot remember where you actually stopped.

**What changes.** A pure helper returning the most recent `at` across a day's records, or
null. The day view renders it under the heading with the existing `formatAge`
(`src/format.js:67`), which already produces exactly this shape of string for the
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
the import confirm (`app.js:337`), so a list installed during normalization would survive a
cancelled import and the next plan edit would delete every custom slot. The registry is kept
for the read path only. **`CATALOG` stayed the shipped 22** rather than becoming a merged
list, which is what let `tests/i18n.test.js` go untouched — the parity worry below never
fired. And **the picker became a filter over one-tap rows** rather than a `<select>` with a
filter field, since a native wheel cannot be filtered at all.

**The problem.** The catalog is 22 hardcoded entries (`src/catalog.js:49`). Anything you
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
- **One ordering trap.** `normalizeSlot` (`src/plan.js:111`) *drops* any slot whose
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

**Status: shipped.** One `editor = { returnTo, dayId }` variable in `app.js`, mirroring
`exercisesReturn`, carries both halves: Done goes back where the editor was opened from, and
`renderPlanEditor` takes a `focusDayId` that marks that day's card with the existing
`.card--active` outline.

**The scroll is the focus move.** `render()` already moves focus on a screen change, so the
arrival card takes that instead of the screen title and comes into view for free — no
`scrollIntoView`, and focus and viewport stay together. It only works in that order: the block
runs after the `scrollTo(0, 0)` in the anchor check, and focusing the heading as well would
snap the page back to the top.

**One deviation.** There is a single button, not two: the empty day's "Edit this plan" became
the same deep-linked "Edit this day", which is the truth about where it lands, so
`day.emptyAction` is gone. The picker is deliberately *not* pre-opened on arrival — it would
push the day's own rows out of view and is wrong when you came to reorder, for one tap saved.

**The problem it fixed.** Adding an exercise to today cost five screens: Log → Manage plans →
Edit → scroll to the right day → add → Done. The empty-day state offered the shortcut
(`src/views/day.js:317-322`); a day with exercises on it did not.

**The alternative, deliberately not taken.** A genuinely in-place "add exercise to today"
would mean week-scoped slots — because a plan is the template for *every* week, so adding an
exercise from the Week 3 screen would silently rewrite Weeks 1 and 2 as well. There is
precedent for week-scoping (set counts are already per-week overrides in `setCounts`), so it
is buildable. It is not worth building yet: it doubles what a plan means, and there is no
evidence from actually using the app that the shortcut above is insufficient. Revisit only
if the deep-link still feels wrong after a few weeks of real use.

**Test surface.** None automated, as predicted — it is navigation state and DOM all the way
down. Hand-checked in a headless browser at 320px in both locales: the arrival card, the focus
move, the Done destination from all three entry points (a day, Plans, a new plan), and
reordering or deleting the day you came from.

**Found while checking, fixed in a follow-up.** With five days the header's chip rows overflowed
a 320px viewport — the whole page scrolled sideways. It predated this step (measured identically
at `1bcdfdb`): `.selectors` is a grid, and a bare `1fr` track is `minmax(auto, 1fr)`, so the
track grew to the chip row's min-content instead of letting `.seg` scroll. `minmax(0, 1fr)` is
the whole fix. At the limit — ten days with long names — the row wanted 940px inside a 288px box.

---

## Step 7: Make backup export work in an installed iOS app

**Status: verified, not built.** The `markExported()` ordering fix below shipped on its own. The
iPhone check is now done — iPhone 14 / iOS 26.3.1, full trace in
`docs/ios-export-2026-07-30.md` — and it **falsified the premise of this step**, so what remains
to build is a different thing than what was planned. Rewritten below rather than deleted, for the
same reason the shipped steps are kept.

**What the check found.** The anchor is not a dead end. `link.click()` in standalone mode replaces
the app with a full-screen preview showing the correct filename
(`progression-backup-2026-07-30.json`, `JSON - 3 KB`), and its share sheet — reached either from
the bottom-bar icon or the "Abrir com…" link, which lead to the same place — offers **Salvar em
Arquivos**, AirDrop, E-mail and the rest. The file that came off the phone re-imports byte-identical
through `parseBackup`, and its `lastExport` is the export moment, five minutes after the last set,
so the shared-`now` property holds on WebKit too.

So iOS export *works today*, three taps down a screen that advertises none of them. It failed in
practice anyway: the person running the check wrote `exportBackup` and still did not find "Salvar em
Arquivos", so nothing reached Files and Restore could not be tested at all. **The problem is
discoverability, not capability.**

**The problem, restated.** Two things are now wrong on the one platform whose storage gets evicted
after ~7 days, and which the install banner (`src/views/banners.js:53`) actively pushes people onto:

- The export's own screen does not say how to keep the file, and the app vanishes behind it.
- `markExported()` stamps when the *preview* opens. Dismiss it with `✕` and the app has recorded
  a backup, gone quiet about the reminder, and produced no file. That is the ordinary outcome of
  the ordinary gesture — no longer a theoretical limit of the anchor.

**What to build — the second point is now the stronger argument.** Feature-detect
`navigator.canShare({ files })` and hand the JSON to the share sheet, keeping the anchor for every
other platform. Building the JSON is synchronous, so the call stays inside the tap's user
activation, which Safari requires. It gains no new *destinations* — it is the same sheet the preview
already reaches — so justify it on the two things it does gain: one tap instead of three
undiscovered ones, and a promise that rejects on cancel, which is the only way `markExported()` can
become truthful on iOS. Confirm `canShare({ files })` is true for a JSON file on the device before
committing to it; the cheap alternative is a standalone-and-iOS-only line naming the two taps,
which fixes discoverability and leaves the stamp lying.

**The round trip is confirmed.** Salvar em Arquivos → Restaurar backup restores: the picker opens
in standalone mode, the saved `.json` is selectable through `accept="application/json,.json"`, and
the import reported success. So **nothing here has to be built for iOS to work** — what is left is
discoverability and a stamp that tells the truth. `README.md`'s "downloads … keep it wherever you
like" is wrong for installed iOS and wants a sentence either way.

**Two things the check found that are not this step** — the day's inputs coming back blank after
the preview is dismissed (now step 9) and the post-import jump to Plans (deliberate; the reasoning
is recorded in the findings note so it does not get "fixed").

**The desktop half was answered first**, and it is the fallback the iOS work must not disturb: on
2026-07-30 a real (not headless) Chrome on Linux
was driven through the whole flow and the file landed — `progression-backup-2026-07-30.json`, no
download prompt, and the on-screen "Last backup" stamp equal to the file's own `lastExport` to the
second. So the anchor path and the shared-`now` property both hold in a real browser. Nothing about
WebKit followed from this — Chrome was never the engine under suspicion — but it did mean the
iPhone check could not be confounded by a bug in the export itself.

**One thing to fix either way — shipped.** `markExported()` used to be called *before* the
download was attempted, so the "last backup" timestamp was stamped and the reminder banner went
quiet whether or not a file was ever produced. It now runs after the anchor click, which is as
close to "on success" as a synthetic `<a download>` gets — the anchor cannot report whether the
browser accepted the file, and that is exactly why the share sheet, which *can* be cancelled,
still needs its own handling here.

The serialized copy takes the same `now` as the stamp (`{ ...store.state, lastExport: now }`),
so the file still describes the moment it was written. Without that, a restored backup would
arrive claiming the export before it and could show the reminder immediately.

**Test surface.** None automated (`Blob`, `navigator.share`, and the DOM are all involved).
Hand-check on a real iPhone in standalone mode — done for the current code on 2026-07-30, and to be
redone for whatever ships — plus a desktop browser to confirm the fallback path still downloads.

The ordering fix was checked in headless Chrome over CDP instead, which is enough for a
download: `Browser.setDownloadBehavior` with `behavior: "allow"` makes the synthetic click
actually write a file, and breaking `URL.createObjectURL` on purpose covers the failure the fix
is about. Two things to know if that gets rewritten — the app lands on Plans, so Backup is not
on screen until "Back to training" is clicked; and an exception thrown inside a click handler
does not propagate out of `.click()`, so a broken export looks exactly like a missing button
unless you listen for `window` errors.

---

## Step 8: Say what an import is about to replace

**Status: shipped.** `summarizeState` in `src/state.js` and `importMessage` in `src/app.js`.

**The problem.** Restoring a backup replaced everything and the confirmation did not say what
"everything" currently was. Restore an old file onto a device with newer sessions on it and they
are gone, with nothing having warned you what you were trading.

**What changed.** `parseBackup` already returns a fully normalized state before anything is
written, so both sides are countable at that moment — and the file's own numbers are never
trusted, only the normalized ones. The confirmation names what is on the device now, what the
file holds, and when the file was made. `lastExport` travels inside the file, and step 7's
ordering fix is what makes that date trustworthy: it is now the moment the file was written.

Two things went beyond the letter of this step, both deliberate:

- **One key per line, not one template per case.** Dated or not, and empty device or not, is four
  whole templates to keep in step in every locale. Each key is still a complete sentence — no key
  is a fragment of a clause and no punctuation is glued on in code — and the conditional lines
  then cost nothing. `{plans}` and `{records}` are filled with the plural fragments
  `plans.planCount` (new, beside the existing `weekCount`/`dayCount`/`recordCount`) and
  `plans.recordCount`, so each of the four counts gets its own `Intl.PluralRules` category. The
  `{slots} day(s) across {plans} plan(s)` fudge in `exercises.removeConfirm` is not repeated.
- **A device with nothing on it gets a softer message** ("This device has no plans or records
  yet… Restore it?"). Restoring onto an empty device costs nothing, and leading with a REPLACE
  warning there teaches people to dismiss the dialog. Mirrors `removeConfirm`/`removeConfirmEmpty`.
  The test is `plans === 0 && records === 0`: a plan with no records still has something to lose.

`summarizeState` counts records off the entry keys rather than by summing `countPlanEntries`,
which is only correct while every record belongs to a plan — `normalizeState` guarantees it and
both sides of this confirm have been through it. That invariant is what its test pins.

A real merge is not proposed. Record keys are plan-scoped, so merging two files means
reconciling plan ids, and there is no correct answer when the same plan has diverged on two
devices. Telling the truth before replacing is the honest version of this feature.

**Test surface.** `summarizeState` has a suite in `tests/state.test.js`; key parity and the
plural-entries suite in `tests/i18n.test.js` cover the new keys with no edit needed. The message
itself is `app.js`, so it was checked in headless Chrome over CDP: `DOM.setFileInputFiles` on
`#import-file` feeds the hidden input a real file and fires `change` itself, and `window.confirm`
and `window.alert` are replaced in the page to record their text instead of blocking — 21 checks
across both locales, the dated and undated file, the fresh device, and the singular counts.

One trap worth knowing if that script is rewritten: pre-serialize the two localStorage values and
pass them as string literals. Calling `JSON.stringify` in the page as well stores a quoted JSON
string, `normalizePrefs` reads it as no prefs at all, and the locale under test silently becomes
whatever the browser prefers — which is how a first run of that check "passed" entirely in pt-BR.

---

## Step 9: The day's inputs come back blank after a navigation away

**Status: not started.** Added 2026-07-30, found by step 7's iPhone check rather than by design;
full trace in `docs/ios-export-2026-07-30.md`.

**The problem.** Export a backup on installed iOS, dismiss the full-screen preview with `✕`, and
you land back on the day you were on with **every exercise field empty**. Move to another day and
back and the numbers return. Nothing was lost — the records are in `localStorage` throughout, and
the exported file proves it — but the app has shown a person an empty workout at the exact moment
it told them their data was safe. That is a worse first impression than a failed export.

It is not a reload: after a reload the app lands on Plans, since `screen` is a closure variable
initialized to `"plans"` and never persisted (`src/app.js:35`). The DOM survived; its inputs were
emptied.

**Why it happens.** `numericField` passes `value: show()` to `el()` (`src/views/fields.js:33`), and
`el()` assigns unhyphenated keys **as properties** (`src/dom.js:31`) — as do the `blur` handler and
`sync()`. So the displayed number exists only as the IDL property and the `value` *attribute*, which
is the input's default value, is never set. Any WebKit form-state restore or reset drops the field
to that empty default while the store stays correct, and the next `render()` repaints it.

**What changes.** Make the default value real: set the `value` attribute alongside the property,
inside `numericField` where all three assignments live. That is the whole fix, it needs no event
listener, and it is correct regardless of which WebKit path does the resetting. The alternative —
re-`render()` on `pageshow` when `event.persisted` — stays a fallback for the case where the
attribute turns out not to be what iOS restores from; it is broader but only fires on the
page-cache path.

**The trigger was narrowed on 2026-07-30, and it is step 7's own path.** Backgrounding the app for
several minutes and returning does **not** reproduce it: the app comes back on the day view with
every field filled, so freeze/resume is not the mechanism and `visibilitychange` has nothing to
repair. What is left is a session-history navigation — the anchor click takes the document to the
`blob:` URL and `✕` comes back — which is why the closure survives while the inputs reset. Since
`render()` never leaves the document and the app has no outbound links, **the export preview is
currently the only way to reach this**, which is why step 7 is sequenced first: a `navigator.share`
export never navigates, and would close the route. Fix `numericField` anyway — the fault is latent,
not gone, and the next feature that opens a document re-exposes it.

**Confirm before or while fixing** (neither needs a fix in hand): that export → `✕` blanks the
fields *every* time, since it has been seen once; and that export → **Salvar em Arquivos** → back
does it too. If saving leaves the numbers alone, the history-navigation story is wrong and the
trigger is the dismissal specifically.

**Test surface.** The attribute-vs-property rule is `dom.js`, which has no DOM tests and cannot get
any — but "does `numericField` set both" is decidable and could be pinned if `fields.js` ever gets a
seam. Otherwise: hand-check on the iPhone, and confirm the desktop fill/blur/`sync` behaviour is
unchanged, since `sync()` is what the ghost row and step 3's card-level fill both call.

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
