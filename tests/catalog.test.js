import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CATALOG,
  GROUPS,
  USER_KINDS,
  byGroup,
  entryFields,
  exerciseKind,
  exerciseLabel,
  findExercise,
  isKnownExercise,
  makeLookup,
  normalizeUserExercises,
  setUserExercises,
  userExercises,
} from "../src/catalog.js";
import { DEFAULT_LOCALE, setLocale } from "../src/i18n/index.js";

/** A normalized user exercise, the shape the store persists. */
const userExercise = (overrides = {}) => ({
  id: "u-sled",
  name: "Sled push",
  group: "legs",
  kind: "strength",
  sets: 3,
  reps: null,
  ...overrides,
});

describe("makeLookup", () => {
  it("resolves a catalog exercise exactly as before", () => {
    const lookup = makeLookup();

    assert.equal(lookup.find("bench-press").group, "chest");
    assert.equal(lookup.isKnown("bench-press"), true);
    assert.deepEqual(lookup.fields("bench-press"), ["kg", "reps"]);
    assert.equal(lookup.kind("walk-run"), "cardio");
  });

  it("falls through to the user's own exercises", () => {
    const lookup = makeLookup([userExercise(), userExercise({ id: "u-row", kind: "cardio" })]);

    assert.equal(lookup.find("u-sled").name, "Sled push");
    assert.equal(lookup.isKnown("u-sled"), true);
    assert.deepEqual(lookup.fields("u-row"), ["dist", "time"], "a cardio one logs dist and time");
    assert.equal(lookup.kind("u-row"), "cardio");
  });

  it("still refuses an id nothing knows, which is what drops a stale slot", () => {
    const lookup = makeLookup([userExercise()]);

    assert.equal(lookup.isKnown("u-deleted"), false);
    assert.equal(lookup.find("u-deleted"), null);
    // The strength fallback is deliberate: a plan referencing a removed id renders something
    // usable rather than blowing up. See catalog.js.
    assert.deepEqual(lookup.fields("u-deleted"), ["kg", "reps"]);
    assert.equal(lookup.kind("u-deleted"), "strength");
  });

  it("lets the catalog win a collision, so a hand-edited file cannot shadow it", () => {
    const lookup = makeLookup([userExercise({ id: "bench-press", name: "Not the real one" })]);

    assert.equal(lookup.find("bench-press").group, "chest", "the catalog entry, not the file's");
    assert.equal(lookup.find("bench-press").name, undefined);
  });

  it("survives being handed something that is not a list", () => {
    for (const junk of [undefined, null, "u-sled", 42, {}]) {
      assert.equal(makeLookup(junk).isKnown("bench-press"), true, `junk: ${junk}`);
    }
  });

  it("places a user exercise in its own group, after the catalog's own", () => {
    const lookup = makeLookup([userExercise({ id: "u-sled", group: "legs" })]);
    const legs = lookup.byGroup().find(({ group }) => group === "legs");

    assert.equal(legs.exercises.at(-1).id, "u-sled");
    assert.ok(legs.exercises.length > 1, "the catalog's leg work is still there");
    assert.deepEqual(
      lookup.byGroup().map(({ group }) => group),
      GROUPS,
      "and the group order is untouched",
    );
  });

  it("drops a group nothing sits in, so an unused group never shows an empty heading", () => {
    const groups = makeLookup().byGroup();
    assert.ok(groups.every(({ exercises }) => exercises.length > 0));
  });
});

describe("the exercise registry", () => {
  it("installs a list that the module-level lookups then see", () => {
    setUserExercises([userExercise({ id: "u-row", kind: "cardio" })]);
    try {
      assert.equal(isKnownExercise("u-row"), true);
      assert.equal(findExercise("u-row").name, "Sled push");
      assert.deepEqual(entryFields("u-row"), ["dist", "time"]);
      assert.equal(exerciseKind("u-row"), "cardio");
      assert.deepEqual(userExercises().map((exercise) => exercise.id), ["u-row"]);
    } finally {
      setUserExercises([]);
    }
  });

  it("forgets the previous list rather than merging into it", () => {
    setUserExercises([userExercise({ id: "u-first" })]);
    setUserExercises([userExercise({ id: "u-second" })]);
    try {
      assert.equal(isKnownExercise("u-second"), true);
      assert.equal(isKnownExercise("u-first"), false, "installing replaces, it never adds");
    } finally {
      setUserExercises([]);
    }
  });

  it("starts empty and takes junk as empty, so the catalog is never lost", () => {
    setUserExercises("nonsense");
    try {
      assert.deepEqual(userExercises(), []);
      assert.equal(isKnownExercise("bench-press"), true);
    } finally {
      setUserExercises([]);
    }
  });

  it("keeps the picker working with nothing installed", () => {
    setUserExercises([]);
    assert.equal(byGroup().length, GROUPS.length);
  });
});

