# Plans-first navigation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the plan library the app's permanent landing screen, and let a fresh install start with genuinely zero plans instead of a seeded example.

**Architecture:** Two coupled changes to an app that already has full multi-plan CRUD. (1) `src/app.js` always opens on `screen = "plans"` instead of resuming the Log screen. (2) `src/plan.js`/`src/state.js` drop the "at least one plan always exists" invariant — `DEFAULT_PLAN` is deleted, `emptyState()` starts with `plans: []`, and `deletePlan` no longer refuses to empty the library. The Log screen itself needs no new guard code: it is only ever entered through `usePlan(plan)`, called with a real plan card from a non-empty list, so "zero plans" only has to be handled in the screens that can be reached with nothing yet (Plans, Editor, and the shared `render()`/`currentView()` in `app.js`).

**Tech Stack:** Vanilla JS (ES modules), `node --test` for the pure-logic layer, no framework/build/bundler.

**Spec:** `docs/superpowers/specs/2026-07-29-plans-first-navigation-design.md`

## Global Constraints

- No dependencies, no build step, no framework — native ES modules loaded directly by the browser; never introduce a bundler, package, or transpile step.
- Mobile Safari is the target platform; prefer the conservative DOM APIs `src/dom.js` already routes through.
- Adding or renaming any file under `src/`, `styles/`, `icons/`, or `fonts/` requires updating `SHELL` in `sw.js`. Not triggered by this plan — no files are added, renamed, or removed.
- Changing any shipped file requires bumping `CACHE_VERSION` in `sw.js`, and the previous-version literal on the last line of `tests/service-worker.test.js` must move forward too (do this once, last, after all other shipped files have changed).
- No user-facing literal strings in view code, including `aria-label`s and `confirm()`/`alert()` text — everything goes through `t("dot.separated.key")` from `src/i18n/index.js`. `tests/i18n.test.js` enforces exact key parity between `en.js` and `pt-BR.js`.
- There are no DOM tests and there cannot be (`node --test` has no DOM, and jsdom would be a dependency). `views/*`, `dom.js`, `app.js`, and `main.js` changes are checked by hand in the browser via `npm run serve`, not by an automated test.
- Style: double quotes, semicolons, 2-space indent, ~100 column lines. Tests use `node:test`'s `describe`/`it` with `node:assert/strict`, and test names read as sentences.
- Commands: `npm test` (whole suite), `node --test tests/<file>.test.js` (one file), `node --test --test-name-pattern="<name>"` (one test/suite by name), `npm run serve` (`python3 -m http.server 8080`).

---

## Task 1: Remove the seeded default plan and the always-≥1-plan invariant

**Files:**
- Modify: `src/plan.js` (delete `DEFAULT_PLAN`, the local `slot()` helper, and `defaultPlan()`)
- Modify: `src/state.js` (`emptyState()`, `normalizePlans()`, the `deletePlan` store method, the import line)
- Modify: `src/i18n/en.js`, `src/i18n/pt-BR.js` (delete the now-unreferenced `plan.defaultName`/`plan.defaultDays.*` keys)
- Modify: `tests/state.test.js`, `tests/plan.test.js`, `tests/i18n.test.js`
- Test: the same three test files, run via `node --test`

**Interfaces:**
- Consumes: nothing from other tasks — this is the pure-logic foundation.
- Produces: `emptyState()` returns `{ ..., plans: [] }`. `createStore(storage)` on a fresh/corrupt/all-invalid backing store yields `store.plans` equal to `[]` (not one seeded plan). `store.deletePlan(planId)` always returns `true` and never refuses to empty the library. `src/plan.js` no longer exports `DEFAULT_PLAN` or `defaultPlan`. Task 2 depends on `store.deletePlan` having no length-guard left to mirror in `app.js`.

- [ ] **Step 1: Rewrite the "fresh install" test in `tests/state.test.js` to expect zero plans**

Find this block (around line 85):

