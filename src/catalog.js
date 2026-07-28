/**
 * The exercise catalog: everything a plan can be built out of.
 *
 * Hardcoded for now. User-defined exercises are the planned next step, which is why
 * nothing outside this module indexes CATALOG directly — callers go through
 * findExercise/byGroup/entryFields, so a user-backed store can slide in behind them
 * without touching the views.
 *
 * `id`     — a stable slug written into every plan the user builds. Renaming one breaks
 *            the plans that reference it, so treat additions as cheap and renames as not.
 * `group`  — how the picker organises the list; also the i18n key under `catalog.groups`.
 * `kind`   — decides which fields a set logs (see entryFields) and how the previous-record
 *            hint reads. Strength work logs load and reps; cardio logs distance and time.
 * `sets`   — what the plan editor pre-fills when the exercise is added to a day.
 * `reps`   — pre-filled [min, max] rep range, or null for work logged without a rep
 *            target (planks, and anything cardio).
 */

/** Group order, which is also the order the picker lists them in. */
export const GROUPS = ["chest", "back", "legs", "shoulders", "arms", "core", "cardio"];

/** Fields a set stores, per exercise kind. */
const FIELDS_BY_KIND = {
  strength: ["kg", "reps"],
  cardio: ["dist", "time"],
};

/** Every field name any entry can hold — the union of FIELDS_BY_KIND. */
export const ENTRY_FIELDS = ["kg", "reps", "dist", "time"];

/** Fields that hold whole numbers; the rest keep a decimal. */
export const INTEGER_FIELDS = new Set(["reps"]);

export const CATALOG = [
  { id: "bench-press", group: "chest", kind: "strength", sets: 3, reps: [6, 8] },
  { id: "incline-dumbbell-press", group: "chest", kind: "strength", sets: 3, reps: [8, 10] },
  { id: "chest-fly", group: "chest", kind: "strength", sets: 3, reps: [12, 15] },

  { id: "pull-up", group: "back", kind: "strength", sets: 3, reps: [6, 10] },
  { id: "bent-over-row", group: "back", kind: "strength", sets: 3, reps: [8, 10] },
  { id: "seated-row", group: "back", kind: "strength", sets: 3, reps: [10, 12] },

  { id: "back-squat", group: "legs", kind: "strength", sets: 3, reps: [6, 8] },
  { id: "leg-press", group: "legs", kind: "strength", sets: 3, reps: [10, 12] },
  { id: "hack-squat", group: "legs", kind: "strength", sets: 3, reps: [10, 12] },
  { id: "romanian-deadlift", group: "legs", kind: "strength", sets: 3, reps: [8, 10] },
  { id: "leg-curl", group: "legs", kind: "strength", sets: 3, reps: [10, 12] },
  { id: "leg-extension", group: "legs", kind: "strength", sets: 3, reps: [12, 15] },
  { id: "standing-calf-raise", group: "legs", kind: "strength", sets: 4, reps: [12, 15] },
  { id: "seated-calf-raise", group: "legs", kind: "strength", sets: 4, reps: [12, 15] },

  { id: "shoulder-press", group: "shoulders", kind: "strength", sets: 3, reps: [6, 8] },
  { id: "lateral-raise", group: "shoulders", kind: "strength", sets: 3, reps: [12, 15] },
  { id: "face-pull", group: "shoulders", kind: "strength", sets: 3, reps: [12, 15] },

  { id: "triceps-pushdown", group: "arms", kind: "strength", sets: 3, reps: [10, 12] },
  { id: "barbell-curl", group: "arms", kind: "strength", sets: 3, reps: [8, 10] },
  { id: "hammer-curl", group: "arms", kind: "strength", sets: 3, reps: [10, 12] },

  { id: "abs", group: "core", kind: "strength", sets: 3, reps: null },

  { id: "walk-run", group: "cardio", kind: "cardio", sets: 1, reps: null },
];

const BY_ID = new Map(CATALOG.map((exercise) => [exercise.id, exercise]));

/** The catalog entry for an id, or null when a plan references something unknown. */
export function findExercise(exerciseId) {
  return BY_ID.get(exerciseId) ?? null;
}

export function isKnownExercise(exerciseId) {
  return BY_ID.has(exerciseId);
}

/** [{ group, exercises }] in GROUPS order — the shape the picker renders. */
export function byGroup() {
  return GROUPS.map((group) => ({
    group,
    exercises: CATALOG.filter((exercise) => exercise.group === group),
  })).filter(({ exercises }) => exercises.length > 0);
}

/**
 * Which fields a set of this exercise logs. Unknown exercises fall back to strength so a
 * plan referencing a removed id still renders something usable instead of blowing up.
 */
export function entryFields(exerciseId) {
  const exercise = findExercise(exerciseId);
  return FIELDS_BY_KIND[exercise?.kind ?? "strength"] ?? FIELDS_BY_KIND.strength;
}

export function exerciseKind(exerciseId) {
  return findExercise(exerciseId)?.kind ?? "strength";
}
