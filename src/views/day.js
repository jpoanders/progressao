import { el, fragment } from "../dom.js";
import { formatNumber } from "../format.js";
import { INTEGER_FIELDS, entryFields, exerciseKind } from "../catalog.js";
import { MAX_SETS, MIN_SETS, dayNumber, displayName, slotName } from "../plan.js";
import { ordinal, t } from "../i18n/index.js";
import { numericField } from "./fields.js";

/** The unit shown after a logged value, per field. Reps are a bare count. */
const FIELD_UNIT = { kg: "units.kg", dist: "units.km", time: "units.min", reps: null };

/**
 * The prescribed scheme shown beside the exercise name ("3×6-8", "3 sets").
 * Always the plan's prescription — not the user's adjusted set count, which is shown by
 * the stepper below the sets.
 */
function schemeText(slot) {
  if (!slot.reps) return t("exercise.setCount", { n: slot.sets });
  const [min, max] = slot.reps;
  return t("exercise.scheme", { sets: slot.sets, min, max });
}

/** "60 kg", "8", "3.2 km" — or a dash when that field was left blank. */
function fieldValue(entry, field) {
  const value = entry[field];
  if (value == null) return t("units.missing");

  const text = formatNumber(value, { integer: INTEGER_FIELDS.has(field) });
  const unit = FIELD_UNIT[field];
  return unit ? `${text} ${t(unit)}` : text;
}

/** "↳ last time (W2): 60 kg × 8" — the target to beat, or a muted placeholder. */
function previousHint(slot, previous) {
  if (!previous) {
    return el("div", { class: "prev empty", text: t("exercise.previousEmpty") });
  }

  const params = { week: previous.week };
  for (const field of entryFields(slot.exerciseId)) {
    params[field] = fieldValue(previous, field);
  }

  const key =
    exerciseKind(slot.exerciseId) === "cardio"
      ? "exercise.previousCardio"
      : "exercise.previousStrength";

  return el("div", { class: "prev", text: t(key, params) });
}

function setRow({ store, planId, week, slot, setIndex }) {
  const fields = entryFields(slot.exerciseId);

  const controls = fields.map((field) =>
    numericField({
      placeholder: t(`exercise.fields.${field}.placeholder`),
      ariaLabel: t(`exercise.fields.${field}.aria`, { set: setIndex + 1 }),
      integer: INTEGER_FIELDS.has(field),
      read: () => store.getEntry(planId, week, slot.id, setIndex)?.[field] ?? null,
      write: (value) => store.setEntryField(planId, week, slot.id, setIndex, field, value),
    }),
  );

  const previous = store.findPrevious(planId, week, slot.id, setIndex);
  const copyButton = el("button", {
    type: "button",
    class: "copy-btn",
    text: t("exercise.copy"),
    "aria-label": t("exercise.copyAria", { set: setIndex + 1 }),
    disabled: !previous,
    on: {
      click: () => {
        if (!previous) return;
        fields.forEach((field, index) => {
          if (previous[field] == null) return;
          store.setEntryField(planId, week, slot.id, setIndex, field, previous[field]);
          controls[index].sync();
        });
      },
    },
  });

  const row = el(
    "div",
    { class: "set-row" },
    el("div", { class: "set-n", text: ordinal(setIndex + 1) }),
    controls.map((control) => control.wrap),
    copyButton,
  );

  return fragment(row, previousHint(slot, previous));
}

function setStepper({ slot, count, onChangeSetCount }) {
  const stepButton = (symbol, delta, ariaKey, disabled) =>
    el("button", {
      type: "button",
      class: "btn step",
      text: symbol,
      "aria-label": t(ariaKey, { exercise: slotName(slot) }),
      disabled,
      on: { click: () => onChangeSetCount(slot, delta) },
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

function exerciseCard({ store, planId, week, slot, onChangeSetCount }) {
  const count = store.getSetCount(planId, week, slot);

  const sets = el(
    "div",
    { class: "sets" },
    Array.from({ length: count }, (_, setIndex) =>
      setRow({ store, planId, week, slot, setIndex }),
    ),
  );

  return el(
    "section",
    { class: "exercise" },
    el(
      "div",
      { class: "ex-head" },
      el("h2", { class: "ex-name", text: slotName(slot) }),
      el("span", { class: "ex-scheme", text: schemeText(slot) }),
    ),
    sets,
    setStepper({ slot, count, onChangeSetCount }),
  );
}

/** What to head the day with: its name, or its position when the user left it blank. */
export function dayTitle(plan, day) {
  return displayName(day) || t("planEditor.dayFallback", { n: dayNumber(plan, day.id) });
}

/** One training day: a card per slot, then the destructive clear action. */
export function renderDayView({ store, plan, week, day, onChangeSetCount, onClearDay }) {
  return fragment(
    el("p", { class: "day-title", text: dayTitle(plan, day) }),
    day.slots.length === 0
      ? el("p", { class: "empty-note", text: t("day.empty") })
      : day.slots.map((slot) =>
          exerciseCard({ store, planId: plan.id, week, slot, onChangeSetCount }),
        ),
    el(
      "div",
      { class: "clear-wrap" },
      el("button", {
        type: "button",
        class: "btn danger full",
        text: t("day.clear", { week }),
        disabled: day.slots.length === 0,
        on: { click: () => onClearDay(day) },
      }),
    ),
  );
}
