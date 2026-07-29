import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { entryFields, exerciseLabel } from "../src/catalog.js";
import { newDay, newPlan, newSlot } from "../src/plan.js";
import {
  PREFS_KEY,
  STATE_KEY,
  STATE_VERSION,
  countDayEntries,
  countExerciseUse,
  countOrphans,
  countPlanEntries,
  countSlotEntries,
  createStore,
  emptyState,
  entryKey,
  findPrevious,
  getSetCount,
  hasCustomSetCounts,
  lastLoggedAt,
  loggedDays,
  loggedWeeks,
  newestByExercise,
  normalizePrefs,
  normalizeState,
  parseBackup,
  setCountKey,
} from "../src/state.js";

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    read: (key) => (map.has(key) ? JSON.parse(map.get(key)) : null),
  };
}

const storeWith = (state) => createStore(fakeStorage({ [STATE_KEY]: JSON.stringify(state) }));

/** A two-day plan with predictable ids, so key assertions read plainly. */
function testPlan(weeks = 4) {
  return {
    id: "p1",
    name: "Test block",
    nameKey: null,
    weeks,
    days: [
      {
        id: "day-a",
        name: "Push",
        nameKey: null,
        slots: [
          { id: "s-bench", exerciseId: "bench-press", name: null, nameKey: null, sets: 3, reps: [6, 8] },
          { id: "s-abs", exerciseId: "abs", name: null, nameKey: null, sets: 3, reps: null },
        ],
      },
      {
        id: "day-b",
        name: "Cardio",
        nameKey: null,
        slots: [
          { id: "s-run", exerciseId: "walk-run", name: null, nameKey: null, sets: 1, reps: null },
        ],
      },
    ],
  };
}

const stateWith = (plan, extra = {}) => ({
  version: STATE_VERSION,
  lastExport: null,
  exercises: [],
  plans: [plan],
  entries: {},
  setCounts: {},
  ...extra,
});

/** One of the user's own exercises, normalized — the shape the log persists. */
const userExercise = (overrides = {}) => ({
  id: "u-sled",
  name: "Sled push",
  group: "legs",
  kind: "strength",
  sets: 3,
  reps: null,
  ...overrides,
});

/** A plan that places a user exercise, which is what makes the ordering hazard reachable. */
const planUsing = (exerciseId, slotId = "s-mine") => ({
  id: "p1",
  name: "Test block",
  nameKey: null,
  weeks: 4,
  days: [
    {
      id: "day-a",
      name: "Push",
      nameKey: null,
      slots: [{ id: slotId, exerciseId, name: null, nameKey: null, sets: 3, reps: null }],
    },
  ],
});

describe("storage keys", () => {
  it("scopes every record to a plan", () => {
    assert.equal(STATE_KEY, "progression:v2");
    assert.equal(PREFS_KEY, "progression:ui");
    assert.equal(entryKey("p1", 2, "s-bench", 0), "p1|2|s-bench|0");
    assert.equal(setCountKey("p1", 2, "s-bench"), "p1|2|s-bench");
  });
});

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

