import { el, fragment } from "../dom.js";
import { formatAge, formatNumber, roundNumber } from "../format.js";
import { INTEGER_FIELDS, entryFields, exerciseKind } from "../catalog.js";
import { MAX_SETS, MIN_SETS, dayLabel, slotName } from "../plan.js";
import { fillableFields, lastLoggedAt } from "../state.js";
import { setGain } from "../progress.js";
import { activeLocale, ordinal, t } from "../i18n/index.js";
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
 *
 * Returns its fill alongside its node, so the card above can drive every row at once.
 */
function setRow({ store, planId, week, slot, setIndex, onEntryChange }) {
  const fields = entryFields(slot.exerciseId);
  const kind = exerciseKind(slot.exerciseId);
  const previous = store.findPrevious(planId, week, slot.id, setIndex);

  // A record from an older block has no week number that means anything here, so the tag
  // shows its age instead. Pre-schema-3 records carry no timestamp and get no tag.
  const fromOtherBlock = previous?.source === "other";
  const tagText = () => {
    if (!previous) return "";
    if (fromOtherBlock) return formatAge(previous.at, activeLocale());
    return t("exercise.weekTag", { n: previous.week });
  };

  const useKey = fromOtherBlock
    ? kind === "cardio"
      ? "exercise.useOlderCardio"
      : "exercise.useOlderStrength"
    : kind === "cardio"
      ? "exercise.useLastCardio"
      : "exercise.useLastStrength";

  const ghostId = (field) => `ghost-${slot.id}-${setIndex}-${field}`;

  const ghost = el(
    "button",
    {
      type: "button",
      class: "set-ghost",
      disabled: !previous,
      "aria-label": previous
        ? t(useKey, {
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
    el("span", { class: "ghost-week", text: tagText() }),
  );

  const currentEntry = () => store.getEntry(planId, week, slot.id, setIndex);

  const gainBadge = el("span", { class: "gain", "aria-hidden": "true" });
  let shown = "";

  const refreshGain = () => {
    const gain = setGain(previous, currentEntry(), slot.exerciseId);
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
      read: () => currentEntry()?.[field] ?? null,
      write: (value) => store.setEntryField(planId, week, slot.id, setIndex, field, value),
      onChange: () => {
        refreshGain();
        onEntryChange?.();
      },
    }),
  );

  /**
   * Copies the previous record in. `keepTyped` is what the card-level button passes: it fills
   * the empty boxes and leaves anything already logged alone. The ghost row passes nothing and
   * overwrites, which is the whole point of tapping one row.
   */
  const fill = ({ keepTyped = false } = {}) => {
    if (!previous) return;
    const open = keepTyped ? new Set(fillableFields(previous, currentEntry(), fields)) : null;

    fields.forEach((field, index) => {
      if (previous[field] == null) return;
      if (open && !open.has(field)) return;
      store.setEntryField(planId, week, slot.id, setIndex, field, previous[field]);
      controls[index].sync();
    });
  };

  ghost.addEventListener("click", () => fill());

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

  return {
    node: el("div", { class: "set" }, ghost, inputs),
    fill,
    // Read live rather than captured: the inputs write through without a render(), so the
    // card's button would otherwise stay enabled after the last box was filled.
    canFill: () => fillableFields(previous, currentEntry(), fields).length > 0,
  };
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
    { class: "stepper" },
    stepButton("−", -1, "exercise.removeSetAria", count <= MIN_SETS),
    el("span", { class: "stepper-label", text: t("exercise.setCount", { n: count }) }),
    stepButton("+", +1, "exercise.addSetAria", count >= MAX_SETS),
  );
}

function exerciseCard({ store, planId, week, slot, onChangeSetCount }) {
  const count = store.getSetCount(planId, week, slot);
  const fields = entryFields(slot.exerciseId);

  // Every set at once. The ghost rows are per-set by design, and four of them is four taps
  // with a phone in your other hand before you can start editing anything.
  let rows = [];
  const fillButton = el("button", {
    type: "button",
    class: "btn",
    text: t("exercise.fillSets"),
    "aria-label": t("exercise.fillSetsAria", { exercise: slotName(slot) }),
    on: { click: () => rows.forEach((row) => row.fill({ keepTyped: true })) },
  });

  // Filling a row syncs its inputs, which reports back here, so the button turns itself off
  // the moment there is nothing left to fill — and on again if a box is cleared by hand.
  const refreshFill = () => {
    fillButton.disabled = !rows.some((row) => row.canFill());
  };

  rows = Array.from({ length: count }, (_, setIndex) =>
    setRow({ store, planId, week, slot, setIndex, onEntryChange: refreshFill }),
  );
  refreshFill();

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
      rows.map((row) => row.node),
    ),
    el(
      "div",
      { class: "ex-actions" },
      setStepper({ slot, count, onChangeSetCount }),
      fillButton,
    ),
  );

  // Set once here so the headings, every ghost row and every input row share one template.
  section.style.setProperty("--set-cols", columnTemplate(fields));
  return section;
}

/**
 * When this day was last trained, or nothing at all — an untrained day says so by having
 * no line, rather than by carrying an empty one.
 */
function lastTrainedNote({ store, plan, week, day }) {
  const at = lastLoggedAt(store.state, plan, week, day);
  if (at == null) return null;

  return el("p", {
    class: "note note--when",
    text: t("day.lastLogged", { when: formatAge(at, activeLocale(), Date.now(), "long") }),
  });
}

/** One training day: a section per slot, then the destructive clear action. */
export function renderDayView({ store, plan, week, day, onChangeSetCount, onClearDay, onEditDay }) {
  // The way to this day's card in the editor. Adding an exercise to today used to mean
  // finding the plan, the editor and then the right day among all of them.
  const editDay = el("button", {
    type: "button",
    class: "btn btn--full",
    text: t("day.editDay"),
    on: { click: () => onEditDay(day) },
  });

  // An empty day should offer the way out, not describe where to find it.
  const empty = el(
    "div",
    { class: "tools" },
    el("p", { class: "note", text: t("day.empty") }),
    editDay,
  );

  return fragment(
    el("h2", { class: "screen-title", tabIndex: -1, text: dayLabel(plan, day) }),
    lastTrainedNote({ store, plan, week, day }),
    day.slots.length === 0
      ? empty
      : day.slots.map((slot) =>
          exerciseCard({ store, planId: plan.id, week, slot, onChangeSetCount }),
        ),
    // Below the sets rather than above them: the top of this screen is for logging, and
    // this is where "add another exercise" belongs. It keeps its own block instead of
    // sharing a row with the destructive action below.
    day.slots.length === 0 ? null : el("div", { class: "tools" }, editDay),
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
