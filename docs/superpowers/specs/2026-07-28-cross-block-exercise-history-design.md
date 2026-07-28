# Cross-block exercise history

**Date:** 2026-07-28
**Status:** approved, not yet implemented

## The problem

The README opens with the app's promise: *"when you open an exercise, you see what you did
last time on that same exercise — the target to beat."*

The code implements something narrower. `findPrevious` (`src/state.js`) walks earlier weeks
of **one slot** inside **one plan** and stops. The two readings agree until a block ends,
and then they diverge:

- `duplicatePlan` mints fresh slot ids so the copy "starts with a clean history". Re-running
  your own block loses every target.
- `usePlan` resets to week 1, where nothing has a previous record by definition.

So the natural user action — *new block, same lifts* — is the one action the data model
punishes, and week 1 of a new block is exactly when knowing your bench number matters most.
The app quietly pushes the user toward a single 24-week plan they never restart.

Slot-scoped history is not the mistake. It is what makes renaming, reordering, and repeating
an exercise safe, and it stays. What is missing is a fallback for when the slot has nothing
to say.

## What changes

`findPrevious` gains a second lookup: when the in-plan walk finds nothing, it returns the
newest record for the same **exercise** and the same **set index** from any **other** plan.

Ordering across plans needs a time axis the app does not have — `week` is plan-relative and
`lastExport` is the only timestamp in the whole state. So records gain a timestamp.

### Out of scope

No charts, volume stats, progression maths, or projections. This adds one field and one
fallback branch. `setGain` is untouched, and the app still only ever reports a gain.

## Design

### 1. Data model

Entries gain one optional field:

```js
entries["p1|3|s-bench|0"] = { kg: 72.5, reps: 8, at: 1753660800000 }
```

`at` is epoch ms, written by `setEntryField` on every write. Because `views/fields.js`
already writes through on each keystroke, `at` means *last touched* — the right meaning for
recency, and it costs nothing extra.

`STATE_VERSION` goes `2 → 3`. **`STATE_KEY` stays `"progression:v2"`.** The key names the
storage slot, not the schema revision; renaming it would strand every existing user's log on
upgrade. The schema header in `src/state.js` must say so, because the mismatch otherwise
reads as an oversight. (`state.version` is currently decorative — nothing branches on it.)

Two consequences in `src/state.js`:

- **`entryHasData` needs no change.** It tests `ENTRY_FIELDS` (`kg`/`reps`/`dist`/`time`),
  and `at` is not one of them. A record whose values are all cleared still deletes itself,
  carrying `at` out with it.
- **`normalizeEntry` does need a change.** It rebuilds a clean object from `entryFields()`
  alone and would silently drop `at` on every load — the exact trap CLAUDE.md warns about
  for new fields. It must carry `at` through as a finite number or `null`, while still
  deciding *filled* from the value fields only, so `{ at }` with no values normalizes away.

### 2. Recency ordering

Every pre-existing record and every pre-v3 backup normalizes to `at: null`. If `at` were the
only sort key, the first upgrade would order a user's entire history arbitrarily. Recency is
therefore:

1. `at` descending, `null` last
2. plan order descending (plans are appended in creation order)
3. week descending

The plan-order heuristic is not discarded — it becomes the deterministic tiebreaker that
makes the upgrade well-behaved and keeps the whole comparison total.

### 3. The lookup

A new pure function in `src/state.js`:

```js
newestByExercise(state) → Map<`${exerciseId}|${setIndex}`, Record[]>
```

It folds every entry once, resolving each key's slot to an `exerciseId` through the same
`planIndex` machinery `normalizeState` already uses. The value is **one best record per
plan**, sorted best-first by the ordering above.

Per-plan rather than one global winner is load-bearing. If the map kept only the single
newest record and that record sat in the plan currently being viewed — the Monday-heavy /
Thursday-light bench case — the lookup would return nothing, even though another block holds
a perfectly good record. Keeping one entry per plan and skipping the current one at read time
is what makes the rule below actually hold. The array is one element per plan, so it stays
small.

`findPrevious(state, planId, week, slotId, setIndex, index = newestByExercise(state))` reads:

1. Same slot, earlier week, same plan — **the existing walk, unchanged**.
2. Otherwise, the newest record for `exerciseId|setIndex` from **any plan but this one**.
3. Otherwise `null`.

Step 2 excludes the current plan entirely. A plan can place the same exercise twice on
purpose (`src/plan.js` documents this), and those placements are separate progressions:
letting a 15-rep back-off set become the target for a heavy triple would be worse than
showing nothing.

The return value gains a discriminator, because the caller labels the two cases differently:

```js
{ source: "plan",  week: 3, kg: 72.5, reps: 8 }
{ source: "other", at: 1753660800000, kg: 70, reps: 8 }
```

`week` is meaningful only when `source === "plan"`. `setGain` is unaffected — it reads only
`kg`/`reps`/`dist`, so a cross-block target is compared exactly like an in-block one.

