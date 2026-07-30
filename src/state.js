/**
 * Persistence and state mutation.
 *
 * ── Storage schema ───────────────────────────────────────────────────────────────────
 *
 * localStorage["progression:v2"]  the training log
 *   {
 *     version: 3,
 *     lastExport: number | null,          // epoch ms of the last JSON export
 *     exercises: [Exercise],              // the user's own exercises — see src/catalog.js
 *     plans:     [Plan],                  // the user's plans — see src/plan.js
 *     entries:   { "<planId>|<week>|<slotId>|<setIndex>": { kg, reps, at? } | { dist, time, at? } },
 *     setCounts: { "<planId>|<week>|<slotId>": number }   // only when != the plan's
 *   }
 *
 * localStorage["progression:ui"]  UI preferences (disposable; losing it loses nothing)
 *   { planId, week, day, locale, backupDismissedAt, installDismissed }
 *
 * Plans and exercises live in the log rather than in preferences for one reason: they are
 * user data, so they belong in the backup file. Preferences only remember *where you were*.
 *
 * `exercises` is read before `plans` on every load, and that order is load-bearing: a slot
 * naming an exercise the state does not list is dropped, and its records go with it.
 *
 * `at` is epoch ms of the last write to that record. It exists so records can be ordered
 * across plans, where week numbers are meaningless — see findPrevious. It is absent on
 * records written before schema 3, which sort below any timestamped record; a timestamp
 * that cannot be real (at or before the epoch, or more than CLOCK_SKEW ahead of now) is
 * dropped on load and leaves the record in exactly that state.
 *
 * The key stays "progression:v2" at schema 3 on purpose: the key names the storage slot,
 * not the schema revision, and renaming it would strand every existing log.
 *
 * ── Records are plan-scoped ──────────────────────────────────────────────────────────
 * Every key starts with a plan id. Mutations never leave the plan they were asked about.
 * The previous-record lookup is the one exception: it prefers the same plan's own earlier
 * weeks, but falls back to the same exercise and set index in another plan so a new block
 * still shows a target to beat — see findPrevious.
 *
 * The whole state is kept self-consistent: an entry whose plan, slot, or week no longer
 * exists is pruned rather than kept as invisible ballast. That is what makes editing a
 * plan safe to reason about — what you see in the app is exactly what is stored.
 */

import {
  ENTRY_FIELDS,
  makeLookup,
  normalizeUserExercises,
  setUserExercises,
} from "./catalog.js";
import {
  MAX_SETS,
  clampSets,
  findPlan,
  findSlot,
  newId,
  normalizePlan,
  planSlots,
  weeksOf,
} from "./plan.js";

export const STATE_KEY = "progression:v2";
export const PREFS_KEY = "progression:ui";

export const STATE_VERSION = 3;

export function entryKey(planId, week, slotId, setIndex) {
  return `${planId}|${week}|${slotId}|${setIndex}`;
}

export function setCountKey(planId, week, slotId) {
  return `${planId}|${week}|${slotId}`;
}

