/**
 * Did this set beat the one it is chasing?
 *
 * The app's whole premise is beating the previous load, so the comparison lives here as
 * pure logic rather than inside the view that draws the badge.
 *
 * Deliberately not progression maths (see the end of README.md): no projections, no volume
 * totals, no deload rules. This subtracts two numbers that are both already on screen, and
 * only ever reports a gain — going down is not commentary the app makes.
 */

import { exerciseKind } from "./catalog.js";

const gained = (field, previous, current) =>
  previous != null && current != null && current > previous
    ? { field, delta: current - previous }
    : null;

/**
 * `{ field, delta }` for the single most meaningful improvement, or null.
 *
 * Strength reads weight first and only falls back to reps when the weight is unchanged:
 * more reps at a lighter load is not a gain, and reporting both at once would need a rule
 * for ranking them that the app has no business inventing.
 *
 * Cardio compares distance alone. Faster is better only over the same distance, and
 * deciding that is exactly the judgement this app leaves to the person doing the training.
 */
export function setGain(previous, current, exerciseId) {
  if (!previous || !current) return null;

  if (exerciseKind(exerciseId) === "cardio") {
    return gained("dist", previous.dist, current.dist);
  }

  const heavier = gained("kg", previous.kg, current.kg);
  if (heavier) return heavier;

  const sameLoad = previous.kg != null && previous.kg === current.kg;
  return sameLoad ? gained("reps", previous.reps, current.reps) : null;
}
