import { el, fragment } from "../dom.js";
import { formatNumber, roundNumber } from "../format.js";
import { INTEGER_FIELDS, entryFields, exerciseKind } from "../catalog.js";
import { MAX_SETS, MIN_SETS, dayNumber, displayName, slotName } from "../plan.js";
import { setGain } from "../progress.js";
import { ordinal, t } from "../i18n/index.js";
import { numericField } from "./fields.js";

/** The unit shown after a logged value in the spoken label. Reps are a bare count. */
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

/** "60 kg", "8", "3.2 km" — with the unit, for the ghost row's spoken label. */
function spokenValue(entry, field) {
  const value = entry[field];
  if (value == null) return t("units.missing");

  const text = formatNumber(value, { integer: INTEGER_FIELDS.has(field) });
  const unit = FIELD_UNIT[field];
  return unit ? `${text} ${t(unit)}` : text;
}

/**
 * The grid every row of a set shares: a lead column for the set number, one flexible
 * column per logged field with a separator between, and a trailing column for the week tag
 * and the gain badge.
 *
 * Built from the field list rather than hardcoded so the columns stay aligned whatever an
 * exercise logs. Two grids with an identical template line up without subgrid, which is
 * iOS 16+ and more than this needs.
 */
function columnTemplate(fields) {
  const middle = fields.map(() => "minmax(0, 1fr)").join(" var(--set-sep) ");
  return `var(--set-lead) ${middle} var(--set-trail)`;
}

/** Interleaves one cell per field with the separator that belongs between them. */
function interleave(fields, cell, separator) {
  return fields.flatMap((field, index) =>
    index === 0 ? [cell(field, index)] : [separator(), cell(field, index)],
  );
}

/** The column headings, once per exercise instead of a label on every box. */
function columnHeadings(fields) {
  return el(
    "div",
    { class: "set-head", "aria-hidden": "true" },
    el("span"),
    interleave(
      fields,
      (field) => el("span", { class: "eyebrow", text: t(`exercise.columns.${field}`) }),
      () => el("span"),
    ),
    el("span"),
  );
}

/**
 * One set: last week above, today below, in one column.
 *
 * The ghost row is the control as well as the hint — tapping it pulls last week's numbers
 * in, which is why there is no longer a separate copy button. The gain badge is written
 * straight into the DOM rather than through render(), because render() must never be
 * called from a text input's handler.
 */
function setRow({ store, planId, week, slot, setIndex }) {
  const fields = entryFields(slot.exerciseId);
  const kind = exerciseKind(slot.exerciseId);
  const previous = store.findPrevious(planId, week, slot.id, setIndex);

  const ghostId = (field) => `ghost-${slot.id}-${setIndex}-${field}`;

  const ghost = el(
    "button",
    {
      type: "button",
      class: "set-ghost",
      disabled: !previous,
      "aria-label": previous
        ? t(kind === "cardio" ? "exercise.useLastCardio" : "exercise.useLastStrength", {
            week: previous.week,
            set: setIndex + 1,
            ...Object.fromEntries(fields.map((field) => [field, spokenValue(previous, field)])),
          })
        : t("exercise.previousEmpty", { set: setIndex + 1 }),
    },
    el("span", { class: "set-n", text: ordinal(setIndex + 1) }),
    interleave(
      fields,
      (field) =>
        el("span", {
          class: "ghost-val",
          id: ghostId(field),
          text: previous
            ? formatNumber(previous[field], { integer: INTEGER_FIELDS.has(field) }) ||
              t("units.missing")
            : t("units.missing"),
        }),
      () => el("span", { class: "pair", text: t(`exercise.pair.${kind}`) }),
    ),
    el("span", {
      class: "ghost-week",
      text: previous ? t("exercise.weekTag", { n: previous.week }) : "",
    }),
  );

  const gainBadge = el("span", { class: "gain", "aria-hidden": "true" });
  let shown = "";

  const refreshGain = () => {
    const gain = setGain(previous, store.getEntry(planId, week, slot.id, setIndex), slot.exerciseId);
    const text = gain
      ? t(`exercise.gain.${gain.field}`, {
          n: roundNumber(gain.delta, { integer: INTEGER_FIELDS.has(gain.field) }),
        })
      : "";
    if (text === shown) return;

    gainBadge.textContent = text;
    if (text) {
      // Restart the entrance animation: the node is reused, so re-adding the class is not
      // enough on its own.
      gainBadge.classList.remove("gain--in");
      void gainBadge.offsetWidth;
      gainBadge.classList.add("gain--in");
    }
    shown = text;
  };

  const controls = fields.map((field) =>
    numericField({
      placeholder: t(`exercise.fields.${field}.placeholder`),
      ariaLabel: t(`exercise.fields.${field}.aria`, { set: setIndex + 1 }),
      describedBy: previous ? ghostId(field) : null,
      integer: INTEGER_FIELDS.has(field),
      read: () => store.getEntry(planId, week, slot.id, setIndex)?.[field] ?? null,
      write: (value) => store.setEntryField(planId, week, slot.id, setIndex, field, value),
      onChange: refreshGain,
    }),
  );

  ghost.addEventListener("click", () => {
    if (!previous) return;
    fields.forEach((field, index) => {
      if (previous[field] == null) return;
      store.setEntryField(planId, week, slot.id, setIndex, field, previous[field]);
      controls[index].sync();
    });
  });

  const inputs = el(
    "div",
    { class: "set-inputs" },
    el("span"),
    interleave(
      fields,
      (_field, index) => controls[index].wrap,
      () => el("span"),
    ),
    gainBadge,
  );

  refreshGain();
  return el("div", { class: "set" }, ghost, inputs);
}