describe("normalizeState", () => {
  const plan = testPlan();

  it("accepts a well-formed state unchanged", () => {
    const raw = stateWith(plan, {
      lastExport: 123,
      entries: { "p1|1|s-bench|0": { kg: 60, reps: 8 } },
      setCounts: { "p1|1|s-bench": 4 },
    });
    assert.deepEqual(normalizeState(raw), raw);
  });

  it("keeps only the fields the exercise actually logs", () => {
    const normalized = normalizeState(
      stateWith(plan, {
        entries: {
          "p1|1|s-bench|0": { kg: 60, reps: 8, dist: 5 },
          "p1|1|s-run|0": { dist: 3.2, time: 22, kg: 80 },
        },
      }),
    );

    assert.deepEqual(normalized.entries["p1|1|s-bench|0"], { kg: 60, reps: 8 });
    assert.deepEqual(normalized.entries["p1|1|s-run|0"], { dist: 3.2, time: 22 });
  });

  it("drops records that belong to no plan, slot, or week", () => {
    const normalized = normalizeState(
      stateWith(testPlan(2), {
        entries: {
          "p1|1|s-bench|0": { kg: 60, reps: 8 },
          "p2|1|s-bench|0": { kg: 60, reps: 8 },
          "p1|9|s-bench|0": { kg: 60, reps: 8 },
          "p1|1|s-gone|0": { kg: 60, reps: 8 },
          "p1|1|s-bench|99": { kg: 60, reps: 8 },
          nonsense: { kg: 60 },
        },
      }),
    );

    assert.deepEqual(Object.keys(normalized.entries), ["p1|1|s-bench|0"]);
  });

  it("keeps records behind a reduced set count — they are hidden, not gone", () => {
    const normalized = normalizeState(
      stateWith(plan, {
        entries: { "p1|1|s-bench|5": { kg: 60, reps: 8 } },
        setCounts: { "p1|1|s-bench": 2 },
      }),
    );

    assert.ok(normalized.entries["p1|1|s-bench|5"]);
  });

  it("drops an entry with nothing filled in", () => {
    const normalized = normalizeState(
      stateWith(plan, { entries: { "p1|1|s-bench|0": { kg: null, reps: null } } }),
    );
    assert.deepEqual(normalized.entries, {});
  });

  it("drops a set-count override that matches the plan anyway", () => {
    const normalized = normalizeState(
      stateWith(plan, { setCounts: { "p1|1|s-bench": 3, "p1|1|s-abs": 5 } }),
    );
    assert.deepEqual(normalized.setCounts, { "p1|1|s-abs": 5 });
  });

  it("repairs a malformed plan rather than dropping the whole state", () => {
    const normalized = normalizeState({
      entries: {},
      plans: [{ id: "p1", weeks: 999, days: [{ id: "d", slots: [{ exerciseId: "nope" }] }] }],
    });

    assert.equal(normalized.plans[0].weeks, 24);
    assert.deepEqual(normalized.plans[0].days[0].slots, []);
  });

  it("replaces two plans sharing an id, which would share one history", () => {
    const normalized = normalizeState({ entries: {}, plans: [testPlan(), testPlan()] });
    assert.equal(normalized.plans.length, 1);
  });

  it("degrades to an empty state instead of throwing", () => {
    for (const junk of [null, undefined, 42, "nope", [], {}, { entries: null }, { entries: [] }]) {
      assert.deepEqual(normalizeState(junk), emptyState(), `input: ${JSON.stringify(junk)}`);
    }
  });

  it("drops a non-numeric lastExport", () => {
    assert.equal(normalizeState({ entries: {}, lastExport: "yesterday" }).lastExport, null);
  });

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

  it("drops a timestamp that cannot be real, keeping the record it was on", () => {
    const now = 1_753_660_800_000;
    const normalized = normalizeState(
      stateWith(plan, {
        entries: {
          "p1|1|s-bench|0": { kg: 60, reps: 8, at: now + 365 * 24 * 60 * 60_000 },
          "p1|1|s-bench|1": { kg: 60, reps: 7, at: -5 },
          "p1|1|s-bench|2": { kg: 60, reps: 6, at: now - 60_000 },
        },
      }),
      now,
    );

    assert.deepEqual(
      normalized.entries["p1|1|s-bench|0"],
      { kg: 60, reps: 8 },
      "a year in the future is not a date this app wrote",
    );
    assert.deepEqual(normalized.entries["p1|1|s-bench|1"], { kg: 60, reps: 7 }, "nor is 1969");
    assert.deepEqual(normalized.entries["p1|1|s-bench|2"], { kg: 60, reps: 6, at: now - 60_000 });
  });

  it("tolerates the clock being a little ahead, which is a device and not a bad file", () => {
    const now = 1_753_660_800_000;
    const normalized = normalizeState(
      stateWith(plan, { entries: { "p1|1|s-bench|0": { kg: 60, reps: 8, at: now + 60_000 } } }),
      now,
    );

    assert.equal(normalized.entries["p1|1|s-bench|0"].at, now + 60_000);
  });
});

describe("parseBackup", () => {
  it("round-trips a backup carrying a custom plan and its records", () => {
    const original = stateWith(testPlan(), {
      lastExport: 999,
      entries: { "p1|2|s-run|0": { dist: 3.2, time: 22 } },
    });

    const restored = parseBackup(JSON.stringify(original));

    assert.deepEqual(restored.plans, original.plans);
    assert.deepEqual(restored.entries, original.entries);
    assert.equal(restored.lastExport, 999);
  });

  it("rejects anything that is not a backup", () => {
    for (const junk of [
      "null",
      "[]",
      "42",
      '{"entries":null}',
      '{"foo":1}',
      '{"entries":{}}', // no plans: pre-v2 exports carry no plan to log against
      "not json",
    ]) {
      assert.throws(() => parseBackup(junk), `input: ${junk}`);
    }
  });
});

