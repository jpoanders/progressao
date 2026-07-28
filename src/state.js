/**
 * Persistence and state mutation.
 *
 * ── Storage schema (FROZEN — do not rename anything in this block) ───────────────────
 *
 * localStorage["progressao:v1"]  the training log
 *   {
 *     version: 1,
 *     lastExport: number | null,          // epoch ms of the last JSON export
 *     entries:   { "<week>|<dayId>|<exerciseId>|<setIndex>": { kg, reps } },
 *     setCounts: { "<week>|<dayId>|<exerciseId>": number },   // only when != plan default
 *     runs:      { "<week>": { dist, time, cycles } }
 *   }
 *
 * localStorage["progressao:ui"]  UI preferences (disposable; losing it loses nothing)
 *   { week, day, locale, backupDismissedAt, installDismissed }
 *
 * The storage keys and every id inside them (`d1`..`d4`, `supino-reto`, the `dist`/`time`/
 * `cycles` field names) are Portuguese-derived but are treated as opaque identifiers, not
 * as prose. They predate this refactor and exist on users' devices; renaming any of them
 * would orphan real training history and break every backup file already exported. The
 * user-facing English/Portuguese text is resolved from these ids at render time via
 * src/i18n. Only ever add fields here — never rename or repurpose one.
 * ─────────────────────────────────────────────────────────────────────────────────────
 */

import { MAX_SETS, MIN_SETS, PLAN, WEEKS } from "./plan.js";

export const STATE_KEY = "progressao:v1";
export const PREFS_KEY = "progressao:ui";
export const STATE_VERSION = 1;

/** Fields of a running session, in display order. */
export const RUN_FIELDS = ["dist", "time", "cycles"];

export function entryKey(week, dayId, exerciseId, setIndex) {
  return `${week}|${dayId}|${exerciseId}|${setIndex}`;
}

export function setCountKey(week, dayId, exerciseId) {
  return `${week}|${dayId}|${exerciseId}`;
}