```js
describe("a fresh install", () => {
  it("starts on the built-in plan, so there is something to log against", () => {
    const store = createStore(fakeStorage());

    assert.equal(store.plans.length, 1);
    assert.deepEqual(store.plans[0], defaultPlan());
    assert.deepEqual(store.state.entries, {});
  });

  it("is what a corrupt or unreadable state falls back to", () => {
    assert.deepEqual(createStore(fakeStorage({ [STATE_KEY]: "{not json" })).state, emptyState());
  });
});
```

Replace the first `it` (leave the second untouched):

```js
describe("a fresh install", () => {
  it("starts with no plans, so the user builds their own first one", () => {
    const store = createStore(fakeStorage());

    assert.deepEqual(store.plans, []);
    assert.deepEqual(store.state.entries, {});
  });

  it("is what a corrupt or unreadable state falls back to", () => {
    assert.deepEqual(createStore(fakeStorage({ [STATE_KEY]: "{not json" })).state, emptyState());
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test --test-name-pattern="starts with no plans" tests/state.test.js`
Expected: FAIL — `store.plans` still has length 1, because `src/state.js` hasn't changed yet.

- [ ] **Step 3: Rewrite the "refuses to delete the last plan" test to expect the opposite**

Find this block in `tests/state.test.js` (in the `deletePlan` describe, right after the "deletes a plan together with everything logged under it" test):

```js
it("refuses to delete the last plan, which would leave nothing to log against", () => {
  const store = storeWith(stateWith(testPlan()));

  assert.equal(store.deletePlan("p1"), false);
  assert.equal(store.plans.length, 1);
});
```

Replace with:

```js
it("deletes the last remaining plan, leaving the library empty", () => {
  const store = storeWith(stateWith(testPlan()));

  assert.equal(store.deletePlan("p1"), true);
  assert.deepEqual(store.plans, []);
});
```

- [ ] **Step 4: Run it and confirm it fails**

Run: `node --test --test-name-pattern="deletes the last remaining plan" tests/state.test.js`
Expected: FAIL — `store.deletePlan("p1")` still returns `false`.

- [ ] **Step 5: Implement the `src/state.js` changes**

In `src/state.js`, change the import (drop `defaultPlan`):

```js
import {
  MAX_SETS,
  clampSets,
  findPlan,
  findSlot,
  normalizePlan,
  weeksOf,
} from "./plan.js";
```

Change `emptyState()`:

```js
/** A fresh install starts with nothing — the user builds their first plan themselves. */
export function emptyState() {
  return {
    version: STATE_VERSION,
    lastExport: null,
    plans: [],
    entries: {},
    setCounts: {},
  };
}
```

Change `normalizePlans()`:

```js
function normalizePlans(raw) {
  const plans = (Array.isArray(raw) ? raw : []).map(normalizePlan);

  // Two plans sharing an id would share every record keyed under it.
  const seen = new Set();
  return plans.filter((plan) => (seen.has(plan.id) ? false : seen.add(plan.id)));
}
```

Change the `deletePlan` store method (inside the object returned by `createStore`):

```js
/** Deletes a plan and every record logged under it, including the last remaining one. */
deletePlan(planId) {
  state.plans = state.plans.filter((plan) => plan.id !== planId);
  for (const key of Object.keys(state.entries)) {
    if (key.startsWith(`${planId}|`)) delete state.entries[key];
  }
  for (const key of Object.keys(state.setCounts)) {
    if (key.startsWith(`${planId}|`)) delete state.setCounts[key];
  }
  saveState();
  return true;
},
```

- [ ] **Step 6: Run the two rewritten tests and confirm they pass**

Run: `node --test tests/state.test.js`
Expected: PASS, including the two tests from steps 1 and 3.

- [ ] **Step 7: Remove the now-unused `defaultPlan` import from `tests/state.test.js`**

Change:

```js
import { defaultPlan, newDay, newPlan, newSlot } from "../src/plan.js";
```

to:

```js
import { newDay, newPlan, newSlot } from "../src/plan.js";
```

- [ ] **Step 8: Delete `DEFAULT_PLAN`, its `slot()` helper, and `defaultPlan()` from `src/plan.js`**

In `src/plan.js`, everything from the local `slot` helper through `defaultPlan()` — that is, this whole span:

