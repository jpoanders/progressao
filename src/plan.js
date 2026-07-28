/**
 * The training plan as pure data: 4 weeks, 4 strength days plus a running session.
 *
 * IMPORTANT: `id` values are frozen. They are used to build the localStorage keys that
 * hold the user's training history (see src/state.js), so they are opaque identifiers,
 * not labels. They stay in Portuguese even though the codebase is English — renaming one
 * orphans every record ever logged for that exercise.
 *
 * All display text lives in src/i18n/<locale>.js under `plan`, keyed by these same ids.
 *
 * `sets`  — the prescribed set count. The user can adjust the actual count per week
 *           (src/state.js), but the scheme shown next to the exercise name always
 *           reflects this prescribed value.
 * `reps`  — [min, max] prescribed rep range, or null for exercises logged without a
 *           rep target (bodyweight work).
 */

export const WEEKS = [1, 2, 3, 4];

export const MIN_SETS = 1;
export const MAX_SETS = 8;

/** Day id for the running session, which has no exercise cards. */
export const RUN_DAY_ID = "run";

export const PLAN = [
  {
    id: "d1",
    exercises: [
      { id: "supino-reto", sets: 3, reps: [6, 8] },
      { id: "supino-inclinado", sets: 3, reps: [8, 10] },
      { id: "desenvolvimento", sets: 3, reps: [6, 8] },
      { id: "crucifixo", sets: 3, reps: [12, 15] },
      { id: "triceps-polia", sets: 3, reps: [10, 12] },
      { id: "elevacao-lateral", sets: 3, reps: [12, 15] },
    ],
  },
  {
    id: "d2",
    exercises: [
      { id: "agachamento", sets: 3, reps: [6, 8] },
      { id: "leg-press", sets: 3, reps: [10, 12] },
      { id: "hack-squat", sets: 3, reps: [10, 12] },
      { id: "panturrilha-pe", sets: 4, reps: [12, 15] },
      { id: "abdominal-d2", sets: 3, reps: null },
    ],
  },
  {
    id: "d3",
    exercises: [
      { id: "barra-fixa", sets: 3, reps: [6, 10] },
      { id: "remada-curvada", sets: 3, reps: [8, 10] },
      { id: "remada-sentada", sets: 3, reps: [10, 12] },
      { id: "face-pull", sets: 3, reps: [12, 15] },
      { id: "rosca-direta", sets: 3, reps: [8, 10] },
      { id: "rosca-martelo", sets: 3, reps: [10, 12] },
    ],
  },
  {
    id: "d4",
    exercises: [
      { id: "terra-romeno", sets: 3, reps: [8, 10] },
      { id: "cadeira-flexora", sets: 3, reps: [10, 12] },
      { id: "cadeira-extensora", sets: 3, reps: [12, 15] },
      { id: "panturrilha-sent", sets: 4, reps: [12, 15] },
      { id: "abdominal-d4", sets: 3, reps: null },
    ],
  },
];

/** Looks up a plan day by id. Returns null for the running day or an unknown id. */
export function findDay(dayId) {
  return PLAN.find((day) => day.id === dayId) ?? null;
}

/** Position of a day in the plan, 1-based, for display ("Day 2"). */
export function dayNumber(dayId) {
  return PLAN.findIndex((day) => day.id === dayId) + 1;
}
