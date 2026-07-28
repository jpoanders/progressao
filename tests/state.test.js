import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { findDay } from "../src/plan.js";
import {
  PREFS_KEY,
  STATE_KEY,
  clampSetCount,
  countDayEntries,
  createStore,
  emptyState,
  entryKey,
  findPrevious,
  findPreviousRun,
  getSetCount,
  hasCustomSetCounts,
  normalizePrefs,
  normalizeState,
  parseBackup,
  runHasData,
  setCountKey,
} from "../src/state.js";

const LEGACY_BACKUP = readFileSync(new URL("./fixtures/legacy-backup-v1.json", import.meta.url), "utf8");

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    read: (key) => (map.has(key) ? JSON.parse(map.get(key)) : null),
  };
}

const storeWithState = (state) =>
  createStore(fakeStorage({ [STATE_KEY]: JSON.stringify(state) }));

const day1 = findDay("d1");
const benchPress = day1.exercises.find((exercise) => exercise.id === "supino-reto");
const abs = findDay("d2").exercises.find((exercise) => exercise.id === "abdominal-d2");

describe("storage keys", () => {
  it("are frozen — changing these orphans real user data", () => {
    assert.equal(STATE_KEY, "progressao:v1");
    assert.equal(PREFS_KEY, "progressao:ui");
    assert.equal(entryKey(2, "d1", "supino-reto", 0), "2|d1|supino-reto|0");
    assert.equal(setCountKey(2, "d1", "supino-reto"), "2|d1|supino-reto");
  });
});

describe("normalizeState", () => {
  it("accepts a well-formed state unchanged", () => {
    const raw = {
      version: 1,
      lastExport: 123,
      entries: { "1|d1|supino-reto|0": { kg: 60, reps: 8 } },
      setCounts: { "1|d1|supino-reto": 4 },
      runs: { 1: { dist: 3, time: 20, cycles: 6 } },
    };
    assert.deepEqual(normalizeState(raw), raw);
  });

  it("fills in fields added after the first release", () => {
    const normalized = normalizeState({ version: 1, lastExport: null, entries: {} });
    assert.deepEqual(normalized.setCounts, {});
    assert.deepEqual(normalized.runs, {});
  });

  it("degrades to an empty state instead of throwing", () => {
    for (const junk of [null, undefined, 42, "nope", [], {}, { entries: null }, { entries: [] }]) {
      assert.deepEqual(normalizeState(junk), emptyState(), `input: ${JSON.stringify(junk)}`);
    }
  });

  it("drops a non-numeric lastExport", () => {
    assert.equal(normalizeState({ entries: {}, lastExport: "yesterday" }).lastExport, null);
  });
});

describe("parseBackup", () => {
  it("accepts a backup exported by the pre-refactor build", () => {
    const state = parseBackup(LEGACY_BACKUP);

    assert.equal(Object.keys(state.entries).length, 17);
    assert.deepEqual(state.entries["1|d1|supino-reto|0"], { kg: 60, reps: 8 });
    assert.deepEqual(state.entries["1|d2|abdominal-d2|0"], { kg: null, reps: 20 });
    assert.deepEqual(state.setCounts, { "2|d1|supino-reto": 4, "2|d2|panturrilha-pe": 3 });
    assert.deepEqual(state.runs["1"], { dist: 3.2, time: 22, cycles: 7 });
    assert.equal(state.runs["2"].time, null);
  });

  it("rejects anything that is not a backup", () => {
    for (const junk of ["null", "[]", "42", '{"entries":null}', '{"foo":1}', "not json"]) {
      assert.throws(() => parseBackup(junk), `input: ${junk}`);
    }
  });
});

describe("normalizePrefs", () => {
  it("defaults an unknown week and keeps a valid one", () => {
    assert.equal(normalizePrefs({ week: 9 }).week, 1);
    assert.equal(normalizePrefs({ week: "2" }).week, 1);
    assert.equal(normalizePrefs({ week: 3 }).week, 3);
  });

  it("has no locale until the user picks one, so it follows the device", () => {
    assert.equal(normalizePrefs({}).locale, null);
    assert.equal(normalizePrefs({ locale: "pt-BR" }).locale, "pt-BR");
  });

  it("survives missing or corrupt prefs", () => {
    assert.deepEqual(normalizePrefs(null), {
      week: 1,
      day: "d1",
      locale: null,
      backupDismissedAt: 0,
      installDismissed: false,
    });
  });
});