```js
const slot = (id, exerciseId, sets, reps) => ({
  id,
  exerciseId,
  name: null,
  nameKey: null,
  sets,
  reps,
});

/**
 * The plan a fresh install starts on: the block this app was originally written around.
 * Its ids are literals rather than generated so an empty state is deterministic, and its
 * names are i18n keys so it reads correctly in both locales.
 */
export const DEFAULT_PLAN = {
  id: "plan-default",
  // ... all five days ...
};

/** A deep, independent copy — plans are mutable user data, never shared by reference. */
export function clonePlan(plan) {
  return structuredClone(plan);
}

/** DEFAULT_PLAN as a fresh copy, safe to hand to a store that will mutate it. */
export function defaultPlan() {
  return clonePlan(DEFAULT_PLAN);
}
```

— becomes just:

```js
/** A deep, independent copy — plans are mutable user data, never shared by reference. */
export function clonePlan(plan) {
  return structuredClone(plan);
}
```

Delete the `slot()` helper, the `DEFAULT_PLAN` constant (including its doc comment), and the `defaultPlan()` function; keep `clonePlan()` (still used by `editPlan` in `src/app.js`) exactly where it was, between the two deleted pieces.

- [ ] **Step 9: Fix `tests/plan.test.js`**

Change the import block at the top from:

```js
import { CATALOG, isKnownExercise } from "../src/catalog.js";
import {
  DEFAULT_PLAN,
  MAX_DAYS,
  MAX_SETS,
  MAX_WEEKS,
  clampSets,
  clampWeeks,
  dayNumber,
  defaultPlan,
  displayName,
  findDay,
  findPlan,
  findSlot,
  moveItem,
  newDay,
  newPlan,
  newSlot,
  normalizePlan,
  planSlots,
  slotName,
} from "../src/plan.js";
```

to:

```js
import { CATALOG } from "../src/catalog.js";
import {
  MAX_DAYS,
  MAX_SETS,
  MAX_WEEKS,
  clampSets,
  clampWeeks,
  dayNumber,
  displayName,
  findDay,
  findPlan,
  findSlot,
  moveItem,
  newDay,
  newPlan,
  newSlot,
  normalizePlan,
  planSlots,
  slotName,
} from "../src/plan.js";
```

Delete the entire `describe("the built-in plan", () => { ... });` block (it directly follows the `idsOf` helper and comes right before `describe("factories", ...)`) — every assertion in it is about `DEFAULT_PLAN`, which no longer exists.

Replace the `describe("lookups", ...)` block:

```js
describe("lookups", () => {
  const plan = defaultPlan();

  it("finds a day and reports its position", () => {
    assert.equal(findDay(plan, "d2").id, "d2");
    assert.equal(findDay(plan, "nope"), null);
    assert.equal(dayNumber(plan, "d3"), 3);
  });

  it("finds a slot anywhere in the plan", () => {
    assert.equal(findSlot(plan, "d3-s2").exerciseId, "bent-over-row");
    assert.equal(findSlot(plan, "nope"), null);
  });

  it("finds a plan by id", () => {
    assert.equal(findPlan([plan], "plan-default"), plan);
    assert.equal(findPlan([plan], "other"), null);
  });
});
```

with a fixture built by hand instead of relying on the deleted default plan:

```js
describe("lookups", () => {
  const plan = normalizePlan({
    id: "p1",
    days: [
      { id: "d1", slots: [{ id: "d1-s1", exerciseId: "bench-press" }] },
      { id: "d2", slots: [{ id: "d2-s1", exerciseId: "back-squat" }] },
      {
        id: "d3",
        slots: [
          { id: "d3-s1", exerciseId: "bent-over-row" },
          { id: "d3-s2", exerciseId: "seated-row" },
        ],
      },
    ],
  });

  it("finds a day and reports its position", () => {
    assert.equal(findDay(plan, "d2").id, "d2");
    assert.equal(findDay(plan, "nope"), null);
    assert.equal(dayNumber(plan, "d3"), 3);
  });

  it("finds a slot anywhere in the plan", () => {
    assert.equal(findSlot(plan, "d3-s2").exerciseId, "seated-row");
    assert.equal(findSlot(plan, "nope"), null);
  });

  it("finds a plan by id", () => {
    assert.equal(findPlan([plan], "p1"), plan);
    assert.equal(findPlan([plan], "other"), null);
  });
});
```

