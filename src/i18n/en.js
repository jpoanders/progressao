/**
 * English strings.
 *
 * This is the reference locale: `t()` falls back here for any key a translation is
 * missing, and tests assert every other locale mirrors this key structure exactly.
 *
 * `catalog.exercises` is keyed by the exercise ids in src/catalog.js.
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
      // The chips are terse on screen and spoken in full: "W3" reads as nothing useful.
      weekAria: "Week {n}",
      chipLogged: "{label}, logged",
      context: "Week {week}",
      contextPlans: "Plans",
      contextEditor: "Editing plan",
      contextExercises: "My exercises",
    },

    units: {
      kg: "kg",
      km: "km",
      min: "min",
      missing: "—",
    },

    exercise: {
      scheme: "{sets}×{min}-{max}",
      setCount: { one: "{n} set", other: "{n} sets" },
      // Column headings above the sets. Separate from fields.*.placeholder, which is now
      // empty: the heading labels the column once instead of every box repeating itself.
      columns: {
        kg: "kg",
        reps: "reps",
        dist: "km",
        time: "min",
      },
      // The glyph between the two logged values. Not language, but it sits in the view, so
      // it goes through t() like everything else there.
      pair: {
        strength: "×",
        cardio: "·",
      },
      weekTag: "w{n}",
      useLastStrength: "Use week {week}: {kg} × {reps}, set {set}",
      useLastCardio: "Use week {week}: {dist} · {time}, set {set}",
      // The block a record came from is not named: the tag beside it already says how long
      // ago, and a plan name would not fit the row.
      useOlderStrength: "Use {kg} × {reps} from an earlier block, set {set}",
      useOlderCardio: "Use {dist} · {time} from an earlier block, set {set}",
      previousEmpty: "No record yet for set {set}",
      // All three take {n} — the plural entry needs that name, and one name keeps the
      // caller from having to know which field it is looking up.
      gain: {
        kg: "+{n} kg",
        dist: "+{n} km",
        reps: { one: "+{n} rep", other: "+{n} reps" },
      },
      // Names no week: the numbers it copies can come from an earlier block, which is why the
      // ghost row needs both useLast* and useOlder* and this button needs neither.
      fillSets: "Fill sets",
      fillSetsAria: "Fill the empty sets of {exercise} with the previous numbers",
      addSetAria: "Add a set to {exercise}",
      removeSetAria: "Remove a set from {exercise}",
      removeSetConfirm:
        "Set {set} of “{exercise}” has data that will be deleted. Remove it anyway?",
      fields: {
        kg: { placeholder: "", aria: "weight, set {set}" },
        reps: { placeholder: "", aria: "reps, set {set}" },
        dist: { placeholder: "", aria: "distance, set {set}" },
        time: { placeholder: "", aria: "time, set {set}" },
      },
    },

    day: {
      empty: "No exercises on this day yet.",
      // Names the day, not the plan: it opens the editor on this day's card.
      editDay: "Edit this day",
      clear: "Clear this day's log",
      lastLogged: "Last logged {when}",
      clearEmpty: "This day is already empty.",
      clearConfirm: {
        one: "Clear Week {week}, {day}? This deletes {n} record and resets the sets to the plan default. This cannot be undone.",
        other:
          "Clear Week {week}, {day}? This deletes {n} records and resets the sets to the plan default. This cannot be undone.",
      },
    },

    exercises: {
      title: "My exercises",
      back: "Back",
      manage: "Manage exercises",
      toolsNote: "Add anything the catalogue does not already have.",
      createTitle: "New exercise",
      create: "Create exercise",
      namePlaceholder: "e.g. Sled push",
      nameAria: "Name of the new exercise",
      groupAria: "Muscle group",
      kindAria: "What a set of it records",
      // Named after what you type into a set rather than "strength" or "cardio", because
      // that is the part you actually meet on the log screen.
      kind: {
        strength: "Weight and reps",
        cardio: "Distance and time",
      },
      mine: "Your exercises",
      empty: "None yet — create one above.",
      renameAria: "Rename {exercise}",
      remove: "Delete",
      nameRequired: "Give the exercise a name first.",
      removeConfirmUnused: "Delete “{exercise}”? No plan uses it.",
      removeConfirm: {
        one: "“{exercise}” is on {slots} day(s) across {plans} plan(s) and has {n} logged record. Deleting it removes those too. This cannot be undone.",
        other: "“{exercise}” is on {slots} day(s) across {plans} plan(s) and has {n} logged records. Deleting it removes those too. This cannot be undone.",
      },
    },
    plans: {
      title: "Plans",
      empty: "No plans yet — create one to start logging.",
      manage: "Manage plans",
      inUse: "In use",
      use: "Use",
      edit: "Edit",
      duplicate: "Duplicate",
      remove: "Delete",
      create: "New plan",
      newName: "New plan",
      copyName: "{name} (copy)",
      untitled: "Untitled plan",
      planCount: { one: "{n} plan", other: "{n} plans" },
      weekCount: { one: "{n} week", other: "{n} weeks" },
      dayCount: { one: "{n} day", other: "{n} days" },
      recordCount: { one: "{n} record", other: "{n} records" },
      noRecords: "no records yet",
      back: "Back to training",
      removeConfirm: {
        one: "Delete “{plan}”? This also deletes {n} logged record. This cannot be undone.",
        other: "Delete “{plan}”? This also deletes {n} logged records. This cannot be undone.",
      },
      removeConfirmEmpty: "Delete “{plan}”? This cannot be undone.",
    },

    planEditor: {
      title: "Edit plan",
      done: "Done",
      nameLabel: "Plan name",
      namePlaceholder: "e.g. Autumn hypertrophy block",
      weeksLabel: "Weeks",
      addWeekAria: "Add a week",
      removeWeekAria: "Remove a week",
      daysLabel: "Days",
      addDay: "Add day",
      dayNamePlaceholder: "e.g. Chest + upper body",
      dayNameAria: "Name of day {n}",
      moveUpAria: "Move {item} up",
      moveDownAria: "Move {item} down",
      removeDayAria: "Remove {item}",
      removeSlotAria: "Remove {item}",
      emptyDay: "No exercises on this day yet.",
      addExercise: "Add exercise",
      filterPlaceholder: "Type to narrow the list",
      filterAria: "Filter exercises",
      noMatches: "No exercise matches that.",
      closePicker: "Close the exercise list",
      repsLabel: "Reps",
      repsMinAria: "Minimum reps for {exercise}",
      repsMaxAria: "Maximum reps for {exercise}",
      dropRecordsConfirm: {
        one: "This change discards {n} logged record. Continue?",
        other: "This change discards {n} logged records. Continue?",
      },
    },

    catalog: {
      groups: {
        chest: "Chest",
        back: "Back",
        legs: "Legs",
        shoulders: "Shoulders",
        arms: "Arms",
        core: "Core",
        cardio: "Cardio",
      },
      exercises: {
        "bench-press": "Flat bench press (barbell or dumbbells)",
        "incline-dumbbell-press": "Incline dumbbell press",
        "chest-fly": "Chest fly or cable crossover",
        "pull-up": "Pull-up or lat pulldown",
        "bent-over-row": "Bent-over row (barbell/dumbbell)",
        "seated-row": "Seated cable row",
        "back-squat": "Back squat",
        "leg-press": "Leg press",
        "hack-squat": "Hack squat",
        "romanian-deadlift": "Romanian deadlift",
        "leg-curl": "Lying leg curl",
        "leg-extension": "Leg extension",
        "standing-calf-raise": "Standing calf raise",
        "seated-calf-raise": "Seated calf raise",
        "shoulder-press": "Dumbbell shoulder press",
        "lateral-raise": "Lateral raise",
        "face-pull": "Face pull",
        "triceps-pushdown": "Cable triceps pushdown",
        "barbell-curl": "Barbell curl",
        "hammer-curl": "Hammer curl",
        abs: "Abs (plank / leg raise)",
        "walk-run": "Walk-run",
      },
    },

    tools: {
      title: "Backup",
      export: "Back up now",
      import: "Restore a backup",
      note: "Restoring replaces everything on this device.",
      lastBackup: "Last backup: {when}",
      // One key per line of the import confirmation, not one template per case: the date line is
      // absent from a file the app never stamped, and a device with nothing on it is not being
      // warned about a loss, which as whole templates would be four of them per locale.
      importReplaces: "Restoring replaces everything on this device.",
      importEmptyDevice: "This device has no plans or records yet.",
      importCurrent: "Here now: {plans} and {records}.",
      importFile: "In the file: {plans} and {records}.",
      importFileOnly: "The file holds {plans} and {records}.",
      importDate: "Backed up {when}.",
      importContinue: "Continue?",
      importRestore: "Restore it?",
      importDone: "Progress imported successfully.",
      importInvalid: "Invalid file. Choose a JSON backup exported by {app}.",
      readError: "Could not read the file.",
      // Only the share path can fail visibly-to-nobody; a cancel is silent on purpose.
      exportFailed: "Could not share the backup. Try again.",
    },

    settings: {
      title: "Settings",
      language: "Language",
    },

    banner: {
      backupTitle: "Back up your data",
      backupBody: "Everything is stored on this device only. Keep a copy somewhere safe.",
      dismissAria: "Dismiss",
      installTitle: "Add to Home Screen",
      installBody:
        "Safari → Share → “Add to Home Screen”. It opens full screen and protects your data.",
    },

    // What a day the user never named is called — by its heading, the editor, and the chips.
    plan: {
      dayFallback: "Day {n}",
    },
  },
};