describe("normalizePrefs", () => {
  it("keeps ids as written — a stale one is resolved at render time, not here", () => {
    assert.equal(normalizePrefs({ planId: "gone" }).planId, "gone");
    assert.equal(normalizePrefs({ day: "gone" }).day, "gone");
  });

  it("has no locale until the user picks one, so it follows the device", () => {
    assert.equal(normalizePrefs({}).locale, null);
    assert.equal(normalizePrefs({ locale: "pt-BR" }).locale, "pt-BR");
  });

  it("survives missing or corrupt prefs", () => {
    assert.deepEqual(normalizePrefs(null), {
      planId: null,
      week: 1,
      day: null,
      locale: null,
      backupDismissedAt: 0,
      installDismissed: false,
    });
    assert.equal(normalizePrefs({ week: "2" }).week, 1);
    assert.equal(normalizePrefs({ week: 0 }).week, 1);
    assert.equal(normalizePrefs({ week: 6 }).week, 6);
  });
});

describe("getSetCount", () => {
  const plan = testPlan();
  const bench = plan.days[0].slots[0];

  it("uses the plan's prescription when there is no override", () => {
    assert.equal(getSetCount(stateWith(plan), "p1", 1, bench), 3);
  });

  it("prefers a stored override, per week", () => {
    const state = stateWith(plan, { setCounts: { "p1|2|s-bench": 5 } });
    assert.equal(getSetCount(state, "p1", 2, bench), 5);
    assert.equal(getSetCount(state, "p1", 1, bench), 3);
  });

  it("clamps a corrupt override", () => {
    const state = stateWith(plan, { setCounts: { "p1|1|s-bench": 99 } });
    assert.equal(getSetCount(state, "p1", 1, bench), 8);
  });
});

describe("findPrevious", () => {
  const state = normalizeState(
    stateWith(testPlan(), {
      entries: {
        "p1|1|s-bench|0": { kg: 60, reps: 8 },
        "p1|3|s-bench|0": { kg: 65, reps: 8 },
      },
    }),
  );

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
});

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

describe("counting records", () => {
  const plan = testPlan();
  const state = normalizeState(
    stateWith(plan, {
      entries: {
        "p1|1|s-bench|0": { kg: 60, reps: 8 },
        "p1|1|s-bench|1": { kg: 60, reps: 7 },
        "p1|1|s-abs|0": { reps: 20 },
        "p1|2|s-bench|0": { kg: 62, reps: 8 },
      },
    }),
  );

  it("counts a day in one week", () => {
    assert.equal(countDayEntries(state, "p1", 1, plan.days[0]), 3);
    assert.equal(countDayEntries(state, "p1", 2, plan.days[0]), 1);
    assert.equal(countDayEntries(state, "p1", 1, plan.days[1]), 0);
  });

  it("counts one slot, in a week or across all of them", () => {
    assert.equal(countSlotEntries(state, "p1", 1, "s-bench"), 2);
    assert.equal(countSlotEntries(state, "p1", null, "s-bench"), 3);
  });

  it("counts everything a plan holds", () => {
    assert.equal(countPlanEntries(state, "p1"), 4);
    assert.equal(countPlanEntries(state, "p2"), 0);
  });

  it("reports what a revised plan would discard, before it is saved", () => {
    assert.equal(countOrphans(state, plan), 0, "an unchanged plan discards nothing");

    const shorter = { ...plan, weeks: 1 };
    assert.equal(countOrphans(state, shorter), 1);

    const withoutBench = {
      ...plan,
      days: [{ ...plan.days[0], slots: [plan.days[0].slots[1]] }, plan.days[1]],
    };
    assert.equal(countOrphans(state, withoutBench), 3);
  });

  it("spots a set count differing from the plan", () => {
    assert.equal(hasCustomSetCounts(state, "p1", 1, plan.days[0]), false);

    const custom = normalizeState(stateWith(plan, { setCounts: { "p1|1|s-bench": 5 } }));
    assert.equal(hasCustomSetCounts(custom, "p1", 1, plan.days[0]), true);
    assert.equal(hasCustomSetCounts(custom, "p1", 2, plan.days[0]), false);
  });
});