describe("clampSetCount", () => {
  it("holds the count between 1 and 8", () => {
    assert.equal(clampSetCount(0), 1);
    assert.equal(clampSetCount(-3), 1);
    assert.equal(clampSetCount(4), 4);
    assert.equal(clampSetCount(9), 8);
  });
});

describe("getSetCount", () => {
  it("uses the plan's prescription when there is no override", () => {
    assert.equal(getSetCount(emptyState(), 1, "d1", benchPress), 3);
  });

  it("prefers a stored override", () => {
    const state = { ...emptyState(), setCounts: { "2|d1|supino-reto": 5 } };
    assert.equal(getSetCount(state, 2, "d1", benchPress), 5);
    assert.equal(getSetCount(state, 1, "d1", benchPress), 3, "overrides are per week");
  });

  it("clamps a corrupt override", () => {
    const state = { ...emptyState(), setCounts: { "1|d1|supino-reto": 99 } };
    assert.equal(getSetCount(state, 1, "d1", benchPress), 8);
  });
});

describe("findPrevious", () => {
  const state = normalizeState({
    entries: {
      "1|d1|supino-reto|0": { kg: 60, reps: 8 },
      "3|d1|supino-reto|0": { kg: 65, reps: 8 },
    },
  });

  it("returns null in week 1, where there is nothing to beat", () => {
    assert.equal(findPrevious(state, 1, "d1", "supino-reto", 0), null);
  });

  it("skips a week that was not logged", () => {
    assert.deepEqual(findPrevious(state, 3, "d1", "supino-reto", 0), {
      week: 1,
      kg: 60,
      reps: 8,
    });
  });

  it("picks the nearest earlier week", () => {
    assert.deepEqual(findPrevious(state, 4, "d1", "supino-reto", 0), {
      week: 3,
      kg: 65,
      reps: 8,
    });
  });

  it("ignores sets that were never filled in", () => {
    assert.equal(findPrevious(state, 4, "d1", "supino-reto", 2), null);
  });
});

describe("findPreviousRun", () => {
  const state = normalizeState({
    entries: {},
    runs: { 1: { dist: 3.2, time: 22, cycles: 7 }, 2: { dist: null, time: null, cycles: null } },
  });

  it("ignores a run with no data at all", () => {
    assert.equal(findPreviousRun(state, 3).week, 1);
  });

  it("returns null when no earlier run exists", () => {
    assert.equal(findPreviousRun(state, 1), null);
  });
});

describe("runHasData", () => {
  it("treats a run as empty only when every field is null", () => {
    assert.equal(runHasData(null), false);
    assert.equal(runHasData({ dist: null, time: null, cycles: null }), false);
    assert.equal(runHasData({ dist: null, time: null, cycles: 6 }), true);
    assert.equal(runHasData({ dist: 0, time: null, cycles: null }), true);
  });
});

