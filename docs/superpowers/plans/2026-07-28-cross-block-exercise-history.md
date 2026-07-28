# Cross-Block Exercise History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a slot has no earlier week logged in the current plan, show the newest record for the same exercise and set index from any *other* plan — so starting a new block no longer wipes every target to beat.

**Architecture:** Records gain an `at` timestamp (week numbers are plan-relative and cannot order two plans against each other). A new pure function `newestByExercise(state)` folds all entries into a lookup table holding one best record per plan per `exerciseId|setIndex`. `findPrevious` keeps its existing in-plan walk untouched and only consults that table when the walk comes up empty. The table is a projection, never persisted; the store memoizes it and drops the memo in `saveState()`.

**Tech Stack:** Vanilla ES modules, no dependencies, no build. `node:test` + `node:assert/strict`. `Intl.RelativeTimeFormat` for the age label.

**Spec:** `docs/superpowers/specs/2026-07-28-cross-block-exercise-history-design.md`

## Global Constraints

- **No dependencies, no build step, no framework.** Do not add a package, bundler, or transpile step. `node_modules` does not exist and must not start existing.
- **Mobile Safari is the target.** Conservative DOM APIs only.
- **`sw.js` `SHELL` is a hand-maintained file list.** This plan adds no files under `src/`, `styles/`, `icons/`, or `fonts/`, so `SHELL` must NOT change. If you find yourself creating a new source file, stop — that is a deviation from the plan.
- **`CACHE_VERSION` in `sw.js` must be bumped** because shipped files change: `progression-v6` → `progression-v7`. The last line of `tests/service-worker.test.js` must move its guard literal `progression-v5` → `progression-v6`. `sw.js` is a classic script using **single quotes** — the test parses `SHELL` and `CACHE_VERSION` with single-quote regexes.
- **No user-facing literal strings in view code**, including `aria-label`s. Everything goes through `t("dot.separated.key")`.
- **Plurals** use an object of `Intl.PluralRules` categories with `{ n }`. Never hand-write `n === 1`.
- **`tests/i18n.test.js` enforces exact key parity with English.** Any key added to `src/i18n/en.js` must also be added to `src/i18n/pt-BR.js`.
- **Style:** double quotes, semicolons, 2-space indent, ~100 column lines. Comments explain *why*, not *what*. Test names read as sentences.
- **Colour is spent in exactly one place**, the gain badge (`--gain`). Add no colour.
- Run the whole suite with `npm test`. A single file: `node --test tests/state.test.js`.

---

### Task 1: `formatAge` in the format layer

Pure, self-contained, no dependents yet. Lands first so later tasks can use it.

**Files:**
- Modify: `src/format.js` (append after `formatDateTime`, before `isoDateStamp`)
- Test: `tests/format.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `formatAge(timestamp, localeTag, now = Date.now()) → string`. Returns `""` for a non-finite timestamp or a future one. Otherwise a localized relative-time string, narrow style: minutes under an hour, hours under a day, days under a week, weeks under 30 days, months beyond.

Note `src/format.js` takes the locale tag as a **parameter** and never imports i18n — that is what keeps it testable under `node --test`. Follow that.

- [ ] **Step 1: Write the failing tests**

Append to `tests/format.test.js`:

```js
describe("formatAge", () => {
  const NOW = Date.UTC(2026, 6, 28, 12, 0, 0);
  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;

  // Compared against Intl rather than a hardcoded string: this asserts our unit and sign
  // choice, which is the part we wrote, without pinning the exact wording ICU produces.
  const expected = (value, unit, tag = "en") =>
    new Intl.RelativeTimeFormat(tag, { numeric: "auto", style: "narrow" }).format(value, unit);

  it("counts minutes within the hour", () => {
    assert.equal(formatAge(NOW - 20 * MINUTE, "en", NOW), expected(-20, "minute"));
  });

  it("counts hours within the day", () => {
    assert.equal(formatAge(NOW - 5 * HOUR, "en", NOW), expected(-5, "hour"));
  });

  it("counts days within the week", () => {
    assert.equal(formatAge(NOW - 3 * DAY, "en", NOW), expected(-3, "day"));
  });

  it("counts weeks up to a month", () => {
    assert.equal(formatAge(NOW - 3 * WEEK, "en", NOW), expected(-3, "week"));
  });

  it("counts months beyond that", () => {
    assert.equal(formatAge(NOW - 90 * DAY, "en", NOW), expected(-3, "month"));
  });

  it("speaks the locale it is given", () => {
    assert.equal(formatAge(NOW - 3 * WEEK, "pt-BR", NOW), expected(-3, "week", "pt-BR"));
  });

  it("has nothing to say about a record with no timestamp", () => {
    // Records written before the `at` field existed. The ghost row still works; it just
    // carries no age.
    assert.equal(formatAge(null, "en", NOW), "");
    assert.equal(formatAge(undefined, "en", NOW), "");
    assert.equal(formatAge(Number.NaN, "en", NOW), "");
  });

  it("does not report a negative age from a clock that moved backwards", () => {
    assert.equal(formatAge(NOW + DAY, "en", NOW), "");
  });
});
```

Add `formatAge` to the existing import at the top of `tests/format.test.js`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/format.test.js`
Expected: FAIL — `formatAge is not a function` (or an import error naming `formatAge`).