/** A fresh install starts with nothing — the user builds their first plan themselves. */
export function emptyState() {
  return {
    version: STATE_VERSION,
    lastExport: null,
    exercises: [],
    plans: [],
    entries: {},
    setCounts: {},
  };
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const asNumber = (value) => (Number.isFinite(value) ? value : null);

/** Indexes a plan's slots and week range so record keys can be validated in one pass. */
function planIndex(plans) {
  return new Map(
    plans.map((plan) => [
      plan.id,
      {
        weeks: new Set(weeksOf(plan).map(String)),
        slots: new Map(plan.days.flatMap((day) => day.slots.map((slot) => [slot.id, slot]))),
      },
    ]),
  );
}

/** Splits a record key and resolves it against the plans, or null when it fits nowhere. */
function resolveKey(index, key, arity) {
  const parts = String(key).split("|");
  if (parts.length !== arity) return null;

  const [planId, week, slotId, setIndex] = parts;
  const plan = index.get(planId);
  if (!plan || !plan.weeks.has(week)) return null;

  // Set indexes beyond MAX_SETS are unreachable in the UI, so they can only be junk.
  // Ones merely beyond the *current* count are kept: reducing the sets shown must not
  // silently destroy what is behind them.
  if (arity === 4 && !/^\d+$/.test(setIndex)) return null;
  if (arity === 4 && Number(setIndex) >= MAX_SETS) return null;

  const slot = plan.slots.get(slotId);
  return slot ? { slot } : null;
}

/**
 * How far ahead of `now` a stored timestamp is still believed. Device clocks drift and
 * travel across timezones, so a few hours ahead is a real record; a date next year is a
 * hand-edited backup or a machine with its clock set wrong.
 */
const CLOCK_SKEW = 24 * 60 * 60_000;

/**
 * Keeps only the fields this exercise actually logs, and only if something is filled in.
 *
 * `lookup` decides which fields those are, so it is passed in for the same reason
 * normalizePlan takes one: getting it wrong here silently discards a cardio exercise's
 * distance and time as fields it does not log.
 */
function normalizeEntry(raw, slot, now, lookup) {
  if (!isPlainObject(raw)) return null;

  const entry = {};
  let filled = false;
  for (const field of lookup.fields(slot.exerciseId)) {
    entry[field] = asNumber(raw[field]);
    if (entry[field] != null) filled = true;
  }
  if (!filled) return null;

  // Carried after the fill check: a bare timestamp is not a record. Omitted rather than
  // stored as null so records written before schema 3 stay byte-identical — which is also
  // what an unbelievable date degrades to, since the numbers are still worth keeping and
  // every reader already handles a record with no timestamp.
  if (Number.isFinite(raw.at) && raw.at > 0 && raw.at <= now + CLOCK_SKEW) entry.at = raw.at;
  return entry;
}

function normalizePlans(raw, lookup) {
  const plans = (Array.isArray(raw) ? raw : []).map((plan) => normalizePlan(plan, lookup));

  // Two plans sharing an id would share every record keyed under it.
  const seen = new Set();
  return plans.filter((plan) => (seen.has(plan.id) ? false : seen.add(plan.id)));
}

/**
 * Repairs anything read from storage or an imported backup. Never throws: a state too
 * broken to repair comes back empty rather than crashing the app on load.
 *
 * `now` is injected only so the timestamp bound is testable; every caller takes the default.
 */
export function normalizeState(raw, now = Date.now()) {
  if (!isPlainObject(raw) || !isPlainObject(raw.entries)) return emptyState();

  // Before the plans, and the order is the whole point: normalizeSlot drops a slot naming an
  // exercise this lookup does not have, and the entries loop below then prunes its records.
  // Repairing the list afterwards would delete every custom slot on the first load.
  const exercises = normalizeUserExercises(raw.exercises);
  const lookup = makeLookup(exercises);

  const plans = normalizePlans(raw.plans, lookup);
  const index = planIndex(plans);

  const entries = {};
  for (const [key, value] of Object.entries(raw.entries)) {
    const resolved = resolveKey(index, key, 4);
    if (!resolved) continue;
    const entry = normalizeEntry(value, resolved.slot, now, lookup);
    if (entry) entries[key] = entry;
  }

  const setCounts = {};
  const rawCounts = isPlainObject(raw.setCounts) ? raw.setCounts : {};
  for (const [key, value] of Object.entries(rawCounts)) {
    const resolved = resolveKey(index, key, 3);
    if (!resolved || !Number.isFinite(value)) continue;
    // An override equal to the plan's own prescription carries no information.
    const count = clampSets(value);
    if (count !== resolved.slot.sets) setCounts[key] = count;
  }

  return {
    version: STATE_VERSION,
    lastExport: asNumber(raw.lastExport),
    exercises,
    plans,
    entries,
    setCounts,
  };
}

/**
 * Parses the contents of a backup file. Throws on anything that is not a recognisable
 * export, so the caller can tell "bad file" apart from "empty backup".
 */
export function parseBackup(text) {
  const raw = JSON.parse(text);
  if (!isPlainObject(raw) || !isPlainObject(raw.entries) || !Array.isArray(raw.plans)) {
    throw new Error("Not a Progression backup file");
  }
  return normalizeState(raw);
}

export function normalizePrefs(raw) {
  const prefs = isPlainObject(raw) ? raw : {};
  return {
    // Which plan and day these point at is checked at render time, not here — prefs are
    // normalized without knowing the plans, and a stale id simply falls back to the first.
    planId: typeof prefs.planId === "string" ? prefs.planId : null,
    week: Number.isInteger(prefs.week) && prefs.week >= 1 ? prefs.week : 1,
    day: typeof prefs.day === "string" ? prefs.day : null,
    locale: typeof prefs.locale === "string" ? prefs.locale : null,
    backupDismissedAt: typeof prefs.backupDismissedAt === "number" ? prefs.backupDismissedAt : 0,
    installDismissed: prefs.installDismissed === true,
  };
}

export function getEntry(state, planId, week, slotId, setIndex) {
  return state.entries[entryKey(planId, week, slotId, setIndex)] ?? null;
}

/** Current set count for a slot: the user's override, else the plan's prescription. */
export function getSetCount(state, planId, week, slot) {
  const stored = state.setCounts[setCountKey(planId, week, slot.id)];
  return clampSets(Number.isFinite(stored) ? stored : slot.sets);
}

export function entryHasData(entry) {
  return Boolean(entry) && ENTRY_FIELDS.some((field) => entry[field] != null);
}

/**
 * Which of a set's fields a previous record could fill in: it has a number and today's entry
 * does not. `fields` is passed rather than read from ENTRY_FIELDS because which fields a set
 * logs depends on the exercise (see entryFields in src/catalog.js).
 *
 * The exercise-wide fill button acts on exactly these, and the per-set ghost row deliberately
 * does not — tapping one row is precise enough to mean "replace this", while one tap that
 * refilled a whole exercise would discard typed numbers, and nothing in this app can undo it.
 */
export function fillableFields(previous, entry, fields) {
  if (!previous) return [];
  return fields.filter((field) => previous[field] != null && entry?.[field] == null);
}

/**
 * Sort comparator, most recent first: timestamp, then plan order, then week.
 *
 * The two fallbacks are not decoration. Every record written before schema 3 has no
 * timestamp, so on the first upgrade `at` alone would leave a user's whole history in
 * arbitrary order. Plan order (plans are appended as they are created) and week make the
 * comparison total.
 *
 * One tie is accepted rather than resolved: two slots in the same plan, same week, sharing
 * an exercise and set index, both without a timestamp, compare equal and fall back to
 * insertion order. That is only reachable with pre-schema-3 data plus a duplicated exercise
 * placement, and every tiebreaker for it (heavier load, first slot) would be a heuristic
 * this app's doctrine says it should not invent.
 */
function byRecency(a, b) {
  const aAt = a.entry.at ?? -Infinity;
  const bAt = b.entry.at ?? -Infinity;
  if (aAt !== bAt) return bAt - aAt;
  if (a.planOrder !== b.planOrder) return b.planOrder - a.planOrder;
  return b.week - a.week;
}

/**
 * Every logged exercise, indexed by `exerciseId|setIndex` — what lets a new block inherit
 * the target to beat from an older one.
 *
 * Holds one record *per plan* rather than a single winner: the newest record for a lift may
 * well sit in the plan the user is looking at, and findPrevious has to be able to skip past
 * it to the next plan down. The array is one element per plan, so it stays small.
 *
 * A projection, never stored. The store rebuilds it on demand and throws it away on write.
 */
export function newestByExercise(state) {
  const planOrder = new Map(state.plans.map((plan, index) => [plan.id, index]));
  const exerciseOf = new Map(
    state.plans.flatMap((plan) =>
      plan.days.flatMap((day) =>
        day.slots.map((slot) => [`${plan.id}|${slot.id}`, slot.exerciseId]),
      ),
    ),
  );

  const bestPerPlan = new Map();
  for (const [key, entry] of Object.entries(state.entries)) {
    const [planId, week, slotId, setIndex] = key.split("|");
    const exerciseId = exerciseOf.get(`${planId}|${slotId}`);
    if (exerciseId === undefined) continue;

    const candidate = { planId, planOrder: planOrder.get(planId), week: Number(week), entry };
    const indexKey = `${exerciseId}|${setIndex}`;

    let perPlan = bestPerPlan.get(indexKey);
    if (!perPlan) bestPerPlan.set(indexKey, (perPlan = new Map()));

    const held = perPlan.get(planId);
    if (!held || byRecency(candidate, held) < 0) perPlan.set(planId, candidate);
  }

  return new Map(
    [...bestPerPlan].map(([indexKey, perPlan]) => [
      indexKey,
      [...perPlan.values()].sort(byRecency),
    ]),
  );
}

/**
 * The "target to beat".
 *
 * First the slot's own history: the most recent filled record of the same set in an earlier
 * week of the same plan. That is the precise answer and it always wins.
 *
 * Failing that, the same *exercise* at the same set index from any other plan. This is what
 * carries a lift's numbers across a block boundary — without it, week 1 of every new plan
 * shows nothing, which is exactly when knowing the number matters most.
 *
 * Records from the plan being viewed are never offered as the fallback. One plan can place
 * the same exercise twice on purpose (heavy day, light day); those are separate
 * progressions, and crossing them would suggest a target from the wrong kind of work.
 */
export function findPrevious(
  state,
  planId,
  week,
  slotId,
  setIndex,
  index = newestByExercise(state),
) {
  for (let candidate = week - 1; candidate >= 1; candidate--) {
    const entry = getEntry(state, planId, candidate, slotId, setIndex);
    if (entryHasData(entry)) return { source: "plan", week: candidate, ...entry };
  }

  const plan = findPlan(state.plans, planId);
  const slot = plan && findSlot(plan, slotId);
  if (!slot) return null;

  const elsewhere = (index.get(`${slot.exerciseId}|${setIndex}`) ?? []).find(
    (record) => record.planId !== planId,
  );
  return elsewhere ? { source: "other", ...elsewhere.entry } : null;
}

/**
 * How many records a day holds. Scans up to MAX_SETS rather than the current set count so
 * records hidden behind a reduced set count are still counted — and therefore still
 * cleared by clearDay.
 */
export function countDayEntries(state, planId, week, day) {
  return day.slots.reduce(
    (total, slot) => total + countSlotEntries(state, planId, week, slot.id),
    0,
  );
}

/** Records logged for one slot, in one week or — with week null — across every week. */
export function countSlotEntries(state, planId, week, slotId) {
  const prefix = week == null ? `${planId}|` : `${planId}|${week}|`;
  const suffix = `|${slotId}|`;

  return Object.keys(state.entries).filter(
    (key) => key.startsWith(prefix) && key.includes(suffix),
  ).length;
}

/** slotId → dayId for one plan, so a record key can be traced back to the day it sits on. */
function dayOfSlot(plan) {
  return new Map(plan.days.flatMap((day) => day.slots.map((slot) => [slot.id, day.id])));
}

/**
 * Which weeks of a plan hold a record, and which days hold one in a given week.
 *
 * What the header chips are marked from: mid-block the only way to tell a day you have
 * already trained from one you have not is to open it and look.
 *
 * Both read every set index rather than the current set count, so a record hidden behind a
 * reduced stepper still counts — the day was trained either way. Both also ignore a record
 * whose slot the plan no longer has: `normalizeState` prunes those, but if one survives it
 * is invisible in the app, and a mark pointing at nothing you can open would be a lie.
 */
export function loggedWeeks(state, plan) {
  const dayOf = dayOfSlot(plan);
  const weeks = new Set();

  for (const key of Object.keys(state.entries)) {
    const [planId, week, slotId] = key.split("|");
    if (planId === plan.id && dayOf.has(slotId)) weeks.add(Number(week));
  }
  return weeks;
}

export function loggedDays(state, plan, week) {
  const dayOf = dayOfSlot(plan);
  const days = new Set();
  const prefix = `${plan.id}|${week}|`;

  for (const key of Object.keys(state.entries)) {
    if (!key.startsWith(prefix)) continue;
    const dayId = dayOf.get(key.split("|")[2]);
    if (dayId !== undefined) days.add(dayId);
  }
  return days;
}

/**
 * When a day was last trained: the newest `at` across its records, or null.
 *
 * "Week 3, Day 2" says nothing about whether that was Tuesday or in March, which is exactly
 * what you need to know coming back to a block after a break. Records written before schema
 * 3 carry no timestamp, so a day holding only those reads as untimed — the same rule the
 * ghost row's age tag follows, and better than inventing a date.
 *
 * A timestamp ahead of `now` is skipped rather than reported. `normalizeState` bounds what
 * it stores, but a clock that moves backwards mid-session can leave a legitimately written
 * record in the future, and `formatAge` declines to phrase a negative age — so reporting one
 * here would render the caller's label followed by a blank.
 */
export function lastLoggedAt(state, plan, week, day, now = Date.now()) {
  const slots = new Set(day.slots.map((slot) => slot.id));
  const prefix = `${plan.id}|${week}|`;
  let newest = null;

  for (const [key, entry] of Object.entries(state.entries)) {
    if (!key.startsWith(prefix) || !slots.has(key.split("|")[2])) continue;
    if (!Number.isFinite(entry.at) || entry.at > now) continue;
    if (newest === null || entry.at > newest) newest = entry.at;
  }
  return newest;
}

/** Every record belonging to a plan — what deleting it would throw away. */
export function countPlanEntries(state, planId) {
  return Object.keys(state.entries).filter((key) => key.startsWith(`${planId}|`)).length;
}

/**
 * The two totals the import confirmation compares. Records come off the keys rather than by
 * summing countPlanEntries: normalizeState prunes any record that fits nowhere and both sides of
 * that confirm have been through it, so the totals agree with the per-plan counts by
 * construction — which is what the test asserts.
 */
export function summarizeState(state) {
  return { plans: state.plans.length, records: Object.keys(state.entries).length };
}

/**
 * What deleting one of the user's exercises would cost: every slot that places it, the plans
 * those sit in, and the records logged on them. Counted across all weeks, because the slot is
 * removed from the plan itself and not just from the week on screen.
 */
export function countExerciseUse(state, exerciseId) {
  const plans = new Set();
  let slots = 0;
  let records = 0;

  for (const plan of state.plans) {
    for (const slot of planSlots(plan)) {
      if (slot.exerciseId !== exerciseId) continue;
      plans.add(plan.id);
      slots += 1;
      records += countSlotEntries(state, plan.id, null, slot.id);
    }
  }
  return { slots, plans: plans.size, records };
}

/**
 * How many records a revised plan would discard: those whose slot or week it no longer
 * has. The plan editor asks this before saving so a destructive edit is never silent.
 */
export function countOrphans(state, plan) {
  const index = planIndex([plan]);
  return Object.keys(state.entries).filter(
    (key) => key.startsWith(`${plan.id}|`) && !resolveKey(index, key, 4),
  ).length;
}

/** True when any slot in the day has a set count differing from the plan. */
export function hasCustomSetCounts(state, planId, week, day) {
  return day.slots.some((slot) => state.setCounts[setCountKey(planId, week, slot.id)] != null);
}

function readJSON(storage, key) {
  try {
    const raw = storage.getItem(key);
    return raw == null ? null : JSON.parse(raw);
  } catch {
    return null; // Corrupt or unreadable — start clean rather than crash.
  }
}

/**
 * Creates the app store over a Storage-like object (getItem/setItem/removeItem).
 * Tests inject a fake; the browser passes localStorage.
 *
 * Every mutator writes through immediately — the app has no explicit save action.
 */
export function createStore(storage = globalThis.localStorage, { now = () => Date.now() } = {}) {
  let state = normalizeState(readJSON(storage, STATE_KEY));
  let prefs = normalizePrefs(readJSON(storage, PREFS_KEY));

  /** The lookup for the exercises this store holds — what its own plans are judged against. */
  const stateLookup = () => makeLookup(state.exercises);

  setUserExercises(state.exercises);

  function persist(key, value) {
    try {
      storage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // Quota exceeded or storage disabled (Safari private browsing). The in-memory
      // state stays correct for this session; nothing else we can usefully do.
      console.warn("Could not write to storage", error);
    }
  }

  /**
   * The exercise index is derived, so it is cached rather than stored — and dropped in
   * saveState() rather than in each mutator, because every write already funnels through
   * there. A mutator added later cannot forget to invalidate it.
   */
  let exerciseIndex = null;
  const index = () => (exerciseIndex ??= newestByExercise(state));

  const saveState = () => {
    exerciseIndex = null;
    // The views resolve exercises through the registry, so it is refreshed here for the same
    // reason the index is dropped here: every write funnels through this function, and a
    // mutator added later cannot forget to do it.
    setUserExercises(state.exercises);
    persist(STATE_KEY, state);
  };
  const savePrefs = () => persist(PREFS_KEY, prefs);

  function addPlan(plan) {
    const normalized = normalizePlan(plan, stateLookup());
    state.plans = [...state.plans, normalized];
    saveState();
    return normalized;
  }

  /** Drops every record a plan revision no longer has room for. */
  function pruneRecords(plan) {
    const index = planIndex([plan]);
    const owned = (key) => key.startsWith(`${plan.id}|`);

    for (const key of Object.keys(state.entries)) {
      if (owned(key) && !resolveKey(index, key, 4)) delete state.entries[key];
    }
    for (const key of Object.keys(state.setCounts)) {
      if (owned(key) && !resolveKey(index, key, 3)) delete state.setCounts[key];
    }
  }

  return {
    get state() {
      return state;
    },
    get prefs() {
      return prefs;
    },
    get plans() {
      return state.plans;
    },

    findPlan: (planId) => findPlan(state.plans, planId),

    getEntry: (planId, week, slotId, setIndex) =>
      getEntry(state, planId, week, slotId, setIndex),
    getSetCount: (planId, week, slot) => getSetCount(state, planId, week, slot),
    findPrevious: (planId, week, slotId, setIndex) =>
      findPrevious(state, planId, week, slotId, setIndex, index()),

    /** Writes one field of one set. Rows left entirely empty are removed, not stored. */
    setEntryField(planId, week, slotId, setIndex, field, value) {
      const key = entryKey(planId, week, slotId, setIndex);
      const entry = { ...state.entries[key] };
      entry[field] = value;

      if (entryHasData(entry)) {
        entry.at = now();
        state.entries[key] = entry;
      } else {
        delete state.entries[key];
      }
      saveState();
    },

    deleteEntry(planId, week, slotId, setIndex) {
      delete state.entries[entryKey(planId, week, slotId, setIndex)];
      saveState();
    },

    /** Stores a set-count override, or drops it when it matches the plan again. */
    setSetCount(planId, week, slot, count) {
      const key = setCountKey(planId, week, slot.id);
      const next = clampSets(count);
      if (next === slot.sets) delete state.setCounts[key];
      else state.setCounts[key] = next;
      saveState();
    },

    /** Wipes a day's records and returns its set counts to the plan defaults. */
    clearDay(planId, week, day) {
      for (const slot of day.slots) {
        for (const key of Object.keys(state.entries)) {
          if (key.startsWith(`${planId}|${week}|${slot.id}|`)) delete state.entries[key];
        }
        delete state.setCounts[setCountKey(planId, week, slot.id)];
      }
      saveState();
    },

    addPlan,

    /**
     * Adds one of the user's own exercises, or returns null when it has no usable name.
     *
     * The id carries a prefix no catalog slug does, so the two lists can never collide —
     * tests/catalog.test.js holds the catalog to that.
     */
    addExercise({ name, group, kind }) {
      const [exercise] = normalizeUserExercises([{ id: newId("u"), name, group, kind }]);
      if (!exercise) return null;

      state.exercises = [...state.exercises, exercise];
      saveState();
      return exercise;
    },

    /**
     * Renames one. Records are keyed by slot, and a slot names its exercise by id, so this
     * cannot orphan anything — which is why it does not go near the plans.
     */
    renameExercise(exerciseId, name) {
      const trimmed = typeof name === "string" ? name.trim() : "";
      const exercise = state.exercises.find((candidate) => candidate.id === exerciseId);
      if (!exercise || trimmed === "") return false;

      exercise.name = trimmed;
      saveState();
      return true;
    },

    /**
     * Deletes one, along with every slot that placed it and every record on those slots.
     *
     * The cascade is not spelled out here: re-normalizing each plan against a lookup that no
     * longer has the exercise drops exactly the slots that named it, and pruneRecords then
     * uses the same predicate normalizeState does to decide which records are left homeless.
     * countExerciseUse reports the cost beforehand, and agrees because it counts the same
     * slots this removes.
     */
    deleteExercise(exerciseId) {
      if (!state.exercises.some((candidate) => candidate.id === exerciseId)) return false;

      state.exercises = state.exercises.filter((candidate) => candidate.id !== exerciseId);
      const lookup = stateLookup();
      state.plans = state.plans.map((plan) => normalizePlan(plan, lookup));
      for (const plan of state.plans) pruneRecords(plan);

      saveState();
      return true;
    },

    /** Replaces a plan in place, discarding records the revision has no room for. */
    updatePlan(plan) {
      const normalized = normalizePlan(plan, stateLookup());
      const index = state.plans.findIndex((candidate) => candidate.id === normalized.id);
      if (index === -1) return addPlan(plan);

      state.plans[index] = normalized;
      pruneRecords(normalized);
      saveState();
      return normalized;
    },

    /** Copies a plan's structure under fresh ids. Records are not copied — only the plan. */
    duplicatePlan(planId, name) {
      const source = findPlan(state.plans, planId);
      if (!source) return null;

      // Dropping the ids makes normalizePlan mint new ones, so the copy starts with a
      // clean history instead of sharing the original's records.
      return addPlan({
        ...source,
        id: null,
        name,
        nameKey: null,
        days: source.days.map((day) => ({
          ...day,
          id: null,
          slots: day.slots.map((slot) => ({ ...slot, id: null })),
        })),
      });
    },

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

    /** Replaces the whole log — used by backup import. */
    replaceState(next) {
      state = normalizeState(next);
      saveState();
    },

    /** Stamps the export time so the backup-reminder banner can go quiet. */
    markExported(now = Date.now()) {
      state.lastExport = now;
      saveState();
    },

    setPref(key, value) {
      prefs[key] = value;
      savePrefs();
    },
  };
}