In `describe("displayName", ...)`, the first two tests reference the now-deleted `plan.defaultDays.d1`/`plan.defaultName` i18n keys. Change:

```js
describe("displayName", () => {
  it("prefers what the user typed over any translation", () => {
    setLocale("en");
    assert.equal(displayName({ name: "Push day", nameKey: "plan.defaultDays.d1" }), "Push day");
  });

  it("translates a nameKey when the user has not named it", () => {
    setLocale("en");
    assert.equal(displayName({ name: null, nameKey: "plan.defaultName" }), "Starter block");

    setLocale("pt-BR");
    assert.equal(displayName({ name: null, nameKey: "plan.defaultName" }), "Bloco inicial");
  });
```

to:

```js
describe("displayName", () => {
  it("prefers what the user typed over any translation", () => {
    setLocale("en");
    assert.equal(displayName({ name: "Push day", nameKey: "plans.untitled" }), "Push day");
  });

  it("translates a nameKey when the user has not named it", () => {
    setLocale("en");
    assert.equal(displayName({ name: null, nameKey: "plans.untitled" }), "Untitled plan");

    setLocale("pt-BR");
    assert.equal(displayName({ name: null, nameKey: "plans.untitled" }), "Plano sem nome");
  });
```

Leave the rest of that `describe` block ("falls back to the catalog name for a slot..." and "is empty for an unnamed day...") unchanged.

- [ ] **Step 10: Fix `tests/i18n.test.js`**

Change the import line:

```js
import { DEFAULT_PLAN, planSlots } from "../src/plan.js";
```

Delete it entirely — nothing else in this file uses `planSlots` or `DEFAULT_PLAN`.

Inside `describe("locale key parity", ...)`, delete these two `it` blocks (keep the "names every catalog exercise and group..." test that precedes them):

```js
it("resolves every nameKey the built-in plan carries", () => {
  const keys = [DEFAULT_PLAN.nameKey, ...DEFAULT_PLAN.days.map((day) => day.nameKey)];

  for (const tag of Object.keys(LOCALES)) {
    setLocale(tag);
    for (const key of keys) {
      assert.notEqual(t(key), key, `${tag} has no string for ${key}`);
    }
  }
  setLocale(DEFAULT_LOCALE);
});

it("leaves the built-in plan's slots to the catalog rather than naming them twice", () => {
  for (const slot of planSlots(DEFAULT_PLAN)) {
    assert.equal(slot.name, null);
    assert.equal(slot.nameKey, null);
  }
});
```

- [ ] **Step 11: Delete the dead `plan.defaultName`/`plan.defaultDays.*` keys from both locales**