- [ ] **Step 3: Write the implementation**

In `src/format.js`, after `formatDateTime`:

```js
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

/**
 * How long ago a record was logged, for the ghost row's tag ("3 wk. ago").
 *
 * Narrow style deliberately: the tag shares a 66px column with the week tag it replaces,
 * and a wider string would steal room from the inputs below it. Records written before the
 * `at` field existed have no timestamp and get no tag rather than a wrong one.
 */
export function formatAge(timestamp, localeTag, now = Date.now()) {
  if (!Number.isFinite(timestamp)) return "";

  const elapsed = now - timestamp;
  if (elapsed < 0) return "";

  const relative = new Intl.RelativeTimeFormat(localeTag, {
    numeric: "auto",
    style: "narrow",
  });

  if (elapsed < HOUR) return relative.format(-Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return relative.format(-Math.floor(elapsed / HOUR), "hour");
  if (elapsed < WEEK) return relative.format(-Math.floor(elapsed / DAY), "day");
  if (elapsed < MONTH) return relative.format(-Math.floor(elapsed / WEEK), "week");
  return relative.format(-Math.floor(elapsed / MONTH), "month");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/format.test.js`
Expected: PASS.

Then run the whole suite to confirm nothing else moved: `npm test` → 132 + 8 passing, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add src/format.js tests/format.test.js
git commit -m "Add formatAge for the ghost row's age tag"
```

---

### Task 2: Timestamp every record

Adds the `at` field and the injectable clock that makes it testable. **Three existing assertions break here on purpose** — they deep-equal an entry that now carries `at`.

**Files:**
- Modify: `src/state.js` — schema header comment, `STATE_VERSION`, `normalizeEntry`, `createStore` signature, `setEntryField`
- Test: `tests/state.test.js` (new cases, plus repair of three existing ones)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `createStore(storage = globalThis.localStorage, { now = () => Date.now() } = {})` — second parameter is new and optional, so `src/main.js:31` (`createStore()`) needs no change.
  - Entry shape `{ kg, reps, at? } | { dist, time, at? }`. `at` is **omitted entirely** when absent or non-finite, never written as `null`.
  - `STATE_VERSION === 3`. `STATE_KEY` stays `"progression:v2"`.

**Deviation from the spec, deliberate:** the spec said `normalizeEntry` carries `at` through "as a finite number or null". Omitting the key instead is equivalent for every consumer (`at ?? -Infinity` handles both) and avoids rewriting every existing entry assertion in the suite and every stored record on disk. Sorting in Task 3 must therefore tolerate a **missing** `at`, not just a null one.

- [ ] **Step 1: Write the failing tests**

Add to `tests/state.test.js`, inside the existing `describe("normalizeState")` block:

```js
  it("keeps a record's timestamp", () => {
    const normalized = normalizeState(
      stateWith(plan, { entries: { "p1|1|s-bench|0": { kg: 60, reps: 8, at: 1753660800000 } } }),
    );
    assert.deepEqual(normalized.entries["p1|1|s-bench|0"], {
      kg: 60,
      reps: 8,
      at: 1753660800000,
    });
  });

  it("drops a timestamp that is not a number", () => {
    const normalized = normalizeState(
      stateWith(plan, { entries: { "p1|1|s-bench|0": { kg: 60, reps: 8, at: "yesterday" } } }),
    );
    assert.deepEqual(normalized.entries["p1|1|s-bench|0"], { kg: 60, reps: 8 });
  });

  it("does not treat a timestamp on its own as data worth keeping", () => {
    const normalized = normalizeState(
      stateWith(plan, { entries: { "p1|1|s-bench|0": { at: 1753660800000 } } }),
    );
    assert.equal(normalized.entries["p1|1|s-bench|0"], undefined);
  });