describe("what has been logged", () => {
  const plan = testPlan();
  const state = normalizeState(
    stateWith(plan, {
      entries: {
        "p1|1|s-bench|0": { kg: 60, reps: 8 },
        "p1|1|s-abs|0": { reps: 20 },
        "p1|3|s-run|0": { dist: 3, time: 20 },
      },
    }),
  );

  it("reports the weeks that hold something", () => {
    assert.deepEqual(loggedWeeks(state, plan), new Set([1, 3]));
  });

  it("reports the days of one week that hold something", () => {
    assert.deepEqual(loggedDays(state, plan, 1), new Set(["day-a"]));
    assert.deepEqual(loggedDays(state, plan, 3), new Set(["day-b"]));
    assert.deepEqual(loggedDays(state, plan, 2), new Set());
  });

  it("is empty for a plan nothing has been logged against", () => {
    const other = { ...testPlan(), id: "p2" };
    assert.deepEqual(loggedWeeks(state, other), new Set());
    assert.deepEqual(loggedDays(state, other, 1), new Set());
  });

  it("ignores a record whose slot the plan no longer has", () => {
    // Not reachable through normalizeState, which prunes these — but the helpers run on
    // whatever the store holds, and a mark you cannot open anything behind would be a lie.
    const stale = stateWith(plan, { entries: { "p1|1|s-gone|0": { kg: 40, reps: 5 } } });

    assert.deepEqual(loggedDays(stale, plan, 1), new Set());
    assert.deepEqual(loggedWeeks(stale, plan), new Set());
  });

  it("reports when a day was last trained", () => {
    const timed = stateWith(plan, {
      entries: {
        "p1|1|s-bench|0": { kg: 60, reps: 8, at: 3000 },
        "p1|1|s-bench|1": { kg: 60, reps: 7, at: 5000 },
        "p1|1|s-abs|0": { reps: 20, at: 4000 },
        "p1|2|s-bench|0": { kg: 62, reps: 8, at: 9000 },
      },
    });

    assert.equal(lastLoggedAt(timed, plan, 1, plan.days[0]), 5000, "the newest of the day");
    assert.equal(lastLoggedAt(timed, plan, 2, plan.days[0]), 9000, "scoped to the week");
    assert.equal(lastLoggedAt(timed, plan, 1, plan.days[1]), null, "a day with nothing on it");
  });

  it("reports no time for records written before timestamps existed", () => {
    // Schema 2 records carry no `at`. Better nothing than a date we would have to invent.
    const untimed = stateWith(plan, { entries: { "p1|1|s-bench|0": { kg: 60, reps: 8 } } });

    assert.equal(lastLoggedAt(untimed, plan, 1, plan.days[0]), null);
  });

  it("looks past a timestamp in the future, which is a day that cannot have been trained", () => {
    // A clock that moved backwards after a write leaves `at` ahead of now, and formatAge
    // has nothing to say about a negative age — so a note built on one renders its label
    // and a blank. Withhold the timestamp instead, and fall back to the newest real one.
    const skewed = stateWith(plan, {
      entries: {
        "p1|1|s-bench|0": { kg: 60, reps: 8, at: 5000 },
        "p1|1|s-bench|1": { kg: 60, reps: 7, at: 9000 },
      },
    });

    assert.equal(lastLoggedAt(skewed, plan, 1, plan.days[0], 7000), 5000, "the newest real one");
    assert.equal(lastLoggedAt(skewed, plan, 1, plan.days[0], 4000), null, "all of them ahead");
  });

  it("counts a record hidden behind a reduced set count", () => {
    // The stepper hides sets rather than deleting them, and the day has still been trained.
    const hidden = stateWith(plan, { entries: { "p1|1|s-bench|7": { kg: 60, reps: 8 } } });

    assert.deepEqual(loggedDays(hidden, plan, 1), new Set(["day-a"]));
  });
});