function setStepper({ slot, count, onChangeSetCount }) {
  const stepButton = (symbol, delta, ariaKey, disabled) =>
    el("button", {
      type: "button",
      class: "btn btn--icon",
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
      { class: "stepper" },
      stepButton("−", -1, "exercise.removeSetAria", count <= MIN_SETS),
      el("span", { class: "stepper-label", text: t("exercise.setCount", { n: count }) }),
      stepButton("+", +1, "exercise.addSetAria", count >= MAX_SETS),
    ),
  );
}

function exerciseCard({ store, planId, week, slot, onChangeSetCount }) {
  const count = store.getSetCount(planId, week, slot);
  const fields = entryFields(slot.exerciseId);

  const section = el(
    "section",
    { class: "exercise" },
    el(
      "div",
      { class: "card-head" },
      el("h3", { class: "card-title", text: slotName(slot) }),
      el("span", { class: "card-meta", text: schemeText(slot) }),
    ),
    columnHeadings(fields),
    el(
      "div",
      { class: "sets" },
      Array.from({ length: count }, (_, setIndex) =>
        setRow({ store, planId, week, slot, setIndex }),
      ),
    ),
    setStepper({ slot, count, onChangeSetCount }),
  );

  // Set once here so the headings, every ghost row and every input row share one template.
  section.style.setProperty("--set-cols", columnTemplate(fields));
  return section;
}

/** What to head the day with: its name, or its position when the user left it blank. */
export function dayTitle(plan, day) {
  return displayName(day) || t("planEditor.dayFallback", { n: dayNumber(plan, day.id) });
}

/** One training day: a section per slot, then the destructive clear action. */
export function renderDayView({ store, plan, week, day, onChangeSetCount, onClearDay, onEditPlan }) {
  // An empty day should offer the way out, not describe where to find it.
  const empty = el(
    "div",
    { class: "tools" },
    el("p", { class: "note", text: t("day.empty") }),
    el("button", {
      type: "button",
      class: "btn btn--full",
      text: t("day.emptyAction"),
      on: { click: () => onEditPlan(plan) },
    }),
  );

  return fragment(
    el("h2", { class: "screen-title", tabIndex: -1, text: dayTitle(plan, day) }),
    day.slots.length === 0
      ? empty
      : day.slots.map((slot) =>
          exerciseCard({ store, planId: plan.id, week, slot, onChangeSetCount }),
        ),
    day.slots.length === 0
      ? null
      : el(
          "div",
          { class: "clear-wrap" },
          el("button", {
            type: "button",
            class: "btn btn--danger btn--full",
            text: t("day.clear"),
            on: { click: () => onClearDay(day) },
          }),
        ),
  );
}