The `index` parameter defaults to computing the index, so the existing five-argument test
calls in `tests/state.test.js` keep working unchanged; the store passes its memo in to avoid
rebuilding the table once per set row.

### 4. Store wiring

`createStore` memoizes the index:

```js
let exerciseIndex = null;
const index = () => (exerciseIndex ??= newestByExercise(state));
```

Invalidation hooks into **`saveState()`**, not into each mutator. Every entry-writing and
plan-writing path already funnels through it, so a mutator added later cannot forget to
invalidate — the one failure mode that would make this cache serve a target that no longer
exists. `replaceState` reassigns `state` and then calls `saveState`, so import is covered.

`store.findPrevious(planId, week, slotId, setIndex)` keeps its signature and passes `index()`
down. The call site at `src/views/day.js:80` does not change.

The index is a **projection, never persisted**. The "state is self-consistent" doctrine is
untouched: there is no second source of truth to corrupt, and because it is a pure function
over state it is testable under `node --test` like the rest of the logic layer.

### 5. Ghost row

`src/views/day.js` branches on `previous.source` for two strings:

| | `source: "plan"` | `source: "other"` |
|---|---|---|
| visible tag | `exercise.weekTag` → `w3` | `exercise.ageTag` → `3 wk. ago` |
| aria-label | `exercise.useLastStrength` / `useLastCardio`, taking `{week}` | `exercise.useOlderStrength` / `useOlderCardio`, taking `{age}` |

Three new keys per locale (`ageTag`, `useOlderStrength`, `useOlderCardio`) in both
`src/i18n/en.js` and `src/i18n/pt-BR.js`. `tests/i18n.test.js` enforces the parity.

Formatting goes in `src/format.js` as `formatAge(timestamp, localeTag, now)`, beside the
existing `formatDateTime(timestamp, localeTag)` and following the same rule — locale passed
in, never imported, so it stays testable. `Intl.RelativeTimeFormat` with `style: "narrow"`,
picking days under a week, weeks under a month, months beyond.

**CSS risk.** The tag sits in `--set-trail: 66px` (`styles/app.css:61`), and that token is
part of `--set-cols`, which the *input* row shares — widening it steals width from the fields
being typed into. `w3` → `3 wk. ago` should sit just inside 66px at 11px/600 with 0.06em
tracking, and `há 3 sem.` similar, but that is an estimate of text metrics, not a proven fact.
Narrow style is chosen specifically to stay inside the existing budget. Verify in the browser
in both locales before shipping; only widen `--set-trail` if it actually overflows, and check
the input row when doing so.

No colour is added — the tag stays `--ghost`, so the one-colour rule in the `app.css` header
holds.

## Testing

New coverage in `tests/state.test.js`, all reachable because the logic stayed pure:

- falls back to another plan's record when this plan has none
- prefers the newest `at` across several plans
- **excludes the current plan** — the Monday/Thursday case returns `null`, not the light day's
  numbers
- falls back to plan-order-then-week when every `at` is `null` (the upgrade path)
- `setIndex` must match — no record for set 4 elsewhere means no target
- `normalizeState` preserves `at`, rejects a non-finite one, and does not treat `at` alone as
  data
- the in-plan walk still wins over any cross-plan record

New coverage in `tests/format.test.js`: `formatAge` in both locales, across the day/week/month
unit boundaries.

### Hand-checks

`views/`, `dom.js`, `app.js` and `main.js` have no automated coverage and cannot get any
without a DOM. In the browser (`npm run serve`), in both locales:

- ghost row shows an older block's number in a fresh plan, tagged with its age
- tapping the ghost row still fills the inputs
- the gain badge still fires against a cross-block target
- the tag does not overflow `--set-trail`, and the input row is unchanged

## Bookkeeping

- `SHELL` in `sw.js` is **untouched** — no files are added or renamed.
- `CACHE_VERSION` `progression-v6` → `progression-v7`.
- The guard literal on the last line of `tests/service-worker.test.js` moves
  `progression-v5` → `progression-v6`.
- Update the schema header in `src/state.js` (the `at` field, and why the key stays `v2`).
- Update the README: the "each carries its own history, so starting a new block starts a
  clean slate" sentence is no longer true as written.

## Files touched

| File | Change |
|---|---|
| `src/state.js` | `at` in `normalizeEntry`; `newestByExercise`; `findPrevious` fallback; store memo + invalidation; `STATE_VERSION`; schema header |
| `src/format.js` | `formatAge` |
| `src/views/day.js` | branch on `previous.source` for tag and aria-label |
| `src/i18n/en.js`, `src/i18n/pt-BR.js` | three new keys each |
| `styles/app.css` | only if the tag overflows in practice |
| `sw.js` | `CACHE_VERSION` |
| `tests/state.test.js`, `tests/format.test.js`, `tests/service-worker.test.js` | above |
| `README.md` | clean-slate sentence |
