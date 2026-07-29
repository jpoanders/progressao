/**
 * The exercise catalog: everything a plan can be built out of.
 *
 * Two sources, one lookup. CATALOG below is the shipped list; the user's own exercises live
 * in the training log (see src/state.js) and arrive here through makeLookup. Nothing outside
 * this module indexes CATALOG directly — callers go through findExercise/byGroup/entryFields
 * — which is what let the second source slide in behind them without touching the views.
 *
 * A user exercise is shape-compatible with a CATALOG entry on purpose: findExercise returns
 * either, and src/plan.js reads `.sets` off the result without a guard. The only difference
 * is `name`, which a user entry carries because no locale can translate it.
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

import { t } from "./i18n/index.js";

/** Group order, which is also the order the picker lists them in. */
export const GROUPS = ["chest", "back", "legs", "shoulders", "arms", "core", "cardio"];

/** Fields a set stores, per exercise kind. */
const FIELDS_BY_KIND = {
  strength: ["kg", "reps"],
  cardio: ["dist", "time"],
};

/**
 * The kinds a user may pick from — every kind the log screen has fields and strings for.
 *
 * A third one is not a matter of adding it here: it needs new ENTRY_FIELDS members,
 * INTEGER_FIELDS handling, and exercise.columns/pair/fields keys in every locale.
 * tests/i18n.test.js fails if that is ever forgotten.
 */
export const USER_KINDS = Object.keys(FIELDS_BY_KIND);

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

/**
 * A resolver over the catalog plus one specific list of user exercises.
 *
 * Handed as an explicit argument to everything that can *delete* data — normalizeState and
 * the plan normalizers, which drop a slot whose exercise they cannot find. Those callers
 * have to judge against the list that arrived with the state they are repairing rather than
 * whatever this module happens to be holding: parseBackup normalizes a candidate file before
 * the user has agreed to import it, and cancelling would otherwise leave the wrong list in
 * place. Making the list an argument means the order cannot be got wrong — there is no way
 * to call these without saying which exercises exist.
 *
 * The read path uses the registry below instead. See it for why the two differ.
 */
export function makeLookup(userExercises = []) {
  const list = Array.isArray(userExercises) ? userExercises : [];
  const byId = new Map(list.map((exercise) => [exercise.id, exercise]));

  // The catalog wins a collision, so a hand-edited file cannot shadow a shipped exercise.
  const find = (exerciseId) => BY_ID.get(exerciseId) ?? byId.get(exerciseId) ?? null;
  const kind = (exerciseId) => find(exerciseId)?.kind ?? "strength";

  return {
    find,
    kind,
    isKnown: (exerciseId) => BY_ID.has(exerciseId) || byId.has(exerciseId),

    /**
     * Which fields a set of this exercise logs. Unknown exercises fall back to strength so
     * a plan referencing a removed id still renders something usable instead of blowing up.
     */
    fields: (exerciseId) => FIELDS_BY_KIND[kind(exerciseId)] ?? FIELDS_BY_KIND.strength,

    /** [{ group, exercises }] in GROUPS order — the shape the picker renders. */
    byGroup: () =>
      GROUPS.map((group) => ({
        group,
        exercises: [
          ...CATALOG.filter((exercise) => exercise.group === group),
          ...list.filter((exercise) => exercise.group === group),
        ],
      })).filter(({ exercises }) => exercises.length > 0),
  };
}

/**
 * The read path: what views, labels and the picker resolve through.
 *
 * A module-level registry rather than an argument, for the same reason t() reads the active
 * locale instead of taking one — threading a lookup down to slotName and every leaf of the
 * day view would touch every view for no gain. The store installs it on construction and on
 * every write, so it cannot be wrong for longer than one write, and nothing reading it can
 * delete anything. Everything that *can* delete takes makeLookup's result explicitly.
 */
let active = makeLookup();
let installed = [];

export function setUserExercises(exercises) {
  installed = Array.isArray(exercises) ? exercises : [];
  active = makeLookup(installed);
}

/** The installed list, for the screen that manages it. */
export function userExercises() {
  return installed;
}

export function findExercise(exerciseId) {
  return active.find(exerciseId);
}

export function isKnownExercise(exerciseId) {
  return active.isKnown(exerciseId);
}

export function entryFields(exerciseId) {
  return active.fields(exerciseId);
}

export function exerciseKind(exerciseId) {
  return active.kind(exerciseId);
}

export function byGroup() {
  return active.byGroup();
}

/**
 * What to call an exercise. A shipped one has a translated name filed under its id; a
 * user-defined one carries the name its owner typed, which no locale knows — looking that
 * one up would render the literal key, since t() returns the key it could not find.
 */
export function exerciseLabel(exerciseId) {
  return active.find(exerciseId)?.name || t(`catalog.exercises.${exerciseId}`);
}

const isPlainObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Sets a user exercise pre-fills a new slot with, matching most of the catalog. */
const DEFAULT_SETS = 3;

/**
 * Repairs the user's exercise list read from storage or an imported backup. Never throws.
 *
 * Only two things get an entry dropped: no id, since records resolve through it, and no
 * name, the one field with no sensible default. Everything else is repaired — a bad group
 * would otherwise cost the user their slots and every record on them, which is far too high
 * a price for a slug only a hand-edited file could get wrong.
 */
export function normalizeUserExercises(raw) {
  const seen = new Set();
  const exercises = [];

  for (const candidate of Array.isArray(raw) ? raw : []) {
    if (!isPlainObject(candidate)) continue;

    const id = typeof candidate.id === "string" ? candidate.id : "";
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    // A shadowing id is dropped rather than repaired: the lookup prefers the catalog, so any
    // slot using it still resolves, and keeping this would only add an unreachable row.
    if (id === "" || name === "" || seen.has(id) || BY_ID.has(id)) continue;
    seen.add(id);

    exercises.push({
      id,
      name,
      group: GROUPS.includes(candidate.group) ? candidate.group : GROUPS[0],
      kind: USER_KINDS.includes(candidate.kind) ? candidate.kind : "strength",
      sets: DEFAULT_SETS,
      reps: null,
    });
  }
  return exercises;
}