```

Add a new `describe` for the clock (place it next to the existing store-write suite):

```js
describe("a record's timestamp", () => {
  it("is stamped from the injected clock on every write", () => {
    const store = createStore(fakeStorage({ [STATE_KEY]: JSON.stringify(stateWith(testPlan())) }), {
      now: () => 1000,
    });

    store.setEntryField("p1", 1, "s-bench", 0, "kg", 60);
    assert.deepEqual(store.getEntry("p1", 1, "s-bench", 0), { kg: 60, at: 1000 });
  });

  it("moves forward when the record is edited again", () => {
    let clock = 1000;
    const store = createStore(fakeStorage({ [STATE_KEY]: JSON.stringify(stateWith(testPlan())) }), {
      now: () => clock,
    });

    store.setEntryField("p1", 1, "s-bench", 0, "kg", 60);
    clock = 2000;
    store.setEntryField("p1", 1, "s-bench", 0, "reps", 8);

    assert.deepEqual(store.getEntry("p1", 1, "s-bench", 0), { kg: 60, reps: 8, at: 2000 });
  });

  it("goes away with the record when the last field is cleared", () => {
    const store = createStore(fakeStorage({ [STATE_KEY]: JSON.stringify(stateWith(testPlan())) }), {
      now: () => 1000,
    });

    store.setEntryField("p1", 1, "s-bench", 0, "kg", 60);
    store.setEntryField("p1", 1, "s-bench", 0, "kg", null);

    assert.equal(store.getEntry("p1", 1, "s-bench", 0), null, "a bare timestamp is not a record");
  });
});
```

Now repair the three assertions that this task breaks — they deep-equal an entry that now carries `at`. Both fixes give the store a fixed clock so the expected value stays a literal.

In `tests/state.test.js` around **line 358**, replace:

```js
    store.setEntryField("p1", 1, "s-bench", 0, "kg", 60);
    assert.deepEqual(storage.read(STATE_KEY).entries["p1|1|s-bench|0"], { kg: 60 });

    store.setEntryField("p1", 1, "s-bench", 0, "reps", 8);
    assert.deepEqual(store.getEntry("p1", 1, "s-bench", 0), { kg: 60, reps: 8 });
```

with:

```js
    store.setEntryField("p1", 1, "s-bench", 0, "kg", 60);
    assert.deepEqual(storage.read(STATE_KEY).entries["p1|1|s-bench|0"], { kg: 60, at: 1000 });

    store.setEntryField("p1", 1, "s-bench", 0, "reps", 8);
    assert.deepEqual(store.getEntry("p1", 1, "s-bench", 0), { kg: 60, reps: 8, at: 1000 });
```

and change that test's store construction to pass the clock — whatever line currently builds it becomes:

```js
    const store = createStore(storage, { now: () => 1000 });
```

Around **line 559**, replace:

```js
    store.setEntryField("plan-default", 1, "d1-s1", 0, "kg", 60);
    assert.deepEqual(store.getEntry("plan-default", 1, "d1-s1", 0), { kg: 60 });
```

with:

```js
    store.setEntryField("plan-default", 1, "d1-s1", 0, "kg", 60);
    assert.deepEqual(store.getEntry("plan-default", 1, "d1-s1", 0), { kg: 60, at: 1000 });
```

and likewise give that test's store `{ now: () => 1000 }` as its second argument.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/state.test.js`
Expected: FAIL — the new timestamp cases fail because `normalizeEntry` strips `at` and `setEntryField` never writes one.

- [ ] **Step 3: Write the implementation**

In `src/state.js`:

Bump the version constant:

```js
export const STATE_VERSION = 3;
```

Update the schema header comment at the top of the file. Replace the `entries:` line and add a note under it:

```js
 *     entries:   { "<planId>|<week>|<slotId>|<setIndex>": { kg, reps, at? } | { dist, time, at? } },
```

and add this paragraph after the storage-schema block:

```js
 * `at` is epoch ms of the last write to that record. It exists so records can be ordered
 * across plans, where week numbers are meaningless — see findPrevious. It is absent on
 * records written before schema 3, which sort below any timestamped record.
 *
 * The key stays "progression:v2" at schema 3 on purpose: the key names the storage slot,
 * not the schema revision, and renaming it would strand every existing log.
```

Rewrite `normalizeEntry` to carry `at` without letting it count as data:

```js
/** Keeps only the fields this exercise actually logs, and only if something is filled in. */
function normalizeEntry(raw, slot) {
  if (!isPlainObject(raw)) return null;

  const entry = {};
  let filled = false;
  for (const field of entryFields(slot.exerciseId)) {
    entry[field] = asNumber(raw[field]);
    if (entry[field] != null) filled = true;
  }
  if (!filled) return null;

  // Carried after the fill check: a bare timestamp is not a record. Omitted rather than
  // stored as null so records written before schema 3 stay byte-identical.
  if (Number.isFinite(raw.at)) entry.at = raw.at;
  return entry;
}
```

Add the clock to the store signature:

```js
export function createStore(storage = globalThis.localStorage, { now = () => Date.now() } = {}) {
```

and stamp it in `setEntryField`:

