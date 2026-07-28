/**
 * English strings.
 *
 * This is the reference locale: `t()` falls back here for any key a translation is
 * missing, and tests assert every other locale mirrors this key structure exactly.
 * Keys under `plan` are the frozen exercise/day ids from src/plan.js.
 */

const ORDINAL_SUFFIX = { one: "st", two: "nd", few: "rd", other: "th" };
const ordinalRules = new Intl.PluralRules("en", { type: "ordinal" });

export default {
  tag: "en",
  label: "English",
  ordinal: (n) => `${n}${ORDINAL_SUFFIX[ordinalRules.select(n)] ?? "th"}`,

  strings: {
    app: {
      name: "Progression",
      description: "Strength training log — aimed at beating your previous load.",
      footer: "{app} · data saved locally on this device",
    },

    header: {
      week: "Week",
      day: "Day",
      weekChip: "W{n}",
      dayChip: "Day {n}",
      runChip: "Run",
      context: "Week {week}",
      contextRun: "Week {week} · Run",
    },

    units: {
      kg: "kg",
      missing: "—",
    },

    exercise: {
      scheme: "{sets}×{min}-{max}",
      setCount: { one: "{n} set", other: "{n} sets" },
      weightPlaceholder: "kg",
      repsPlaceholder: "reps",
      weightAria: "weight, set {set}",
      repsAria: "reps, set {set}",
      copy: "copy",
      copyAria: "Copy previous values for set {set}",
      previous: "↳ last time (W{week}): {weight} × {reps}",
      previousEmpty: "↳ no previous record",
      addSetAria: "Add a set to {exercise}",
      removeSetAria: "Remove a set from {exercise}",
      removeSetConfirm:
        "Set {set} of “{exercise}” has data that will be deleted. Remove it anyway?",
    },

    day: {
      clear: "Clear this day (Week {week})",
      clearEmpty: "This day is already empty.",
      clearConfirm: {
        one: "Clear Week {week}, {day}? This deletes {n} record and resets the sets to the plan default. This cannot be undone.",
        other:
          "Clear Week {week}, {day}? This deletes {n} records and resets the sets to the plan default. This cannot be undone.",
      },
    },

    run: {
      title: "Running — progressive walk-run",
      protocol: "{protocol} · {reps}",
      totalNote: "Approximate total: {total}",
      weekItem: "Week {week}: {protocol}, {reps}",
      weekItemTotal: "Week {week}: {protocol}, {reps} ({total})",
      logTitle: "This run",
      target: "target {reps}",
      fieldAria: "{field} for this run",
      previous: "↳ last time (W{week}): {values}",
      previousEmpty: "↳ no previous run",
      copyAria: "Copy values from the previous run",
      clear: "Clear run (Week {week})",
      clearEmpty: "This run is already empty.",
      clearConfirm: "Clear the run record for Week {week}? This cannot be undone.",
      fields: {
        dist: { label: "Distance", unit: "km", placeholder: "km" },
        time: { label: "Time", unit: "min", placeholder: "min" },
        cycles: { label: "Cycles done", unit: "", placeholder: "cycles" },
      },
      valueDist: "{value} km",
      valueTime: "{value} min",
      valueCycles: { one: "{n} cycle", other: "{n} cycles" },
    },

    tools: {
      title: "Backup",
      export: "Export JSON",
      import: "Import JSON",
      lastBackup: "Last backup: {when}",
      importConfirm: "Importing will REPLACE all current progress. Continue?",
      importDone: "Progress imported successfully.",
      importInvalid: "Invalid file. Choose a JSON backup exported by {app}.",
      readError: "Could not read the file.",
    },

    settings: {
      title: "Settings",
      language: "Language",
    },

    banner: {
      backupTitle: "Back up your data",
      backupBody: "Export your progress as JSON every now and then.",
      backupAction: "Export",
      dismissAria: "Dismiss",
      installTitle: "Add to Home Screen",
      installBody:
        "Safari → Share → “Add to Home Screen”. It opens full screen and protects your data.",
    },

    plan: {
      days: {
        d1: "Day 1 — Chest + upper body",
        d2: "Day 2 — Legs (quads)",
        d3: "Day 3 — Back + upper body",
        d4: "Day 4 — Legs (hamstrings)",
      },
      exercises: {
        "supino-reto": "Flat bench press (barbell or dumbbells)",
        "supino-inclinado": "Incline dumbbell press",
        desenvolvimento: "Dumbbell shoulder press",
        crucifixo: "Chest fly or cable crossover",
        "triceps-polia": "Cable triceps pushdown",
        "elevacao-lateral": "Lateral raise",
        agachamento: "Back squat",
        "leg-press": "Leg press",
        "hack-squat": "Hack squat",
        "panturrilha-pe": "Standing calf raise",
        "abdominal-d2": "Abs (plank / leg raise)",
        "barra-fixa": "Pull-up or lat pulldown",
        "remada-curvada": "Bent-over row (barbell/dumbbell)",
        "remada-sentada": "Seated cable row",
        "face-pull": "Face pull",
        "rosca-direta": "Barbell curl",
        "rosca-martelo": "Hammer curl",
        "terra-romeno": "Romanian deadlift",
        "cadeira-flexora": "Lying leg curl",
        "cadeira-extensora": "Leg extension",
        "panturrilha-sent": "Seated calf raise",
        "abdominal-d4": "Abs",
      },
      running: {
        1: { protocol: "1 min easy jog / 2 min walk", reps: "6–8×", total: "~20 min" },
        2: { protocol: "2 min run / 1 min walk", reps: "6–7×", total: "" },
        3: { protocol: "3 min run / 1 min walk", reps: "5–6×", total: "" },
        4: { protocol: "5 min run / 1 min walk", reps: "4×", total: "" },
      },
    },
  },
};