describe("store mutations", () => {
  it("writes through to storage on every edit", () => {
    const storage = fakeStorage();
    const store = createStore(storage);

    store.setEntryField(1, "d1", "supino-reto", 0, "kg", 60);

    assert.deepEqual(storage.read(STATE_KEY).entries["1|d1|supino-reto|0"], {
      kg: 60,
      reps: null,
    });
  });

  it("does not keep a row the user emptied again", () => {
    const store = storeWithState(emptyState());

    store.setEntryField(1, "d1", "supino-reto", 0, "kg", 60);
    store.setEntryField(1, "d1", "supino-reto", 0, "kg", null);

    assert.equal(store.getEntry(1, "d1", "supino-reto", 0), null);
    assert.deepEqual(store.state.entries, {});
  });

  it("does not keep a run the user emptied again", () => {
    const store = storeWithState(emptyState());

    store.setRunField(2, "dist", 3.2);
    assert.ok(store.getRun(2));

    store.setRunField(2, "dist", null);
    assert.equal(store.getRun(2), null);
    assert.deepEqual(store.state.runs, {});
  });

  it("stores a set-count override and drops it on return to the plan default", () => {
    const store = storeWithState(emptyState());

    store.setSetCount(2, "d1", benchPress, 4);
    assert.equal(store.state.setCounts["2|d1|supino-reto"], 4);

    store.setSetCount(2, "d1", benchPress, 3);
    assert.deepEqual(store.state.setCounts, {}, "the default is implicit, never stored");
  });

  it("clamps an out-of-range set count", () => {
    const store = storeWithState(emptyState());
    store.setSetCount(1, "d1", benchPress, 99);
    assert.equal(store.state.setCounts["1|d1|supino-reto"], 8);
  });

  it("deletes the dropped set's record when a set is removed", () => {
    const store = storeWithState(emptyState());
    store.setEntryField(1, "d1", "supino-reto", 2, "kg", 50);

    store.deleteEntry(1, "d1", "supino-reto", 2);

    assert.equal(store.getEntry(1, "d1", "supino-reto", 2), null);
  });

  it("clears a day's records and returns its set counts to the plan", () => {
    const store = storeWithState(emptyState());
    store.setEntryField(1, "d1", "supino-reto", 0, "kg", 60);
    store.setEntryField(1, "d1", "triceps-polia", 0, "reps", 12);
    store.setSetCount(1, "d1", benchPress, 5);
    // A different week must survive untouched.
    store.setEntryField(2, "d1", "supino-reto", 0, "kg", 62.5);

    store.clearDay(1, day1);

    assert.deepEqual(store.state.entries, { "2|d1|supino-reto|0": { kg: 62.5, reps: null } });
    assert.deepEqual(store.state.setCounts, {});
  });

  it("clears records hidden behind a reduced set count", () => {
    // Reachable via an imported backup: a record at set 6 with the count down at 3.
    const store = storeWithState(
      normalizeState({
        entries: { "1|d1|supino-reto|5": { kg: 40, reps: 10 } },
        setCounts: { "1|d1|supino-reto": 3 },
      }),
    );

    assert.equal(countDayEntries(store.state, 1, day1), 1);
    store.clearDay(1, day1);
    assert.deepEqual(store.state.entries, {});
  });

  it("replaces the whole log on import", () => {
    const store = storeWithState(emptyState());
    store.setEntryField(1, "d1", "supino-reto", 0, "kg", 60);

    store.replaceState(parseBackup(LEGACY_BACKUP));

    assert.equal(Object.keys(store.state.entries).length, 17);
    assert.equal(store.getEntry(1, "d1", "supino-reto", 0).reps, 8);
  });

  it("stamps the export time so the reminder banner goes quiet", () => {
    const store = storeWithState(emptyState());
    store.markExported(1_784_557_800_000);
    assert.equal(store.state.lastExport, 1_784_557_800_000);
  });

  it("persists preferences separately from training data", () => {
    const storage = fakeStorage();
    const store = createStore(storage);

    store.setPref("locale", "pt-BR");
    store.setPref("week", 3);

    assert.equal(storage.read(PREFS_KEY).locale, "pt-BR");
    assert.equal(storage.read(PREFS_KEY).week, 3);
    assert.equal(storage.read(STATE_KEY), null, "prefs must not touch the log");
  });

  it("starts clean when storage holds an unreadable blob", () => {
    const store = createStore(fakeStorage({ [STATE_KEY]: "{not json", [PREFS_KEY]: "{{{" }));

    assert.deepEqual(store.state, emptyState());
    assert.equal(store.prefs.week, 1);
  });
});

describe("day inspection", () => {
  const store = storeWithState(parseBackup(LEGACY_BACKUP));

  it("counts every record in a day", () => {
    assert.equal(countDayEntries(store.state, 1, day1), 6);
    assert.equal(countDayEntries(store.state, 4, day1), 0);
  });

  it("detects a customised set count", () => {
    assert.equal(hasCustomSetCounts(store.state, 2, day1), true);
    assert.equal(hasCustomSetCounts(store.state, 1, day1), false);
  });
});

describe("legacy data loads without an import", () => {
  it("reads a state blob written by the pre-refactor build", () => {
    const store = createStore(fakeStorage({ [STATE_KEY]: LEGACY_BACKUP }));

    assert.equal(store.getEntry(1, "d1", "supino-reto", 0).kg, 60);
    assert.equal(store.getSetCount(2, "d1", benchPress), 4, "override survives");
    assert.equal(store.getSetCount(1, "d1", benchPress), 3);
    assert.deepEqual(store.findPrevious(2, "d1", "supino-reto", 0), { week: 1, kg: 60, reps: 8 });
    assert.equal(store.findPrevious(2, "d1", "supino-reto", 3), null, "week 1 had only 3 sets");
    assert.equal(store.findPreviousRun(2).week, 1);
    assert.equal(store.getEntry(1, "d2", "abdominal-d2", 0).reps, 20, "reps-only record");
    assert.equal(abs.reps, null, "abs are prescribed without a rep range");
  });
});