In `src/i18n/en.js`, delete this block (it sits right after `banner: { ... },`, just before the closing `},` of `strings` and the file's final `};`):

```js
    plan: {
      defaultName: "Starter block",
      defaultDays: {
        d1: "Day 1 — Chest + upper body",
        d2: "Day 2 — Legs (quads)",
        d3: "Day 3 — Back + upper body",
        d4: "Day 4 — Legs (hamstrings)",
        d5: "Day 5 — Walk-run",
      },
    },
```

Also fix the module doc comment at the top of `src/i18n/en.js`, which currently reads:

```js
/**
 * English strings.
 *
 * This is the reference locale: `t()` falls back here for any key a translation is
 * missing, and tests assert every other locale mirrors this key structure exactly.
 *
 * `catalog.exercises` is keyed by the exercise ids in src/catalog.js. `plan.default*`
 * names the plan a fresh install starts on — plans the user builds carry their own typed
 * names instead, which have no translation (see displayName in src/plan.js).
 */
```

to:

```js
/**
 * English strings.
 *
 * This is the reference locale: `t()` falls back here for any key a translation is
 * missing, and tests assert every other locale mirrors this key structure exactly.
 *
 * `catalog.exercises` is keyed by the exercise ids in src/catalog.js.
 */
```

In `src/i18n/pt-BR.js`, delete the matching block (same position, right after `banner: { ... },`):

```js
    plan: {
      defaultName: "Bloco inicial",
      defaultDays: {
        d1: "Dia 1 — Peito + superiores",
        d2: "Dia 2 — Pernas (quadríceps)",
        d3: "Dia 3 — Costas + superiores",
        d4: "Dia 4 — Pernas (posterior)",
        d5: "Dia 5 — Walk-run",
      },
    },
```

(`pt-BR.js`'s header comment doesn't mention `plan.default*`, so it needs no change.)

- [ ] **Step 12: Run the full suite and confirm everything passes**

Run: `npm test`
Expected: PASS, no failures, no reference to `DEFAULT_PLAN`/`defaultPlan` anywhere in `src/` or `tests/`. Sanity-check with:

```bash
grep -rn "DEFAULT_PLAN\|defaultPlan" src tests
```

Expected: no output.

- [ ] **Step 13: Commit**

```bash
git add src/plan.js src/state.js src/i18n/en.js src/i18n/pt-BR.js tests/state.test.js tests/plan.test.js tests/i18n.test.js
git commit -m "$(cat <<'EOF'
Remove the seeded default plan and the always-≥1-plan invariant

A fresh install now starts with zero plans instead of a built-in
example, and deleting a plan is allowed even when it's the last one.
Sets up plans-first navigation, where an empty library is a normal,
reachable state rather than one the data model forbids.
EOF
)"
```

---

## Task 2: Plans as the permanent landing screen, with an empty-state and null-safe rendering

**Files:**
- Modify: `src/app.js` (initial `screen`, `handleImportFile`, the `deletePlan` wrapper, `currentView`, `render`)
- Modify: `src/views/plans.js` (`renderPlansView`)
- Modify: `src/i18n/en.js`, `src/i18n/pt-BR.js` (remove `plans.removeLast`, add `plans.empty`)
- Test: none automated (DOM-touching); hand-checked in the browser via `npm run serve`

**Interfaces:**
- Consumes: `store.deletePlan(planId)` from Task 1, which now always succeeds and never needs to be guarded by `store.plans.length`.
- Produces: the app opens on the Plans screen on every load; `renderPlansView({ ..., activePlanId, onBack })` accepts `activePlanId: null` and `onBack: null` for the zero/no-active-plan case. Nothing here is consumed by a later task — this is the last behavioral task.

- [ ] **Step 1: Land on Plans by default**

In `src/app.js`, change the initial screen:

```js
let screen = "log";
```

to:

```js
let screen = "plans";
```

- [ ] **Step 2: Land on Plans after a backup import**

In `src/app.js`, inside `handleImportFile`'s `reader.onload`, change:

```js
store.replaceState(imported);
screen = "log";
render();
window.alert(t("tools.importDone"));
```

to:

```js
store.replaceState(imported);
screen = "plans";
render();
window.alert(t("tools.importDone"));
```

- [ ] **Step 3: Drop the "can't delete the last plan" guard from the `deletePlan` wrapper**

In `src/app.js`, change:

```js
function deletePlan(plan) {
  if (store.plans.length <= 1) {
    window.alert(t("plans.removeLast"));
    return;
  }

  const records = countPlanEntries(store.state, plan.id);
  const message =
    records > 0
      ? t("plans.removeConfirm", { plan: planLabel(plan), n: records })
      : t("plans.removeConfirmEmpty", { plan: planLabel(plan) });
  if (!window.confirm(message)) return;

  store.deletePlan(plan.id);
  render(); // a now-stale prefs.planId resolves to the first plan on the way through
}
```

to:

```js
function deletePlan(plan) {
  const records = countPlanEntries(store.state, plan.id);
  const message =
    records > 0
      ? t("plans.removeConfirm", { plan: planLabel(plan), n: records })
      : t("plans.removeConfirmEmpty", { plan: planLabel(plan) });
  if (!window.confirm(message)) return;

  store.deletePlan(plan.id);
  render(); // a now-stale prefs.planId resolves to the first plan on the way through
}
```

- [ ] **Step 4: Make `currentView`'s Plans branch tolerate no active plan**

In `src/app.js`, change:

```js
  if (screen === "plans") {
    return renderPlansView({
      store,
      activePlanId: plan.id,
      onUse: usePlan,
      onEdit: editPlan,
      onDuplicate: duplicatePlan,
      onDelete: deletePlan,
      onCreate: createPlan,
      onBack: () => goTo("log"),
    });
  }
```

to:

```js
  if (screen === "plans") {
    return renderPlansView({
      store,
      activePlanId: plan?.id ?? null,
      onUse: usePlan,
      onEdit: editPlan,
      onDuplicate: duplicatePlan,
      onDelete: deletePlan,
      onCreate: createPlan,
      onBack: plan ? () => goTo("log") : null,
    });
  }
```

Leave the `"editor"` branch and the default (Log) branch below it untouched — the Log branch may keep assuming `plan`/`week`/`day` are non-null, because `"log"` is only ever entered via `usePlan(plan)` with a real plan.

- [ ] **Step 5: Make `render()` tolerate `activePlan()` returning nothing**

In `src/app.js`, change the top of `render()`:

```js
function render() {
  const plan = activePlan();
  const week = activeWeek(plan);
  const day = activeDay(plan);
```

to:

```js
function render() {
  const plan = activePlan();
  const week = plan ? activeWeek(plan) : null;
  const day = plan ? activeDay(plan) : null;
```

Further down in the same function, change the scroll-anchor line:

```js
  const anchor = `${screen}|${plan.id}|${week}|${day.id}`;
```

to:

```js
  const anchor = `${screen}|${plan?.id ?? "none"}|${week ?? ""}|${day?.id ?? ""}`;
```

Everything else in `render()` (the `isLog`/`renderSelectors` block, `updateBanners`, the focus-on-screen-change block) is already only reached when `isLog` is true, which — per the invariant above — implies `plan`/`day` are non-null; no further change needed there.

- [ ] **Step 6: Add the Plans-screen empty state and a conditional Back button**

In `src/views/plans.js`, change `renderPlansView`:

```js
export function renderPlansView({
  store,
  activePlanId,
  onUse,
  onEdit,
  onDuplicate,
  onDelete,
  onCreate,
  onBack,
}) {
  return fragment(
    el("h2", { class: "screen-title", tabIndex: -1, text: t("plans.title") }),
    store.plans.map((plan) =>
      planCard({
        store,
        plan,
        isActive: plan.id === activePlanId,
        onUse,
        onEdit,
        onDuplicate,
        onDelete,
      }),
    ),
    el(
      "div",
      { class: "actions clear-wrap" },
      el("button", {
        type: "button",
        class: "btn btn--primary",
        text: t("plans.create"),
        on: { click: onCreate },
      }),
      el("button", {
        type: "button",
        class: "btn",
        text: t("plans.back"),
        on: { click: onBack },
      }),
    ),
  );
}
```

to:

```js
export function renderPlansView({
  store,
  activePlanId,
  onUse,
  onEdit,
  onDuplicate,
  onDelete,
  onCreate,
  onBack,
}) {
  return fragment(
    el("h2", { class: "screen-title", tabIndex: -1, text: t("plans.title") }),
    store.plans.length === 0 ? el("p", { class: "note", text: t("plans.empty") }) : null,
    store.plans.map((plan) =>
      planCard({
        store,
        plan,
        isActive: plan.id === activePlanId,
        onUse,
        onEdit,
        onDuplicate,
        onDelete,
      }),
    ),
    el(
      "div",
      { class: "actions clear-wrap" },
      el("button", {
        type: "button",
        class: "btn btn--primary",
        text: t("plans.create"),
        on: { click: onCreate },
      }),
      onBack
        ? el("button", {
            type: "button",
            class: "btn",
            text: t("plans.back"),
            on: { click: onBack },
          })
        : null,
    ),
  );
}
```

- [ ] **Step 7: Update the `plans` i18n keys in both locales**

In `src/i18n/en.js`, inside the `plans` block, add `empty` and remove `removeLast`. Change:

```js
    plans: {
      title: "Plans",
      manage: "Manage plans",
```

to:

```js
    plans: {
      title: "Plans",
      empty: "No plans yet — create one to start logging.",
      manage: "Manage plans",
```

and delete this line further down in the same block:

```js
      removeLast: "This is your only plan. Create another one before deleting it.",
```

In `src/i18n/pt-BR.js`, make the matching change. Change:

```js
    plans: {
      title: "Planos",
      manage: "Gerenciar planos",
```

to:

```js
    plans: {
      title: "Planos",
      empty: "Nenhum plano ainda — crie um para começar a registrar.",
      manage: "Gerenciar planos",
```

and delete:

```js
      removeLast: "Este é seu único plano. Crie outro antes de excluí-lo.",
```

- [ ] **Step 8: Run the automated suite (sanity check — this task has no new automated coverage)**

Run: `npm test`
Expected: PASS. `tests/i18n.test.js`'s key-parity check confirms `plans.empty` was added and `plans.removeLast` was removed in both locales identically.

- [ ] **Step 9: Hand-check in the browser**

Run: `npm run serve`, open `http://localhost:8080` in a browser, and clear the site's storage (DevTools → Application → Clear storage, or a private window) to simulate a fresh install. Walk through, in both English and Portuguese (use the locale picker in Tools):

1. Fresh load lands on the Plans screen, showing the new empty-state message and a **Create plan** button, with no **Back** button.
2. Tap **Create plan**, name it, add a day, add an exercise, tap **Done** — you return to Plans, the new plan is listed, no console errors.
3. Tap **Use** on that plan — you land on the Log screen and can fill in a set normally.
4. Reload the page (simulating relaunch) — you land back on Plans, not the Log screen you were just on.
5. From Plans, tap **Delete** on your only plan and confirm — you're left on an empty Plans screen, empty-state message back, no **Back** button.
6. Create a second plan, tap **Use** on it, then use the "Manage plans" link/button from the Log screen's Tools section to return to Plans — the **Back** button is present this time (there's an active plan) and returns you to the Log screen for that plan.
7. Export a backup, then import it back in (Tools → Export/Import) — you land on Plans afterward, not Log.