describe("logging", () => {
  it("writes a field through immediately and drops a row left empty", () => {
    const storage = fakeStorage({ [STATE_KEY]: JSON.stringify(stateWith(testPlan())) });
    const store = createStore(storage, { now: () => 1000 });

    store.setEntryField("p1", 1, "s-bench", 0, "kg", 60);
    assert.deepEqual(storage.read(STATE_KEY).entries["p1|1|s-bench|0"], { kg: 60, at: 1000 });

    store.setEntryField("p1", 1, "s-bench", 0, "reps", 8);
    assert.deepEqual(store.getEntry("p1", 1, "s-bench", 0), { kg: 60, reps: 8, at: 1000 });

    store.setEntryField("p1", 1, "s-bench", 0, "kg", null);
    store.setEntryField("p1", 1, "s-bench", 0, "reps", null);
    assert.equal(store.getEntry("p1", 1, "s-bench", 0), null, "an empty row is not stored");
  });

  it("stores a set-count override only while it differs from the plan", () => {
    const store = storeWith(stateWith(testPlan()));
    const bench = store.plans[0].days[0].slots[0];

    store.setSetCount("p1", 1, bench, 5);
    assert.equal(store.state.setCounts["p1|1|s-bench"], 5);

    store.setSetCount("p1", 1, bench, 3);
    assert.equal(store.state.setCounts["p1|1|s-bench"], undefined);
  });

  it("clears one day of one week and nothing else", () => {
    const plan = testPlan();
    const store = storeWith(
      stateWith(plan, {
        entries: {
          "p1|1|s-bench|0": { kg: 60, reps: 8 },
          "p1|1|s-abs|0": { reps: 20 },
          "p1|2|s-bench|0": { kg: 62, reps: 8 },
          "p1|1|s-run|0": { dist: 3, time: 20 },
        },
        setCounts: { "p1|1|s-bench": 5 },
      }),
    );

    store.clearDay("p1", 1, store.plans[0].days[0]);

    assert.deepEqual(Object.keys(store.state.entries).sort(), ["p1|1|s-run|0", "p1|2|s-bench|0"]);
    assert.deepEqual(store.state.setCounts, {});
  });
});

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

describe("plan management", () => {
  it("adds a plan and repairs it on the way in", () => {
    const store = createStore(fakeStorage());
    const added = store.addPlan({ name: "Block B", weeks: 99, days: [] });

    assert.equal(store.plans.length, 1);
    assert.equal(added.weeks, 24);
    assert.equal(added.days.length, 1, "a plan always has at least one day");
  });

  it("copies a plan's structure but not its records", () => {
    const plan = testPlan();
    const store = storeWith(
      stateWith(plan, { entries: { "p1|1|s-bench|0": { kg: 60, reps: 8 } } }),
    );

    const copy = store.duplicatePlan("p1", "Test block (copy)");

    assert.notEqual(copy.id, "p1");
    assert.equal(copy.name, "Test block (copy)");
    assert.deepEqual(
      copy.days.flatMap((day) => day.slots.map((slot) => slot.exerciseId)),
      ["bench-press", "abs", "walk-run"],
    );
    assert.equal(countPlanEntries(store.state, copy.id), 0, "the copy starts clean");
    assert.equal(countPlanEntries(store.state, "p1"), 1, "the original keeps its history");
  });

  it("deletes a plan together with everything logged under it", () => {
    const store = storeWith(
      stateWith(testPlan(), {
        entries: { "p1|1|s-bench|0": { kg: 60, reps: 8 } },
        setCounts: { "p1|1|s-bench": 5 },
      }),
    );
    const other = store.addPlan(newPlan("Block B"));

    assert.equal(store.deletePlan("p1"), true);
    assert.deepEqual(store.plans, [other]);
    assert.deepEqual(store.state.entries, {});
    assert.deepEqual(store.state.setCounts, {});
  });

  it("deletes the last remaining plan, leaving the library empty", () => {
    const store = storeWith(stateWith(testPlan()));

    assert.equal(store.deletePlan("p1"), true);
    assert.deepEqual(store.plans, []);
  });

  it("adds an unknown plan rather than silently doing nothing", () => {
    const store = createStore(fakeStorage());
    store.updatePlan(newPlan("Block B"));

    assert.equal(store.plans.length, 1);
  });
});