```js
    /** Writes one field of one set. Rows left entirely empty are removed, not stored. */
    setEntryField(planId, week, slotId, setIndex, field, value) {
      const key = entryKey(planId, week, slotId, setIndex);
      const entry = { ...state.entries[key] };
      entry[field] = value;

      if (entryHasData(entry)) {
        entry.at = now();
        state.entries[key] = entry;
      } else {
        delete state.entries[key];
      }
      saveState();
    },
```

`entryHasData` is unchanged: it tests `ENTRY_FIELDS`, which does not include `at`, so a row whose values are all cleared still deletes itself and carries the timestamp out with it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 0 failing. If `normalizeState` "accepts a well-formed state unchanged" fails, `at` is being written as `null` instead of omitted — fix that rather than the test.

- [ ] **Step 5: Commit**

```bash
git add src/state.js tests/state.test.js
git commit -m "Timestamp every logged record

Week numbers are plan-relative, so they cannot order two plans against
each other. An `at` epoch on each record gives cross-plan recency a fact
to sort on. Absent on pre-schema-3 records, which sort last."
```

---

### Task 3: `newestByExercise`

The lookup table. Pure function, no store involvement yet.

**Files:**
- Modify: `src/state.js` — new import, new exported function
- Test: `tests/state.test.js`

**Interfaces:**
- Consumes: entry shape with optional `at` from Task 2.
- Produces: `newestByExercise(state) → Map<string, Record[]>` where the key is `` `${exerciseId}|${setIndex}` `` and the value is **one record per plan, sorted most-recent-first**. Record shape:

```js
{ planId: string, planOrder: number, week: number, entry: { kg, reps, at? } }
```

Recency order, applied in this sequence: `at` descending with missing last, then `planOrder` descending, then `week` descending.

One record **per plan** rather than one global winner is load-bearing. If the table kept only the single newest record and it happened to live in the plan being viewed, Task 4's lookup would find nothing to fall back to even though another block holds a usable record.

- [ ] **Step 1: Write the failing tests**

Add to `tests/state.test.js`. Note `testPlan()` already places `bench-press` at slot `s-bench`:

```js
describe("newestByExercise", () => {
  const twoPlans = (entries) =>
    normalizeState({
      plans: [testPlan(), { ...testPlan(), id: "p2" }],
      entries,
    });

  it("indexes a record by its exercise and set, not by its slot", () => {
    const index = newestByExercise(twoPlans({ "p1|1|s-bench|0": { kg: 60, reps: 8, at: 100 } }));

    assert.equal(index.get("bench-press|0").length, 1);
    assert.deepEqual(index.get("bench-press|0")[0].entry, { kg: 60, reps: 8, at: 100 });
  });

  it("keeps the newest record of each plan, not just the newest overall", () => {
    const index = newestByExercise(
      twoPlans({
        "p1|1|s-bench|0": { kg: 60, reps: 8, at: 100 },
        "p1|2|s-bench|0": { kg: 65, reps: 8, at: 200 },
        "p2|1|s-bench|0": { kg: 70, reps: 8, at: 300 },
      }),
    );

    const records = index.get("bench-press|0");
    assert.equal(records.length, 2, "one per plan");
    assert.deepEqual(
      records.map((record) => record.planId),
      ["p2", "p1"],
      "most recent plan first",
    );
    assert.equal(records[1].entry.kg, 65, "p1 is represented by its newer record");
  });

  it("sorts a record with no timestamp below one that has it", () => {
    const index = newestByExercise(
      twoPlans({
        "p1|1|s-bench|0": { kg: 60, reps: 8 },
        "p2|1|s-bench|0": { kg: 70, reps: 8, at: 1 },
      }),
    );

    assert.deepEqual(
      index.get("bench-press|0").map((record) => record.planId),
      ["p2", "p1"],
    );
  });

  it("falls back to plan order then week when nothing is timestamped", () => {
    // The state every existing user upgrades into: no record carries `at`.
    const index = newestByExercise(
      twoPlans({
        "p1|1|s-bench|0": { kg: 60, reps: 8 },
        "p1|3|s-bench|0": { kg: 62, reps: 8 },
        "p2|1|s-bench|0": { kg: 70, reps: 8 },
      }),
    );

    const records = index.get("bench-press|0");
    assert.deepEqual(
      records.map((record) => record.planId),
      ["p2", "p1"],
      "the later-created plan wins",
    );
    assert.equal(records[1].week, 3, "and within a plan, the later week");
  });

  it("keys each set index separately", () => {
    const index = newestByExercise(
      twoPlans({
        "p1|1|s-bench|0": { kg: 60, reps: 8, at: 100 },
        "p1|1|s-bench|1": { kg: 55, reps: 8, at: 100 },
      }),
    );

    assert.equal(index.get("bench-press|0")[0].entry.kg, 60);
    assert.equal(index.get("bench-press|1")[0].entry.kg, 55);
  });

  it("is empty for an exercise nothing has been logged against", () => {
    const index = newestByExercise(twoPlans({}));
    assert.equal(index.get("bench-press|0"), undefined);
  });
});
```

