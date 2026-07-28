import assert from "node:assert/strict";
import { describe, it } from "node:test";

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
import { setLocale } from "../src/i18n/index.js";

const idsOf = (plan) => [...plan.days.map((day) => day.id), ...planSlots(plan).map((s) => s.id)];

describe("the built-in plan", () => {
  it("only references exercises the catalog knows", () => {
    for (const slot of planSlots(DEFAULT_PLAN)) {
      assert.ok(
        isKnownExercise(slot.exerciseId),
        `${slot.id} references the unknown exercise "${slot.exerciseId}"`,
      );
    }
  });

  it("gives every day and slot a unique id, because records are keyed by them", () => {
    const ids = idsOf(DEFAULT_PLAN);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("names itself and its days through i18n rather than literal text", () => {
    assert.ok(DEFAULT_PLAN.nameKey);
    assert.equal(DEFAULT_PLAN.name, null);
    for (const day of DEFAULT_PLAN.days) {
      assert.ok(day.nameKey, `day ${day.id} has no nameKey`);
      assert.equal(day.name, null);
    }
  });

  it("survives normalization untouched — it is already the canonical shape", () => {
    assert.deepEqual(normalizePlan(DEFAULT_PLAN), DEFAULT_PLAN);
  });

  it("hands out independent copies, so one store cannot mutate another's", () => {
    const first = defaultPlan();
    first.days[0].slots[0].sets = 99;

    assert.equal(defaultPlan().days[0].slots[0].sets, 3);
    assert.equal(DEFAULT_PLAN.days[0].slots[0].sets, 3);
  });
});

describe("factories", () => {
  it("mints a distinct id every time", () => {
    const ids = [newPlan().id, newPlan().id, newDay().id, newSlot("bench-press").id];
    assert.equal(new Set(ids).size, ids.length);
  });

  it("pre-fills a slot from the catalog", () => {
    const slot = newSlot("standing-calf-raise");
    assert.equal(slot.sets, 4);
    assert.deepEqual(slot.reps, [12, 15]);
  });

  it("gives a cardio slot no rep target", () => {
    assert.equal(newSlot("walk-run").reps, null);
  });

  it("starts a new plan on one empty day", () => {
    const plan = newPlan("Autumn block");
    assert.equal(plan.name, "Autumn block");
    assert.equal(plan.days.length, 1);
    assert.deepEqual(plan.days[0].slots, []);
  });
});

describe("normalizePlan", () => {
  it("repairs junk into something renderable instead of throwing", () => {
    for (const junk of [null, undefined, 42, "nope", [], {}, { days: "no" }]) {
      const plan = normalizePlan(junk);
      assert.equal(typeof plan.id, "string");
      assert.equal(plan.days.length, 1, `input: ${JSON.stringify(junk)}`);
      assert.ok(plan.weeks >= 1);
    }
  });

  it("clamps the week count", () => {
    assert.equal(normalizePlan({ weeks: 0 }).weeks, 1);
    assert.equal(normalizePlan({ weeks: 999 }).weeks, MAX_WEEKS);
    assert.equal(normalizePlan({ weeks: "6" }).weeks, 4, "a non-number falls back to the default");
    assert.equal(normalizePlan({ weeks: 6 }).weeks, 6);
  });

  it("caps the number of days", () => {
    const days = Array.from({ length: 30 }, () => ({ slots: [] }));
    assert.equal(normalizePlan({ days }).days.length, MAX_DAYS);
  });

  it("drops slots pointing at exercises the catalog no longer has", () => {
    const plan = normalizePlan({
      days: [{ slots: [{ exerciseId: "bench-press" }, { exerciseId: "moon-press" }] }],
    });

    assert.deepEqual(
      plan.days[0].slots.map((slot) => slot.exerciseId),
      ["bench-press"],
    );
  });

  it("clamps set counts and falls back to the catalog for a missing one", () => {
    const plan = normalizePlan({
      days: [
        {
          slots: [
            { exerciseId: "bench-press", sets: 99 },
            { exerciseId: "bench-press", sets: 0 },
            { exerciseId: "standing-calf-raise" },
          ],
        },
      ],
    });

    assert.deepEqual(
      plan.days[0].slots.map((slot) => slot.sets),
      [MAX_SETS, 1, 4],
    );
  });

  it("repairs rep ranges, treating anything unusable as no rep target", () => {
    const reps = (raw) =>
      normalizePlan({ days: [{ slots: [{ exerciseId: "bench-press", reps: raw }] }] }).days[0]
        .slots[0].reps;

    assert.deepEqual(reps([6, 8]), [6, 8]);
    assert.deepEqual(reps([8, 6]), [6, 8], "a reversed range is put back in order");
    assert.deepEqual(reps([0, 500]), [1, 100], "the bounds are clamped");
    assert.equal(reps(null), null);
    assert.equal(reps([6]), null);
    assert.equal(reps([6, "eight"]), null);
    assert.equal(reps("6-8"), null);
  });

  it("re-mints duplicate ids, which would otherwise share one history", () => {
    const plan = normalizePlan({
      days: [
        { id: "d1", slots: [{ id: "s1", exerciseId: "bench-press" }] },
        { id: "d1", slots: [{ id: "s1", exerciseId: "leg-press" }] },
      ],
    });

    const ids = idsOf(plan);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("treats a blank name as no name, so the fallback can take over", () => {
    assert.equal(normalizePlan({ name: "   " }).name, null);
    assert.equal(normalizePlan({ name: "Block A" }).name, "Block A");
  });
});

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

  it("falls back to the catalog name for a slot, in the active locale", () => {
    setLocale("en");
    assert.equal(slotName({ exerciseId: "bench-press", name: null, nameKey: null }),
      "Flat bench press (barbell or dumbbells)");

    setLocale("pt-BR");
    assert.equal(slotName({ exerciseId: "bench-press", name: null, nameKey: null }),
      "Supino reto (barra ou halteres)");

    setLocale("en");
  });

  it("is empty for an unnamed day, leaving the caller to number it", () => {
    assert.equal(displayName({ name: null, nameKey: null }), "");
  });
});

describe("clamps", () => {
  it("holds the set count between 1 and 8", () => {
    assert.equal(clampSets(0), 1);
    assert.equal(clampSets(-3), 1);
    assert.equal(clampSets(4), 4);
    assert.equal(clampSets(9), MAX_SETS);
  });

  it("holds the week count between 1 and 24", () => {
    assert.equal(clampWeeks(0), 1);
    assert.equal(clampWeeks(4), 4);
    assert.equal(clampWeeks(100), MAX_WEEKS);
  });
});

describe("moveItem", () => {
  const items = ["a", "b", "c"];

  it("swaps with the neighbour in the given direction", () => {
    assert.deepEqual(moveItem(items, 1, -1), ["b", "a", "c"]);
    assert.deepEqual(moveItem(items, 1, +1), ["a", "c", "b"]);
  });

  it("leaves the ends alone rather than wrapping around", () => {
    assert.deepEqual(moveItem(items, 0, -1), items);
    assert.deepEqual(moveItem(items, 2, +1), items);
  });

  it("does not mutate the original", () => {
    moveItem(items, 0, +1);
    assert.deepEqual(items, ["a", "b", "c"]);
  });
});

describe("the catalog", () => {
  it("has unique ids", () => {
    const ids = CATALOG.map((exercise) => exercise.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});