export function emptyState() {
  return { version: STATE_VERSION, lastExport: null, entries: {}, setCounts: {}, runs: {} };
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Coerces anything parsed from storage or a backup file into a valid state object.
 * Anything unrecognisable degrades to an empty state rather than throwing, so a corrupt
 * blob can never brick the app.
 */
export function normalizeState(raw) {
  if (!isPlainObject(raw) || !isPlainObject(raw.entries)) return emptyState();
  return {
    version: STATE_VERSION,
    lastExport: typeof raw.lastExport === "number" ? raw.lastExport : null,
    entries: raw.entries,
    setCounts: isPlainObject(raw.setCounts) ? raw.setCounts : {},
    runs: isPlainObject(raw.runs) ? raw.runs : {},
  };
}

/**
 * Parses the contents of a backup file. Throws on anything that is not a recognisable
 * export, so the caller can tell "bad file" apart from "empty backup".
 * Accepts files written by any version of the app — the shape has never changed.
 */
export function parseBackup(text) {
  const raw = JSON.parse(text);
  if (!isPlainObject(raw) || !isPlainObject(raw.entries)) {
    throw new Error("Not a Progression backup file");
  }
  return normalizeState(raw);
}

export function normalizePrefs(raw) {
  const prefs = isPlainObject(raw) ? raw : {};
  return {
    week: WEEKS.includes(prefs.week) ? prefs.week : WEEKS[0],
    day: typeof prefs.day === "string" ? prefs.day : PLAN[0].id,
    locale: typeof prefs.locale === "string" ? prefs.locale : null,
    backupDismissedAt: typeof prefs.backupDismissedAt === "number" ? prefs.backupDismissedAt : 0,
    installDismissed: prefs.installDismissed === true,
  };
}

export function clampSetCount(count) {
  return Math.min(MAX_SETS, Math.max(MIN_SETS, count));
}

export function getEntry(state, week, dayId, exerciseId, setIndex) {
  return state.entries[entryKey(week, dayId, exerciseId, setIndex)] ?? null;
}

/** Current set count for an exercise: the user's override, else the plan's prescription. */
export function getSetCount(state, week, dayId, exercise) {
  const stored = state.setCounts[setCountKey(week, dayId, exercise.id)];
  return clampSetCount(Number.isFinite(stored) ? stored : exercise.sets);
}

/**
 * The "target to beat": the most recent filled record of the same exercise and set in an
 * earlier week. Walks backwards so a skipped week falls through to the one before it.
 */
export function findPrevious(state, week, dayId, exerciseId, setIndex) {
  for (let candidate = week - 1; candidate >= 1; candidate--) {
    const entry = getEntry(state, candidate, dayId, exerciseId, setIndex);
    if (entry && (entry.kg != null || entry.reps != null)) return { week: candidate, ...entry };
  }
  return null;
}

export function runHasData(run) {
  return Boolean(run) && RUN_FIELDS.some((field) => run[field] != null);
}

export function getRun(state, week) {
  return state.runs[week] ?? null;
}

/** Same idea as findPrevious, for the once-per-week running session. */
export function findPreviousRun(state, week) {
  for (let candidate = week - 1; candidate >= 1; candidate--) {
    const run = getRun(state, candidate);
    if (runHasData(run)) return { week: candidate, ...run };
  }
  return null;
}

/**
 * How many records a day holds. Scans up to MAX_SETS rather than the current set count so
 * records hidden behind a reduced set count (possible via an imported backup) are still
 * counted — and therefore still cleared by clearDay.
 */
export function countDayEntries(state, week, day) {
  let total = 0;
  for (const exercise of day.exercises) {
    for (let setIndex = 0; setIndex < MAX_SETS; setIndex++) {
      if (getEntry(state, week, day.id, exercise.id, setIndex)) total++;
    }
  }
  return total;
}

/** True when any exercise in the day has a set count differing from the plan. */
export function hasCustomSetCounts(state, week, day) {
  return day.exercises.some(
    (exercise) => state.setCounts[setCountKey(week, day.id, exercise.id)] != null,
  );
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
 * Creates the app store over a Storage-like object (anything with getItem/setItem).
 * Tests inject a fake; the browser passes localStorage.
 *
 * Every mutator writes through immediately — the app has no explicit save action.
 */
export function createStore(storage = globalThis.localStorage) {
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

  const saveState = () => persist(STATE_KEY, state);
  const savePrefs = () => persist(PREFS_KEY, prefs);

  return {
    get state() {
      return state;
    },
    get prefs() {
      return prefs;
    },

    getEntry: (week, dayId, exerciseId, setIndex) =>
      getEntry(state, week, dayId, exerciseId, setIndex),
    getRun: (week) => getRun(state, week),
    getSetCount: (week, dayId, exercise) => getSetCount(state, week, dayId, exercise),
    findPrevious: (week, dayId, exerciseId, setIndex) =>
      findPrevious(state, week, dayId, exerciseId, setIndex),
    findPreviousRun: (week) => findPreviousRun(state, week),

    /** Writes one field of one set. Rows left entirely empty are removed, not stored. */
    setEntryField(week, dayId, exerciseId, setIndex, field, value) {
      const key = entryKey(week, dayId, exerciseId, setIndex);
      const entry = state.entries[key] ?? { kg: null, reps: null };
      entry[field] = value;
      if (entry.kg == null && entry.reps == null) delete state.entries[key];
      else state.entries[key] = entry;
      saveState();
    },

    deleteEntry(week, dayId, exerciseId, setIndex) {
      delete state.entries[entryKey(week, dayId, exerciseId, setIndex)];
      saveState();
    },

    /** Writes one field of a week's run. An entirely empty run is removed, not stored. */
    setRunField(week, field, value) {
      const run = state.runs[week] ?? { dist: null, time: null, cycles: null };
      run[field] = value;
      if (runHasData(run)) state.runs[week] = run;
      else delete state.runs[week];
      saveState();
    },

    deleteRun(week) {
      delete state.runs[week];
      saveState();
    },

    /** Stores a set-count override, or drops it when it matches the plan again. */
    setSetCount(week, dayId, exercise, count) {
      const key = setCountKey(week, dayId, exercise.id);
      const next = clampSetCount(count);
      if (next === exercise.sets) delete state.setCounts[key];
      else state.setCounts[key] = next;
      saveState();
    },

    /** Wipes a day's records and returns its set counts to the plan defaults. */
    clearDay(week, day) {
      for (const exercise of day.exercises) {
        for (let setIndex = 0; setIndex < MAX_SETS; setIndex++) {
          delete state.entries[entryKey(week, day.id, exercise.id, setIndex)];
        }
        delete state.setCounts[setCountKey(week, day.id, exercise.id)];
      }
      saveState();
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
