/**
 * The Plan model: pure data plus the functions that build and repair it.
 *
 * A plan is user data. It lives in the training log (see src/state.js) rather than in
 * source, which is what makes it editable in the app and what puts it inside every
 * backup file. Nothing here touches storage or the DOM.
 *
 *   plan  { id, name, nameKey, weeks, days: [Day] }
 *   day   { id, name, nameKey, slots: [Slot] }
 *   slot  { id, exerciseId, name, nameKey, sets, reps }
 *
 * ── Slots are the unit of history ────────────────────────────────────────────────────
 * A slot is one placement of a catalog exercise on a day, carrying its own id. Records
 * are keyed by slot id, not by exercise id, so the same exercise can appear twice on a
 * day and reordering or renaming never orphans what was logged. Editing a plan is
 * therefore safe; only *removing* a slot discards records, which src/state.js does
 * deliberately and after confirmation.
 *
 * ── Names ────────────────────────────────────────────────────────────────────────────
 * `name` is a string the user typed and has no translation. `nameKey` is an i18n key,
 * used by the plan this app ships with so it still reads correctly in both locales.
 * displayName() resolves the two, falling back to the catalog entry's own name.
 */

import { findExercise, isKnownExercise } from "./catalog.js";
import { t } from "./i18n/index.js";

export const MIN_WEEKS = 1;
export const MAX_WEEKS = 24;

export const MIN_DAYS = 1;
export const MAX_DAYS = 10;

export const MIN_SETS = 1;
export const MAX_SETS = 8;

/** Bounds for a prescribed rep range; anything outside is treated as corrupt. */
export const MIN_REPS = 1;
export const MAX_REPS = 100;

const DEFAULT_WEEKS = 4;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const clampWeeks = (weeks) => clamp(Math.round(weeks), MIN_WEEKS, MAX_WEEKS);
export const clampSets = (sets) => clamp(Math.round(sets), MIN_SETS, MAX_SETS);

/** Week numbers of a plan, 1-based — what the week chips are built from. */
export function weeksOf(plan) {
  return Array.from({ length: plan.weeks }, (_, index) => index + 1);
}

/**
 * A short unique id. Only user-created plans get one — everything in DEFAULT_PLAN uses a
 * readable literal so that a fresh install is predictable, in tests and in a backup file.
 */
export function newId(prefix) {
  const random = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

export function newSlot(exerciseId) {
  const exercise = findExercise(exerciseId);
  return {
    id: newId("s"),
    exerciseId,
    name: null,
    nameKey: null,
    sets: exercise?.sets ?? 3,
    reps: exercise?.reps ?? null,
  };
}

export function newDay(name = null) {
  return { id: newId("d"), name, nameKey: null, slots: [] };
}

export function newPlan(name = null) {
  return { id: newId("plan"), name, nameKey: null, weeks: DEFAULT_WEEKS, days: [newDay()] };
}

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
  name: null,
  nameKey: "plan.defaultName",
  weeks: 4,
  days: [
    {
      id: "d1",
      name: null,
      nameKey: "plan.defaultDays.d1",
      slots: [
        slot("d1-s1", "bench-press", 3, [6, 8]),
        slot("d1-s2", "incline-dumbbell-press", 3, [8, 10]),
        slot("d1-s3", "shoulder-press", 3, [6, 8]),
        slot("d1-s4", "chest-fly", 3, [12, 15]),
        slot("d1-s5", "triceps-pushdown", 3, [10, 12]),
        slot("d1-s6", "lateral-raise", 3, [12, 15]),
      ],
    },
    {
      id: "d2",
      name: null,
      nameKey: "plan.defaultDays.d2",
      slots: [
        slot("d2-s1", "back-squat", 3, [6, 8]),
        slot("d2-s2", "leg-press", 3, [10, 12]),
        slot("d2-s3", "hack-squat", 3, [10, 12]),
        slot("d2-s4", "standing-calf-raise", 4, [12, 15]),
        slot("d2-s5", "abs", 3, null),
      ],
    },
    {
      id: "d3",
      name: null,
      nameKey: "plan.defaultDays.d3",
      slots: [
        slot("d3-s1", "pull-up", 3, [6, 10]),
        slot("d3-s2", "bent-over-row", 3, [8, 10]),
        slot("d3-s3", "seated-row", 3, [10, 12]),
        slot("d3-s4", "face-pull", 3, [12, 15]),
        slot("d3-s5", "barbell-curl", 3, [8, 10]),
        slot("d3-s6", "hammer-curl", 3, [10, 12]),
      ],
    },
    {
      id: "d4",
      name: null,
      nameKey: "plan.defaultDays.d4",
      slots: [
        slot("d4-s1", "romanian-deadlift", 3, [8, 10]),
        slot("d4-s2", "leg-curl", 3, [10, 12]),
        slot("d4-s3", "leg-extension", 3, [12, 15]),
        slot("d4-s4", "seated-calf-raise", 4, [12, 15]),
        slot("d4-s5", "abs", 3, null),
      ],
    },
    {
      id: "d5",
      name: null,
      nameKey: "plan.defaultDays.d5",
      slots: [slot("d5-s1", "walk-run", 1, null)],
    },
  ],
};