Add `newestByExercise` to the existing import block at the top of `tests/state.test.js`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/state.test.js`
Expected: FAIL — `newestByExercise is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/state.js`, add `findSlot` to the existing `./plan.js` import:

```js
import { MAX_SETS, clampSets, defaultPlan, findPlan, findSlot, normalizePlan, weeksOf } from "./plan.js";
```

Then add, above `findPrevious`:

```js
/**
 * Sort comparator, most recent first: timestamp, then plan order, then week.
 *
 * The two fallbacks are not decoration. Every record written before schema 3 has no
 * timestamp, so on the first upgrade `at` alone would leave a user's whole history in
 * arbitrary order. Plan order (plans are appended as they are created) and week make the
 * comparison total.
 */
function byRecency(a, b) {
  const aAt = a.entry.at ?? -Infinity;
  const bAt = b.entry.at ?? -Infinity;
  if (aAt !== bAt) return bAt - aAt;
  if (a.planOrder !== b.planOrder) return b.planOrder - a.planOrder;
  return b.week - a.week;
}

/**
 * Every logged exercise, indexed by `exerciseId|setIndex` — what lets a new block inherit
 * the target to beat from an older one.
 *
 * Holds one record *per plan* rather than a single winner: the newest record for a lift may
 * well sit in the plan the user is looking at, and findPrevious has to be able to skip past
 * it to the next plan down. The array is one element per plan, so it stays small.
 *
 * A projection, never stored. The store rebuilds it on demand and throws it away on write.
 */