describe("editing a plan", () => {
  const withRecords = () =>
    storeWith(
      stateWith(testPlan(), {
        entries: {
          "p1|1|s-bench|0": { kg: 60, reps: 8 },
          "p1|4|s-bench|0": { kg: 70, reps: 8 },
          "p1|1|s-abs|0": { reps: 20 },
        },
        setCounts: { "p1|4|s-bench": 5 },
      }),
    );

  it("keeps every record when only names and order change", () => {
    const store = withRecords();
    const revised = structuredClone(store.plans[0]);
    revised.name = "Renamed";
    revised.days[0].slots.reverse();

    store.updatePlan(revised);

    assert.equal(countPlanEntries(store.state, "p1"), 3);
    assert.equal(store.plans[0].name, "Renamed");
  });

  it("discards the records a removed slot leaves behind", () => {
    const store = withRecords();
    const revised = structuredClone(store.plans[0]);
    revised.days[0].slots = revised.days[0].slots.filter((slot) => slot.id !== "s-bench");

    store.updatePlan(revised);

    assert.deepEqual(Object.keys(store.state.entries), ["p1|1|s-abs|0"]);
    assert.deepEqual(store.state.setCounts, {});
  });

  it("discards the records a removed day leaves behind", () => {
    const store = withRecords();
    const revised = structuredClone(store.plans[0]);
    revised.days = revised.days.slice(1);

    store.updatePlan(revised);

    assert.deepEqual(store.state.entries, {});
  });

  it("discards the weeks a shortened block no longer has", () => {
    const store = withRecords();
    const revised = { ...structuredClone(store.plans[0]), weeks: 2 };

    store.updatePlan(revised);

    assert.deepEqual(Object.keys(store.state.entries).sort(), ["p1|1|s-abs|0", "p1|1|s-bench|0"]);
    assert.deepEqual(store.state.setCounts, {}, "the week-4 override goes with the week");
  });

  it("leaves other plans' records alone", () => {
    const store = withRecords();
    const other = store.addPlan({ ...testPlan(), id: "p2" });
    store.setEntryField("p2", 1, other.days[0].slots[0].id, 0, "kg", 40);

    store.updatePlan({ ...structuredClone(store.plans[0]), weeks: 1 });

    assert.equal(countPlanEntries(store.state, "p2"), 1);
  });

  it("makes room for a new slot without disturbing the old ones", () => {
    const store = withRecords();
    const revised = structuredClone(store.plans[0]);
    revised.days[1].slots = [...revised.days[1].slots, newSlot("leg-press")];
    revised.days = [...revised.days, newDay("Extra")];

    store.updatePlan(revised);

    assert.equal(countPlanEntries(store.state, "p1"), 3);
    assert.equal(store.plans[0].days.length, 3);
  });
});

describe("preferences", () => {
  it("are written through separately from the log", () => {
    const storage = fakeStorage();
    const store = createStore(storage);

    store.setPref("week", 3);
    assert.equal(storage.read(PREFS_KEY).week, 3);
    assert.equal(store.prefs.week, 3);
  });
});

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

describe("a failing storage", () => {
  it("keeps the session usable instead of throwing", () => {
    const storage = fakeStorage();
    const store = createStore(storage, { now: () => 1000 });
    storage.setItem = () => {
      throw new Error("quota exceeded");
    };

    store.setEntryField("plan-default", 1, "d1-s1", 0, "kg", 60);
    assert.deepEqual(store.getEntry("plan-default", 1, "d1-s1", 0), { kg: 60, at: 1000 });
  });
});