/** A deep, independent copy — plans are mutable user data, never shared by reference. */
export function clonePlan(plan) {
  return structuredClone(plan);
}

/** DEFAULT_PLAN as a fresh copy, safe to hand to a store that will mutate it. */
export function defaultPlan() {
  return clonePlan(DEFAULT_PLAN);
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const asName = (value) => (typeof value === "string" && value.trim() !== "" ? value : null);

function normalizeReps(raw) {
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const bounds = raw.map((value) =>
    Number.isFinite(value) ? clamp(Math.round(value), MIN_REPS, MAX_REPS) : null,
  );
  if (bounds.some((value) => value == null)) return null;

  const [min, max] = bounds;
  return min <= max ? [min, max] : [max, min];
}

/**
 * Repairs one slot, or returns null to drop it.
 *
 * A slot pointing at an exercise the catalog no longer knows is dropped rather than
 * rendered as a raw id — its records go with it, which is the honest outcome for a plan
 * that references something that no longer exists.
 */
function normalizeSlot(raw, takeId) {
  if (!isPlainObject(raw) || !isKnownExercise(raw.exerciseId)) return null;
  const catalogEntry = findExercise(raw.exerciseId);

  return {
    id: takeId(raw.id, "s"),
    exerciseId: raw.exerciseId,
    name: asName(raw.name),
    nameKey: asName(raw.nameKey),
    sets: Number.isFinite(raw.sets) ? clampSets(raw.sets) : catalogEntry.sets,
    reps: normalizeReps(raw.reps),
  };
}

function normalizeDay(raw, takeId) {
  const source = isPlainObject(raw) ? raw : {};
  const slots = Array.isArray(source.slots) ? source.slots : [];

  return {
    id: takeId(source.id, "d"),
    name: asName(source.name),
    nameKey: asName(source.nameKey),
    slots: slots.map((candidate) => normalizeSlot(candidate, takeId)).filter(Boolean),
  };
}

/**
 * Repairs a plan read from storage or an imported backup into something every view can
 * render without defensive checks: ids present and unique, counts within bounds, at least
 * one day. Never throws — a plan too broken to repair still comes back as an empty one.
 */
export function normalizePlan(raw) {
  const source = isPlainObject(raw) ? raw : {};

  // Ids must be unique within a plan: they are what records are keyed by, so a duplicate
  // would make two slots share one history. A collision gets a fresh id instead.
  const seen = new Set();
  const takeId = (candidate, prefix) => {
    const id = typeof candidate === "string" && candidate !== "" ? candidate : newId(prefix);
    const unique = seen.has(id) ? newId(prefix) : id;
    seen.add(unique);
    return unique;
  };

  const days = (Array.isArray(source.days) ? source.days : [])
    .slice(0, MAX_DAYS)
    .map((day) => normalizeDay(day, takeId));

  return {
    id: typeof source.id === "string" && source.id !== "" ? source.id : newId("plan"),
    name: asName(source.name),
    nameKey: asName(source.nameKey),
    weeks: Number.isFinite(source.weeks) ? clampWeeks(source.weeks) : DEFAULT_WEEKS,
    days: days.length > 0 ? days : [newDay()],
  };
}

export function findPlan(plans, planId) {
  return plans.find((plan) => plan.id === planId) ?? null;
}

export function findDay(plan, dayId) {
  return plan.days.find((day) => day.id === dayId) ?? null;
}

export function findSlot(plan, slotId) {
  for (const day of plan.days) {
    const found = day.slots.find((candidate) => candidate.id === slotId);
    if (found) return found;
  }
  return null;
}

/** Every slot in the plan, flattened — used when purging a plan's records. */
export function planSlots(plan) {
  return plan.days.flatMap((day) => day.slots);
}

/** Position of a day in the plan, 1-based, for the "Day 2" chips. */
export function dayNumber(plan, dayId) {
  return plan.days.findIndex((day) => day.id === dayId) + 1;
}

/**
 * What to call a plan, a day, or a slot: the user's own words if they typed any, else the
 * i18n key the shipped plan carries, else — for slots — the catalog exercise's name.
 */
export function displayName(node, fallbackKey = null) {
  if (node?.name) return node.name;
  if (node?.nameKey) return t(node.nameKey);
  return fallbackKey ? t(fallbackKey) : "";
}

/** A slot's display name, falling back to the catalog. */
export function slotName(candidate) {
  return displayName(candidate, `catalog.exercises.${candidate.exerciseId}`);
}

/** Moves an item within an array by `delta`, returning a new array. */
export function moveItem(items, index, delta) {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items;

  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