describe("exerciseLabel", () => {
  it("translates a catalog exercise through its id", () => {
    setLocale("en");
    assert.equal(exerciseLabel("bench-press"), "Flat bench press (barbell or dumbbells)");

    setLocale("pt-BR");
    assert.equal(exerciseLabel("bench-press"), "Supino reto (barra ou halteres)");
    setLocale(DEFAULT_LOCALE);
  });

  it("uses the typed name for a user exercise, in every locale", () => {
    setUserExercises([userExercise()]);
    try {
      for (const tag of ["en", "pt-BR"]) {
        setLocale(tag);
        // A name the user typed has no translation and must not be looked for: t() would
        // return the key, and the picker would read "catalog.exercises.u-sled".
        assert.equal(exerciseLabel("u-sled"), "Sled push", tag);
      }
    } finally {
      setUserExercises([]);
      setLocale(DEFAULT_LOCALE);
    }
  });
});

describe("normalizeUserExercises", () => {
  it("keeps a well-formed list exactly as it is", () => {
    const list = [userExercise(), userExercise({ id: "u-row", name: "Rower", kind: "cardio" })];
    assert.deepEqual(normalizeUserExercises(list), list);
  });

  it("is a fixed point, so an imported file normalizes the same as a stored one", () => {
    const once = normalizeUserExercises([{ id: "u-sled", name: "  Sled push  " }]);
    assert.deepEqual(normalizeUserExercises(once), once);
  });

  it("drops an entry with no usable name, the one field that has no default", () => {
    const normalized = normalizeUserExercises([
      { id: "u-a", name: "   " },
      { id: "u-b", name: null },
      { id: "u-c" },
      { id: "u-d", name: "Kept" },
    ]);
    assert.deepEqual(normalized.map((exercise) => exercise.id), ["u-d"]);
  });

  it("drops an entry with no id, since records are keyed through it", () => {
    assert.deepEqual(normalizeUserExercises([{ name: "Nameless id" }, { id: "", name: "Blank" }]), []);
  });

  it("trims the name, matching how the plan editor stores one", () => {
    assert.equal(normalizeUserExercises([{ id: "u-a", name: "  Sled push \n" }])[0].name, "Sled push");
  });

  it("repairs an unknown group rather than dropping the exercise", () => {
    // Dropping would take the user's slots and their records with it — far too high a price
    // for a group slug that only a hand-edited file could get wrong.
    const [exercise] = normalizeUserExercises([{ id: "u-a", name: "Sled", group: "quads" }]);
    assert.ok(GROUPS.includes(exercise.group));
  });

  it("falls back to strength for a kind the log screen has no fields for", () => {
    const normalized = normalizeUserExercises([
      { id: "u-a", name: "A", kind: "mobility" },
      { id: "u-b", name: "B", kind: "cardio" },
      { id: "u-c", name: "C" },
    ]);
    assert.deepEqual(normalized.map((exercise) => exercise.kind), ["strength", "cardio", "strength"]);
  });

  it("gives every entry the same shape a catalog entry has", () => {
    const [exercise] = normalizeUserExercises([{ id: "u-a", name: "Sled" }]);
    assert.deepEqual(Object.keys(exercise).sort(), ["group", "id", "kind", "name", "reps", "sets"]);
    // plan.js dereferences .sets on whatever findExercise returns, without a guard.
    assert.equal(Number.isFinite(exercise.sets), true);
    assert.equal(exercise.reps, null);
  });

  it("keeps the first of two entries sharing an id", () => {
    const normalized = normalizeUserExercises([
      { id: "u-a", name: "First" },
      { id: "u-a", name: "Second" },
    ]);
    assert.deepEqual(normalized.map((exercise) => exercise.name), ["First"]);
  });

  it("drops an entry that would shadow a catalog id", () => {
    // Harmless to drop: the lookup prefers the catalog anyway, so any slot pointing at that
    // id still resolves. Keeping it would just be an invisible row in the manage screen.
    assert.deepEqual(normalizeUserExercises([{ id: "bench-press", name: "Mine" }]), []);
  });

  it("takes anything unusable as an empty list, never throwing", () => {
    for (const junk of [undefined, null, 42, "u-a", {}, [null, 7, "x", []]]) {
      assert.deepEqual(normalizeUserExercises(junk), [], `junk: ${JSON.stringify(junk)}`);
    }
  });
});

describe("the catalog", () => {
  it("carries no id a user exercise could collide with", () => {
    // Ids are minted as `u-<random>`, so this is what makes a collision impossible by
    // construction rather than by hope.
    for (const exercise of CATALOG) {
      assert.equal(exercise.id.startsWith("u-"), false, exercise.id);
    }
  });

  it("names the kinds a user may choose, and only ones the log screen can render", () => {
    assert.deepEqual(USER_KINDS, ["strength", "cardio"]);
    for (const kind of USER_KINDS) {
      assert.ok(CATALOG.some((exercise) => exercise.kind === kind), `${kind} is a real kind`);
    }
  });
});