describe("the user's own exercises", () => {
  const sled = userExercise();
  const rower = userExercise({ id: "u-row", name: "Rower", group: "cardio", kind: "cardio" });

  const withSled = (extra = {}) => ({
    ...stateWith(planUsing("u-sled"), extra),
    exercises: [sled],
  });

  it("keeps a slot placing one, and the records logged on it", () => {
    // The headline hazard: normalizeSlot drops any slot whose exercise it cannot resolve, and
    // the records go with it. The list has to be repaired before the plans are, or a custom
    // slot and its history vanish on the first load after it was created.
    const logged = { entries: { "p1|1|s-mine|0": { kg: 80, reps: 5 } } };
    const normalized = normalizeState(withSled(logged));

    assert.deepEqual(normalized.exercises, [sled]);
    assert.equal(normalized.plans[0].days[0].slots.length, 1, "the slot survives");
    assert.deepEqual(normalized.entries["p1|1|s-mine|0"], { kg: 80, reps: 5 }, "and its record");
  });

  it("drops the slot when the state holds no such exercise, which is the honest outcome", () => {
    const normalized = normalizeState({
      ...withSled({ entries: { "p1|1|s-mine|0": { kg: 80, reps: 5 } } }),
      exercises: [],
    });

    assert.deepEqual(normalized.plans[0].days[0].slots, []);
    assert.deepEqual(normalized.entries, {}, "the record has nowhere to live either");
  });

  it("keeps the fields a custom cardio exercise logs, not a strength one's", () => {
    // normalizeEntry keeps only the fields the exercise actually logs. Judged against the
    // wrong list it reads any custom exercise as strength and throws dist and time away.
    const normalized = normalizeState({
      ...stateWith(planUsing("u-row"), { entries: { "p1|1|s-mine|0": { dist: 5, time: 30 } } }),
      exercises: [rower],
    });

    assert.deepEqual(normalized.entries["p1|1|s-mine|0"], { dist: 5, time: 30 });
  });

  it("repairs the list itself, and a repaired entry still holds its slot", () => {
    const normalized = normalizeState({
      ...withSled(),
      exercises: [{ id: "u-sled", name: "  Sled push  ", group: "not-a-group" }],
    });

    assert.equal(normalized.exercises[0].name, "Sled push");
    assert.equal(normalized.exercises[0].sets, 3, "given a catalog entry's shape");
    assert.equal(normalized.plans[0].days[0].slots.length, 1, "and the slot is not collateral");
  });

  it("is a fixed point, so nothing shifts on the second load", () => {
    const once = normalizeState(withSled({ entries: { "p1|1|s-mine|0": { kg: 80, reps: 5 } } }));
    assert.deepEqual(normalizeState(once), once);
  });

  it("comes back empty from a state that predates the field", () => {
    assert.deepEqual(normalizeState({ plans: [], entries: {} }).exercises, []);
    assert.deepEqual(emptyState().exercises, []);
  });

  it("survives a list that is not a list", () => {
    for (const junk of [null, 42, "u-sled", {}]) {
      assert.deepEqual(normalizeState({ plans: [], entries: {}, exercises: junk }).exercises, []);
    }
  });
});

describe("managing the user's own exercises", () => {
  const storeUsing = (exercises, extra = {}) =>
    storeWith({ ...stateWith(planUsing("u-sled"), extra), exercises });

  it("adds one under an id the catalog cannot collide with", () => {
    const store = storeWith(stateWith(testPlan()));
    const added = store.addExercise({ name: "Sled push", group: "legs", kind: "strength" });

    assert.equal(added.name, "Sled push");
    assert.ok(added.id.startsWith("u-"), added.id);
    assert.deepEqual(store.state.exercises, [added]);
  });

  it("makes an added exercise resolvable straight away, without a reload", () => {
    // The registry is what the views read. A newly added exercise the picker cannot resolve
    // would render as a raw i18n key until the next boot.
    const store = storeWith(stateWith(testPlan()));
    const added = store.addExercise({ name: "Rower", group: "cardio", kind: "cardio" });

    assert.deepEqual(entryFields(added.id), ["dist", "time"]);
    assert.equal(exerciseLabel(added.id), "Rower");
  });

  it("refuses to add one without a usable name", () => {
    const store = storeWith(stateWith(testPlan()));
    assert.equal(store.addExercise({ name: "   ", group: "legs", kind: "strength" }), null);
    assert.deepEqual(store.state.exercises, []);
  });

  it("persists an added exercise immediately, like every other mutator", () => {
    const storage = fakeStorage();
    const store = createStore(storage);
    store.addExercise({ name: "Sled push", group: "legs", kind: "strength" });

    assert.equal(storage.read(STATE_KEY).exercises[0].name, "Sled push");
  });

  it("renames one without disturbing the slots or records that use it", () => {
    const logged = { entries: { "p1|1|s-mine|0": { kg: 80, reps: 5 } } };
    const store = storeUsing([userExercise()], logged);
    store.renameExercise("u-sled", "Prowler push");

    assert.equal(store.state.exercises[0].name, "Prowler push");
    assert.equal(exerciseLabel("u-sled"), "Prowler push", "and the views see it at once");
    assert.equal(store.state.plans[0].days[0].slots.length, 1);
    assert.deepEqual(store.getEntry("p1", 1, "s-mine", 0), { kg: 80, reps: 5 });
  });

  it("ignores a rename to nothing rather than leaving an unnameable exercise", () => {
    const store = storeUsing([userExercise()]);
    store.renameExercise("u-sled", "   ");
    assert.equal(store.state.exercises[0].name, "Sled push");
  });

  it("deletes one, taking the slots that place it and their records", () => {
    const store = storeUsing([userExercise(), userExercise({ id: "u-row", name: "Rower" })], {
      entries: { "p1|1|s-mine|0": { kg: 80, reps: 5 } },
      setCounts: { "p1|1|s-mine": 5 },
    });

    assert.equal(store.deleteExercise("u-sled"), true);
    assert.deepEqual(store.state.exercises.map((e) => e.id), ["u-row"], "and only that one");
    assert.deepEqual(store.state.plans[0].days[0].slots, [], "the slot goes with it");
    assert.deepEqual(store.state.entries, {}, "so do its records");
    assert.deepEqual(store.state.setCounts, {}, "and its set-count override");
  });

  it("leaves other exercises' records alone when one is deleted", () => {
    const plan = planUsing("u-sled");
    plan.days[0].slots.push({
      id: "s-bench",
      exerciseId: "bench-press",
      name: null,
      nameKey: null,
      sets: 3,
      reps: null,
    });
    const store = storeWith({
      ...stateWith(plan, {
        entries: { "p1|1|s-mine|0": { kg: 80, reps: 5 }, "p1|1|s-bench|0": { kg: 60, reps: 8 } },
      }),
      exercises: [userExercise()],
    });

    store.deleteExercise("u-sled");
    assert.deepEqual(store.state.entries, { "p1|1|s-bench|0": { kg: 60, reps: 8 } });
  });

  it("reports nothing to delete for an id it does not have", () => {
    const store = storeUsing([userExercise()]);
    assert.equal(store.deleteExercise("u-nope"), false);
    assert.equal(store.state.exercises.length, 1);
  });

  it("does not re-bound a record's timestamp on an unrelated edit", () => {
    // A device whose clock ran ahead and was then corrected leaves records legitimately in
    // the future. The CLOCK_SKEW bound belongs to reading a file, not to adding an exercise:
    // re-normalizing the whole log here would strip `at` off real history nobody touched.
    const ahead = 2_000_000_000_000; // 2033, well past CLOCK_SKEW from any real "now"
    const store = createStore(fakeStorage({ [STATE_KEY]: JSON.stringify(stateWith(testPlan())) }), {
      now: () => ahead,
    });
    store.setEntryField("p1", 1, "s-bench", 0, "kg", 60);
    assert.equal(store.getEntry("p1", 1, "s-bench", 0).at, ahead, "written while ahead");

    store.addExercise({ name: "Sled push", group: "legs", kind: "strength" });
    assert.equal(store.getEntry("p1", 1, "s-bench", 0).at, ahead, "and left alone");
  });
});

