/**
 * Persistence and state mutation.
 *
 * ── Storage schema ───────────────────────────────────────────────────────────────────
 *
 * localStorage["progression:v2"]  the training log
 *   {
 *     version: 3,
 *     lastExport: number | null,          // epoch ms of the last JSON export
 *     plans:     [Plan],                  // the user's plans — see src/plan.js
 *     entries:   { "<planId>|<week>|<slotId>|<setIndex>": { kg, reps, at? } | { dist, time, at? } },
 *     setCounts: { "<planId>|<week>|<slotId>": number }   // only when != the plan's
 *   }
 *
 * localStorage["progression:ui"]  UI preferences (disposable; losing it loses nothing)
 *   { planId, week, day, locale, backupDismissedAt, installDismissed }
 *
 * Plans live in the log rather than in preferences for one reason: they are user data, so
 * they belong in the backup file. Preferences only remember *where you were*.
 *
 * `at` is epoch ms of the last write to that record. It exists so records can be ordered
 * across plans, where week numbers are meaningless — see findPrevious. It is absent on
 * records written before schema 3, which sort below any timestamped record.
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

import { ENTRY_FIELDS, entryFields } from "./catalog.js";
import {
  MAX_SETS,
  clampSets,
  defaultPlan,
  findPlan,
  findSlot,
  normalizePlan,
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

/** A fresh install still needs something to log against, so it starts on the built-in plan. */
export function emptyState() {
  return {
    version: STATE_VERSION,
    lastExport: null,
    plans: [defaultPlan()],
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

/** Keeps only the fields this exercise actually logs, and only if something is filled in. */
function normalizeEntry(raw, slot) {
  if (!isPlainObject(raw)) return null;

  const entry = {};
  let filled = false;
  for (const field of entryFields(slot.exerciseId)) {
    entry[field] = asNumber(raw[field]);
    if (entry[field] != null) filled = true;
  }
  if (!filled) return null;

  // Carried after the fill check: a bare timestamp is not a record. Omitted rather than
  // stored as null so records written before schema 3 stay byte-identical.
  if (Number.isFinite(raw.at)) entry.at = raw.at;
  return entry;
}

function normalizePlans(raw) {
  const plans = (Array.isArray(raw) ? raw : []).map(normalizePlan);

  // Two plans sharing an id would share every record keyed under it.
  const seen = new Set();
  const unique = plans.filter((plan) => (seen.has(plan.id) ? false : seen.add(plan.id)));

  return unique.length > 0 ? unique : [defaultPlan()];
}

/**
 * Repairs anything read from storage or an imported backup. Never throws: a state too
 * broken to repair comes back empty rather than crashing the app on load.
 */
export function normalizeState(raw) {
  if (!isPlainObject(raw) || !isPlainObject(raw.entries)) return emptyState();

  const plans = normalizePlans(raw.plans);
  const index = planIndex(plans);

  const entries = {};
  for (const [key, value] of Object.entries(raw.entries)) {
    const resolved = resolveKey(index, key, 4);
    if (!resolved) continue;
    const entry = normalizeEntry(value, resolved.slot);
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
 * Sort comparator, most recent first: timestamp, then plan order, then week.
 *
 * The two fallbacks are not decoration. Every record written before schema 3 has no
 * timestamp, so on the first upgrade `at` alone would leave a user's whole history in
 * arbitrary order. Plan order (plans are appended as they are created) and week make the
 * comparison total.
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

/** Every record belonging to a plan — what deleting it would throw away. */
export function countPlanEntries(state, planId) {
  return Object.keys(state.entries).filter((key) => key.startsWith(`${planId}|`)).length;
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
    persist(STATE_KEY, state);
  };
  const savePrefs = () => persist(PREFS_KEY, prefs);

  function addPlan(plan) {
    const normalized = normalizePlan(plan);
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

    /** Replaces a plan in place, discarding records the revision has no room for. */
    updatePlan(plan) {
      const normalized = normalizePlan(plan);
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

    /** Deletes a plan and every record logged under it. The last plan cannot be deleted. */
    deletePlan(planId) {
      if (state.plans.length <= 1) return false;

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