export function newestByExercise(state) {
  const planOrder = new Map(state.plans.map((plan, index) => [plan.id, index]));
  const exerciseOf = new Map(
    state.plans.flatMap((plan) =>
      plan.days.flatMap((day) =>
        day.slots.map((slot) => [`${plan.id}|${slot.id}`, slot.exerciseId]),
      ),
    ),
  );

  const bestPerPlan = new Map();
  for (const [key, entry] of Object.entries(state.entries)) {
    const [planId, week, slotId, setIndex] = key.split("|");
    const exerciseId = exerciseOf.get(`${planId}|${slotId}`);
    if (exerciseId === undefined) continue;

    const candidate = { planId, planOrder: planOrder.get(planId), week: Number(week), entry };
    const indexKey = `${exerciseId}|${setIndex}`;

    let perPlan = bestPerPlan.get(indexKey);
    if (!perPlan) bestPerPlan.set(indexKey, (perPlan = new Map()));

    const held = perPlan.get(planId);
    if (!held || byRecency(candidate, held) < 0) perPlan.set(planId, candidate);
  }

  return new Map(
    [...bestPerPlan].map(([indexKey, perPlan]) => [
      indexKey,
      [...perPlan.values()].sort(byRecency),
    ]),
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add src/state.js tests/state.test.js
git commit -m "Index logged records by exercise and set

One record per plan, sorted most-recent-first, so findPrevious can skip
the plan it was asked about and still find an older block's record."
```

---

### Task 4: The cross-plan fallback

Wires the table into `findPrevious` and memoizes it in the store. **This task rewrites `tests/state.test.js:290`, `"never leaves the plan it was asked about"` — that test asserts the exact behaviour this feature removes.** Replace it; do not delete it silently.

**Files:**
- Modify: `src/state.js` — `findPrevious`, `createStore` memo
- Test: `tests/state.test.js`

**Interfaces:**
- Consumes: `newestByExercise(state)` from Task 3.
- Produces: `findPrevious(state, planId, week, slotId, setIndex, index = newestByExercise(state))`. Return shape gains a discriminator:

```js
{ source: "plan",  week: 3, kg: 72.5, reps: 8 }          // in-plan, as before plus `source`
{ source: "other", at: 1753660800000, kg: 70, reps: 8 }  // another plan; `week` is absent
```

The `index` parameter defaults to computing the table, so the existing five-argument test calls keep working; the store passes its memo in to avoid rebuilding it once per set row.

- [ ] **Step 1: Write the failing tests**

In `tests/state.test.js`, the existing `describe("findPrevious")` block: every in-plan assertion now needs `source: "plan"`. Update the three deep-equals:

```js
  it("walks back to the most recent earlier week", () => {
    assert.deepEqual(findPrevious(state, "p1", 4, "s-bench", 0), {
      source: "plan",
      week: 3,
      kg: 65,
      reps: 8,
    });
  });

  it("falls through a skipped week", () => {
    assert.deepEqual(findPrevious(state, "p1", 3, "s-bench", 0), {
      source: "plan",
      week: 1,
      kg: 60,
      reps: 8,
    });
  });

  it("has nothing to offer in week 1", () => {
    assert.equal(findPrevious(state, "p1", 1, "s-bench", 0), null);
  });
```

Replace `"never leaves the plan it was asked about"` entirely with a new suite:

```js
describe("findPrevious across blocks", () => {
  const twoPlans = (entries) =>
    normalizeState({ plans: [testPlan(), { ...testPlan(), id: "p2" }], entries });

  it("inherits the target to beat from an older block", () => {
    const state = twoPlans({ "p1|1|s-bench|0": { kg: 60, reps: 8, at: 100 } });

    assert.deepEqual(findPrevious(state, "p2", 1, "s-bench", 0), {
      source: "other",
      kg: 60,
      reps: 8,
      at: 100,
    });
  });

  it("prefers the block that was logged most recently", () => {
    const state = normalizeState({
      plans: [testPlan(), { ...testPlan(), id: "p2" }, { ...testPlan(), id: "p3" }],
      entries: {
        "p1|1|s-bench|0": { kg: 60, reps: 8, at: 300 },
        "p2|1|s-bench|0": { kg: 70, reps: 8, at: 100 },
      },
    });

    assert.equal(findPrevious(state, "p3", 1, "s-bench", 0).kg, 60);
  });

  it("still prefers this block's own history over any other", () => {
    const state = twoPlans({
      "p1|1|s-bench|0": { kg: 60, reps: 8, at: 100 },
      "p2|1|s-bench|0": { kg: 90, reps: 8, at: 999 },
    });

    assert.deepEqual(findPrevious(state, "p1", 2, "s-bench", 0), {
      source: "plan",
      week: 1,
      kg: 60,
      reps: 8,
      at: 100,
    });
  });

  it("never offers a record from the block being viewed", () => {
    // The same lift placed twice in one plan — heavy on one day, light on another — is two
    // progressions on purpose. A back-off set must not become the target for a heavy one.
    const plan = testPlan();
    plan.days[1].slots.push({
      id: "s-bench-light",
      exerciseId: "bench-press",
      name: null,
      nameKey: null,
      sets: 3,
      reps: [12, 15],
    });
    const state = normalizeState({
      plans: [plan],
      entries: { "p1|1|s-bench-light|0": { kg: 40, reps: 15, at: 100 } },
    });

    assert.equal(
      findPrevious(state, "p1", 2, "s-bench", 0),
      null,
      "the heavy slot shows no target rather than the light slot's numbers",
    );
  });

  it("matches the set index", () => {
    const state = twoPlans({ "p1|1|s-bench|0": { kg: 60, reps: 8, at: 100 } });
    assert.equal(findPrevious(state, "p2", 1, "s-bench", 3), null);
  });

  it("has nothing to offer for a lift never logged anywhere", () => {
    const state = twoPlans({ "p1|1|s-bench|0": { kg: 60, reps: 8, at: 100 } });
    assert.equal(findPrevious(state, "p2", 1, "s-abs", 0), null);
  });

  it("orders untimestamped blocks by creation order", () => {
    const state = normalizeState({
      plans: [testPlan(), { ...testPlan(), id: "p2" }, { ...testPlan(), id: "p3" }],
      entries: {
        "p1|1|s-bench|0": { kg: 60, reps: 8 },
        "p2|1|s-bench|0": { kg: 70, reps: 8 },
      },
    });

    assert.equal(findPrevious(state, "p3", 1, "s-bench", 0).kg, 70);
  });
});
```

And a store-level test for the memo, next to the other store suites:

```js
describe("the exercise index the store memoizes", () => {
  it("reflects a record written after it was first read", () => {
    const store = createStore(
      fakeStorage({
        [STATE_KEY]: JSON.stringify({
          version: STATE_VERSION,
          lastExport: null,
          plans: [testPlan(), { ...testPlan(), id: "p2" }],
          entries: {},
          setCounts: {},
        }),
      }),
      { now: () => 1000 },
    );

    assert.equal(store.findPrevious("p2", 1, "s-bench", 0), null, "nothing logged yet");

    store.setEntryField("p1", 1, "s-bench", 0, "kg", 60);

    assert.equal(
      store.findPrevious("p2", 1, "s-bench", 0)?.kg,
      60,
      "a stale memo would still say null",
    );
  });

  it("forgets what an imported backup replaced", () => {
    const store = createStore(
      fakeStorage({
        [STATE_KEY]: JSON.stringify({
          version: STATE_VERSION,
          lastExport: null,
          plans: [testPlan(), { ...testPlan(), id: "p2" }],
          entries: { "p1|1|s-bench|0": { kg: 60, reps: 8, at: 100 } },
          setCounts: {},
        }),
      }),
    );

    assert.equal(store.findPrevious("p2", 1, "s-bench", 0)?.kg, 60);

    store.replaceState({
      version: STATE_VERSION,
      lastExport: null,
      plans: [testPlan(), { ...testPlan(), id: "p2" }],
      entries: {},
      setCounts: {},
    });

    assert.equal(store.findPrevious("p2", 1, "s-bench", 0), null);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/state.test.js`
Expected: FAIL — the cross-block suite gets `null` where it expects a record, and the in-plan assertions fail on the missing `source` key.

- [ ] **Step 3: Write the implementation**

Replace `findPrevious` in `src/state.js`:

```js
/**
 * The "target to beat".
 *
 * First the slot's own history: the most recent filled record of the same set in an earlier
 * week of the same plan. That is the precise answer and it always wins.
 *
 * Failing that, the same *exercise* at the same set index from any other plan. This is what
 * carries a lift's numbers across a block boundary — without it, week 1 of every new plan
 * shows nothing, which is exactly when knowing the number matters most.
 *
 * Records from the plan being viewed are never offered as the fallback. One plan can place
 * the same exercise twice on purpose (heavy day, light day); those are separate
 * progressions, and crossing them would suggest a target from the wrong kind of work.
 */
export function findPrevious(
  state,
  planId,
  week,
  slotId,
  setIndex,
  index = newestByExercise(state),
) {
  for (let candidate = week - 1; candidate >= 1; candidate--) {
    const entry = getEntry(state, planId, candidate, slotId, setIndex);
    if (entryHasData(entry)) return { source: "plan", week: candidate, ...entry };
  }

  const plan = findPlan(state.plans, planId);
  const slot = plan && findSlot(plan, slotId);
  if (!slot) return null;

  const elsewhere = (index.get(`${slot.exerciseId}|${setIndex}`) ?? []).find(
    (record) => record.planId !== planId,
  );
  return elsewhere ? { source: "other", ...elsewhere.entry } : null;
}
```

Note the returned object spreads `elsewhere.entry`, which already carries `at` when it has one — no separate assignment.

In `createStore`, add the memo above `persist`:

```js
  /**
   * The exercise index is derived, so it is cached rather than stored — and dropped in
   * saveState() rather than in each mutator, because every write already funnels through
   * there. A mutator added later cannot forget to invalidate it.
   */
  let exerciseIndex = null;
  const index = () => (exerciseIndex ??= newestByExercise(state));
```

and invalidate inside `persist`'s callers by adding one line to `saveState`:

```js
  const saveState = () => {
    exerciseIndex = null;
    persist(STATE_KEY, state);
  };
```

Then pass it through in the returned object:

```js
    findPrevious: (planId, week, slotId, setIndex) =>
      findPrevious(state, planId, week, slotId, setIndex, index()),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add src/state.js tests/state.test.js
git commit -m "Carry the target to beat across block boundaries

findPrevious falls back to the same exercise and set index from another
plan when this plan has no earlier week logged. Records from the plan
being viewed are never offered: one plan can place a lift twice on
purpose, and those are separate progressions."
```

---

### Task 5: The ghost row shows where the record came from

**Files:**
- Modify: `src/views/day.js` — imports, `setRow`
- Modify: `src/i18n/en.js`, `src/i18n/pt-BR.js` — two new keys each
- Test: none automated (no DOM under `node --test`); `tests/i18n.test.js` covers key parity automatically

**Interfaces:**
- Consumes: `formatAge` (Task 1), `previous.source` / `previous.at` (Task 4).
- Produces: no new exports.

**Deviation from the spec, deliberate:** the spec listed three new i18n keys including `exercise.ageTag`. Only two are needed. `Intl.RelativeTimeFormat` already returns localized text, so an `ageTag` key would be a bare `"{age}"` passthrough that adds a lookup and no translation. The other two keys (`useOlderStrength`, `useOlderCardio`) are real sentences and do need translating. The no-literal-strings rule still holds: nothing user-facing is hardcoded in the view.

- [ ] **Step 1: Add the i18n keys**

In `src/i18n/en.js`, directly after `useLastCardio`:

```js
      // The block a record came from is not named: the tag beside it already says how long
      // ago, and a plan name would not fit the row.
      useOlderStrength: "Use {kg} × {reps} from an earlier block, set {set}",
      useOlderCardio: "Use {dist} · {time} from an earlier block, set {set}",
```

In `src/i18n/pt-BR.js`, in the same position:

```js
      useOlderStrength: "Usar {kg} × {reps} de um bloco anterior, {set}ª série",
      useOlderCardio: "Usar {dist} · {time} de um bloco anterior, {set}ª série",
```

- [ ] **Step 2: Run the i18n tests to verify parity holds**

Run: `node --test tests/i18n.test.js`
Expected: PASS. A failure here means the two locales disagree on the key set — fix the locale file, not the test.

- [ ] **Step 3: Update the view**

In `src/views/day.js`, extend the two existing imports:

```js
import { formatAge, formatNumber, roundNumber } from "../format.js";
import { activeLocale, ordinal, t } from "../i18n/index.js";
```

Inside `setRow`, after `const previous = store.findPrevious(planId, week, slot.id, setIndex);`, add:

```js
  // A record from an older block has no week number that means anything here, so the tag
  // shows its age instead. Pre-schema-3 records carry no timestamp and get no tag.
  const fromOtherBlock = previous?.source === "other";
  const tagText = () => {
    if (!previous) return "";
    if (fromOtherBlock) return formatAge(previous.at, activeLocale());
    return t("exercise.weekTag", { n: previous.week });
  };

  const useKey = fromOtherBlock
    ? kind === "cardio"
      ? "exercise.useOlderCardio"
      : "exercise.useOlderStrength"
    : kind === "cardio"
      ? "exercise.useLastCardio"
      : "exercise.useLastStrength";
```

Replace the `"aria-label"` expression with:

```js
      "aria-label": previous
        ? t(useKey, {
            week: previous.week,
            set: setIndex + 1,
            ...Object.fromEntries(fields.map((field) => [field, spokenValue(previous, field)])),
          })
        : t("exercise.previousEmpty", { set: setIndex + 1 }),
```

(`week` stays in the params and is simply not referenced by the `useOlder*` templates.)

Replace the `.ghost-week` span at the end of the ghost button with:

```js
    el("span", { class: "ghost-week", text: tagText() }),
```

- [ ] **Step 4: Verify by hand in the browser**

`views/`, `dom.js` and `app.js` have no automated coverage and cannot get any without a DOM — this step is the test.

```bash
npm run serve
```

Open `http://localhost:8080` and, in device mode:

1. On the starter plan, log a bench-press set in week 1. Confirm week 2 shows it tagged `w1`.
2. Plans → duplicate the starter plan → use the copy. On week 1 of the copy, the bench row should now show the logged numbers tagged with an age (`now` / `5 min. ago`).
3. Tap that ghost row — it must fill the inputs, exactly as an in-block one does.
4. Type a higher weight — the gain badge must appear.
5. Switch the language to Português and confirm the tag reads in Portuguese.
6. **Check the tag does not overflow** in either language. It shares `--set-trail: 66px` with the input row below it. If it clips, widen `--set-trail` in `styles/app.css:61` by the smallest amount that fixes it and re-check that the input boxes are still comfortable to type in. Add no colour.

Run `npm test` once more to confirm the suite is still green.

- [ ] **Step 5: Commit**

```bash
git add src/views/day.js src/i18n/en.js src/i18n/pt-BR.js
git add styles/app.css   # only if step 4 needed a width change
git commit -m "Tag a ghost row from an older block with its age

A week number from a plan the user is not looking at means nothing, so
the tag shows how long ago instead, and the spoken label says the record
comes from an earlier block."
```

---

### Task 6: Ship it

Cache busting and the docs that are now wrong. Small, but skipping it means installed devices keep serving the old app forever.

**Files:**
- Modify: `sw.js:6`
- Modify: `tests/service-worker.test.js` (last assertion)
- Modify: `README.md`

**Interfaces:** none.

- [ ] **Step 1: Update the cache-version guard test**

In `tests/service-worker.test.js`, the last assertion — move the literal forward one version:

```js
    assert.notEqual(version[1], 'progression-v6', "bump the version when shipped files change");
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/service-worker.test.js`
Expected: FAIL — `sw.js` still declares `progression-v6`, which the guard now rejects.

- [ ] **Step 3: Bump the version**

In `sw.js:6` — **single quotes**, the test parses them with a single-quote regex:

```js
const CACHE_VERSION = 'progression-v7';
```

`SHELL` must **not** change: this feature added no files.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 0 failing.

- [ ] **Step 5: Correct the README**

In `README.md`, the opening section says:

> Keep several plans side by side; each carries its own history, so starting a new block starts a clean slate.

That is no longer true. Replace with:

> Keep several plans side by side. Each keeps its own history, but a lift you have logged
> before still shows its last numbers in a new block — so starting a fresh plan does not
> start from nothing.

- [ ] **Step 6: Commit**

```bash
git add sw.js tests/service-worker.test.js README.md
git commit -m "Bump the cache version and correct the clean-slate claim"
```

---

## Done when

- `npm test` passes with the new cases and no skips.
- Week 1 of a freshly duplicated plan shows the original block's numbers, tagged with an age.
- Week 1 of a plan containing a lift never logged anywhere still shows nothing.
- A plan that places one lift twice keeps the two placements independent.
- `sw.js` declares `progression-v7` and `SHELL` is unchanged.