describe("countExerciseUse", () => {
  const twoPlansUsing = () => {
    const second = { ...planUsing("u-sled", "s-mine2"), id: "p2" };
    return {
      ...stateWith(planUsing("u-sled"), {
        entries: {
          "p1|1|s-mine|0": { kg: 80, reps: 5 },
          "p1|2|s-mine|0": { kg: 85, reps: 5 },
          "p2|1|s-mine2|0": { kg: 90, reps: 5 },
        },
      }),
      exercises: [userExercise()],
      plans: [planUsing("u-sled"), second],
    };
  };

  it("counts the placements, the plans holding them, and their records", () => {
    const state = normalizeState(twoPlansUsing());
    assert.deepEqual(countExerciseUse(state, "u-sled"), { slots: 2, plans: 2, records: 3 });
  });

  it("counts records from every week, not just the one on screen", () => {
    const state = normalizeState({
      ...stateWith(planUsing("u-sled"), {
        entries: { "p1|1|s-mine|0": { kg: 80, reps: 5 }, "p1|3|s-mine|1": { kg: 85, reps: 5 } },
      }),
      exercises: [userExercise()],
    });
    assert.equal(countExerciseUse(state, "u-sled").records, 2);
  });

  it("is all zeroes for an exercise no plan places", () => {
    const state = normalizeState({ ...stateWith(testPlan()), exercises: [userExercise()] });
    assert.deepEqual(countExerciseUse(state, "u-sled"), { slots: 0, plans: 0, records: 0 });
  });

  it("agrees with what deleting actually removes", () => {
    // The count and the deletion have to share a definition, or the confirmation lies.
    const store = storeWith(twoPlansUsing());
    const { records } = countExerciseUse(store.state, "u-sled");
    const before = Object.keys(store.state.entries).length;

    store.deleteExercise("u-sled");
    assert.equal(before - Object.keys(store.state.entries).length, records);
  });
});
