import { el, fragment } from "../dom.js";
import { formatNumber } from "../format.js";
import { MAX_SETS, MIN_SETS } from "../plan.js";
import { ordinal, t } from "../i18n/index.js";
import { numericField } from "./fields.js";

export function exerciseName(exerciseId) {
  return t(`plan.exercises.${exerciseId}`);
}

/**
 * The prescribed scheme shown beside the exercise name ("3×6-8", "3 sets").
 * Always the plan's prescription — not the user's adjusted set count, which is shown by
 * the stepper below the sets.
 */
function schemeText(exercise) {
  if (!exercise.reps) return t("exercise.setCount", { n: exercise.sets });
  const [min, max] = exercise.reps;
  return t("exercise.scheme", { sets: exercise.sets, min, max });
}

/** "↳ last time (W2): 60 kg × 8" — the target to beat, or a muted placeholder. */
function previousHint(previous) {
  if (!previous) {
    return el("div", { class: "prev empty", text: t("exercise.previousEmpty") });
  }
  const weight =
    previous.kg != null
      ? `${formatNumber(previous.kg)} ${t("units.kg")}`
      : t("units.missing");
  const reps =
    previous.reps != null ? formatNumber(previous.reps, { integer: true }) : t("units.missing");

  return el("div", {
    class: "prev",
    text: t("exercise.previous", { week: previous.week, weight, reps }),
  });
}

function setRow({ store, week, day, exercise, setIndex }) {
  const bind = (field, integer) =>
    numericField({
      placeholder: t(integer ? "exercise.repsPlaceholder" : "exercise.weightPlaceholder"),
      ariaLabel: t(integer ? "exercise.repsAria" : "exercise.weightAria", { set: setIndex + 1 }),
      integer,
      read: () => store.getEntry(week, day.id, exercise.id, setIndex)?.[field] ?? null,
      write: (value) => store.setEntryField(week, day.id, exercise.id, setIndex, field, value),
    });

  const weight = bind("kg", false);
  const reps = bind("reps", true);

  const previous = store.findPrevious(week, day.id, exercise.id, setIndex);
  const copyButton = el("button", {
    type: "button",
    class: "copy-btn",
    text: t("exercise.copy"),
    "aria-label": t("exercise.copyAria", { set: setIndex + 1 }),
    disabled: !previous,
    on: {
      click: () => {
        if (!previous) return;
        for (const [field, control] of [["kg", weight], ["reps", reps]]) {
          if (previous[field] == null) continue;
          store.setEntryField(week, day.id, exercise.id, setIndex, field, previous[field]);
          control.sync();
        }
      },
    },
  });

  const row = el(
    "div",
    { class: "set-row" },
    el("div", { class: "set-n", text: ordinal(setIndex + 1) }),
    weight.wrap,
    reps.wrap,
    copyButton,
  );

  return fragment(row, previousHint(previous));
}

function setStepper({ store, week, day, exercise, count, onChangeSetCount }) {
  const stepButton = (symbol, delta, ariaKey, disabled) =>
    el("button", {
      type: "button",
      class: "btn step",
      text: symbol,
      "aria-label": t(ariaKey, { exercise: exerciseName(exercise.id) }),
      disabled,
      on: { click: () => onChangeSetCount(day, exercise, delta) },
    });

  return el(
    "div",
    { class: "ex-actions" },
    el(
      "div",
      { class: "set-stepper" },
      stepButton("−", -1, "exercise.removeSetAria", count <= MIN_SETS),
      el("span", { class: "step-label", text: t("exercise.setCount", { n: count }) }),
      stepButton("+", +1, "exercise.addSetAria", count >= MAX_SETS),
    ),
  );
}

function exerciseCard({ store, week, day, exercise, onChangeSetCount }) {
  const count = store.getSetCount(week, day.id, exercise);

  const sets = el(
    "div",
    { class: "sets" },
    Array.from({ length: count }, (_, setIndex) =>
      setRow({ store, week, day, exercise, setIndex }),
    ),
  );

  return el(
    "section",
    { class: "exercise" },
    el(
      "div",
      { class: "ex-head" },
      el("h2", { class: "ex-name", text: exerciseName(exercise.id) }),
      el("span", { class: "ex-scheme", text: schemeText(exercise) }),
    ),
    sets,
    setStepper({ store, week, day, exercise, count, onChangeSetCount }),
  );
}

/** A strength day: one card per exercise, then the destructive clear action. */
export function renderDayView({ store, week, day, onChangeSetCount, onClearDay }) {
  return fragment(
    el("p", { class: "day-title", text: t(`plan.days.${day.id}`) }),
    day.exercises.map((exercise) =>
      exerciseCard({ store, week, day, exercise, onChangeSetCount }),
    ),
    el(
      "div",
      { class: "clear-wrap" },
      el("button", {
        type: "button",
        class: "btn danger full",
        text: t("day.clear", { week }),
        on: { click: () => onClearDay(day) },
      }),
    ),
  );
}