Confirm no `screen-title` focus/scroll regressions (tapping between screens still scrolls to top and moves focus, per the existing behavior in `render()`).

- [ ] **Step 10: Commit**

```bash
git add src/app.js src/views/plans.js src/i18n/en.js src/i18n/pt-BR.js
git commit -m "$(cat <<'EOF'
Make Plans the permanent landing screen

Every app open now starts on the plan library instead of resuming the
Log screen, and the library handles being empty: a first-run message,
a conditional Back button, and null-safe rendering when no plan is
active yet.
EOF
)"
```

---

## Task 3: Bump the service worker cache version

**Files:**
- Modify: `sw.js`
- Modify: `tests/service-worker.test.js`
- Test: `tests/service-worker.test.js`, run via `node --test`

**Interfaces:**
- Consumes: nothing — this is pure bookkeeping, done last because it certifies that every shipped file changed in Tasks 1 and 2 (`src/plan.js`, `src/state.js`, `src/app.js`, `src/views/plans.js`, `src/i18n/en.js`, `src/i18n/pt-BR.js`) will be re-fetched by installed devices.
- Produces: nothing consumed elsewhere — this is the final task.

- [ ] **Step 1: Bump `CACHE_VERSION` in `sw.js`**

Change:

```js
const CACHE_VERSION = 'progression-v7';
```

to:

```js
const CACHE_VERSION = 'progression-v8';
```

- [ ] **Step 2: Move the guard literal forward in `tests/service-worker.test.js`**

Change:

```js
    assert.notEqual(version[1], 'progression-v6', "bump the version when shipped files change");
```

to:

```js
    assert.notEqual(version[1], 'progression-v7', "bump the version when shipped files change");
```

- [ ] **Step 3: Run the service worker test and confirm it passes**

Run: `node --test tests/service-worker.test.js`
Expected: PASS.

- [ ] **Step 4: Run the full suite one last time**

Run: `npm test`
Expected: PASS, zero failures.

- [ ] **Step 5: Commit**

```bash
git add sw.js tests/service-worker.test.js
git commit -m "$(cat <<'EOF'
Bump CACHE_VERSION for the plans-first navigation change

plan.js, state.js, app.js, views/plans.js, and both locale files
changed; installed devices need the new shell.
EOF
)"
```
