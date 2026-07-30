import { el, fragment } from "../dom.js";
import { byGroup, exerciseLabel, searchExercises } from "../catalog.js";
import {
  MAX_DAYS,
  MAX_SETS,
  MAX_WEEKS,
  MIN_DAYS,
  MIN_SETS,
  MIN_WEEKS,
  clampSets,
  clampWeeks,
  dayLabel,
  moveItem,
  newDay,
  newSlot,
  slotName,
} from "../plan.js";
import { t } from "../i18n/index.js";

/**
 * The plan editor, working on a draft the caller owns.
 *
 * Two kinds of change, deliberately handled differently:
 *   • text typed into a name or rep field mutates the draft and does *not* re-render —
 *     rebuilding the DOM under a focused input on iOS drops the keyboard mid-word;
 *   • structural changes (add/remove/reorder/steppers) mutate the draft and call
 *     onChange(), which re-renders the whole screen as everywhere else in the app.
 *
 * Nothing here writes to storage, so removing a day or an exercise costs nothing yet.
 * The caller decides when a draft becomes the real plan, and warns there — once — about
 * whatever records the accumulated edits would discard.
 */

const stepper = ({ value, min, max, label, addAria, removeAria, onStep }) =>
  el(
    "div",
    { class: "stepper" },
    el("button", {
      type: "button",
      class: "btn btn--icon",
      text: "−",
      "aria-label": removeAria,
      disabled: value <= min,
      on: { click: () => onStep(-1) },
    }),
    el("span", { class: "stepper-label", text: label }),
    el("button", {
      type: "button",
      class: "btn btn--icon",
      text: "+",
      "aria-label": addAria,
      disabled: value >= max,
      on: { click: () => onStep(+1) },
    }),
  );

const iconButton = (symbol, ariaLabel, disabled, onClick) =>
  el("button", {
    type: "button",
    class: "btn btn--icon",
    text: symbol,
    "aria-label": ariaLabel,
    disabled,
    on: { click: onClick },
  });

/** A text input bound straight to a draft field; blank is stored as null, never "". */
function nameInput({ value, placeholder, ariaLabel, onInput }) {
  const input = el("input", {
    type: "text",
    autocomplete: "off",
    class: "text-input",
    placeholder,
    "aria-label": ariaLabel,
    value: value ?? "",
    on: { input: () => onInput(input.value.trim() === "" ? null : input.value) },
  });
  return input;
}

/**
 * One of the two rep-range boxes, bound straight to the draft. Clearing either box is how
 * you say "no rep target" — a range needs both ends to mean anything.
 *
 * The pair is held outside the inputs so each can read what the other currently has
 * without a re-render, which would take the keyboard away mid-edit.
 */
function repInput({ slot, pair, index, ariaLabel }) {
  const input = el("input", {
    type: "text",
    inputMode: "numeric",
    autocomplete: "off",
    class: "text-input rep-input",
    "aria-label": ariaLabel,
    value: slot.reps ? String(slot.reps[index]) : "",
    on: {
      input: () => {
        const parsed = Number.parseInt(input.value, 10);
        pair[index] = Number.isFinite(parsed) ? parsed : null;
        slot.reps = pair[0] != null && pair[1] != null ? [pair[0], pair[1]] : null;
      },
    },
  });
  return input;
}

function slotRow({ day, slot, index, onChange }) {
  const name = slotName(slot);
  const pair = slot.reps ? [...slot.reps] : [null, null];

  return el(
    "div",
    { class: "slot-row" },
    el("div", { class: "slot-name", text: name }),
    el(
      "div",
      { class: "slot-controls" },
      stepper({
        value: slot.sets,
        min: MIN_SETS,
        max: MAX_SETS,
        label: t("exercise.setCount", { n: slot.sets }),
        addAria: t("exercise.addSetAria", { exercise: name }),
        removeAria: t("exercise.removeSetAria", { exercise: name }),
        onStep: (delta) => {
          slot.sets = clampSets(slot.sets + delta);
          onChange();
        },
      }),
      el(
        "div",
        { class: "rep-range" },
        el("span", { class: "eyebrow", text: t("planEditor.repsLabel") }),
        repInput({ slot, pair, index: 0, ariaLabel: t("planEditor.repsMinAria", { exercise: name }) }),
        el("span", { class: "rep-dash", text: "–" }),
        repInput({ slot, pair, index: 1, ariaLabel: t("planEditor.repsMaxAria", { exercise: name }) }),
      ),
      el(
        "div",
        { class: "row-actions" },
        iconButton("↑", t("planEditor.moveUpAria", { item: name }), index === 0, () => {
          day.slots = moveItem(day.slots, index, -1);
          onChange();
        }),
        iconButton(
          "↓",
          t("planEditor.moveDownAria", { item: name }),
          index === day.slots.length - 1,
          () => {
            day.slots = moveItem(day.slots, index, +1);
            onChange();
          },
        ),
        iconButton("×", t("planEditor.removeSlotAria", { item: name }), false, () => {
          day.slots = day.slots.filter((candidate) => candidate !== slot);
          onChange();
        }),
      ),
    ),
  );
}

/**
 * The exercise picker: a filter and one tap per exercise, open on one day at a time.
 *
 * Closed it is a single button. It has to be: the list is every exercise the user has, and
 * leaving it open on every day card would make a three-day plan thousands of pixels tall.
 *
 * Open, it builds every row once and hides them as the query narrows rather than rebuilding
 * the list. The filter cannot call onChange() — that re-renders the whole screen from state
 * and would drop the iOS keyboard mid-word — so it toggles `.hidden` on nodes this function
 * already owns, the same narrow exception the gain badge in views/day.js uses. Keeping the
 * rows in catalog order also means the one you are reaching for never jumps.
 */
function exercisePicker({ day, picker, onPicker, onChange }) {
  if (picker.dayId !== day.id) {
    return el("button", {
      type: "button",
      class: "btn btn--primary btn--full",
      text: t("planEditor.addExercise"),
      on: { click: () => onPicker({ dayId: day.id, query: "" }) },
    });
  }

  const filter = el("input", {
    type: "text",
    class: "text-input",
    value: picker.query,
    placeholder: t("planEditor.filterPlaceholder"),
    "aria-label": t("planEditor.filterAria"),
  });

  const rows = [];
  const groups = byGroup().map(({ group, exercises }) => {
    const buttons = exercises.map((exercise) => {
      const node = el("button", {
        type: "button",
        class: "btn pick",
        text: exerciseLabel(exercise.id),
        on: {
          click: () => {
            day.slots = [...day.slots, newSlot(exercise.id)];
            onChange();
          },
        },
      });
      rows.push({ id: exercise.id, node });
      return node;
    });

    return {
      ids: exercises.map((exercise) => exercise.id),
      section: el(
        "div",
        { class: "pick-group" },
        el("div", { class: "eyebrow", text: t(`catalog.groups.${group}`) }),
        ...buttons,
      ),
    };
  });

  const empty = el("p", { class: "note hidden", text: t("planEditor.noMatches") });

  const narrow = () => {
    const matching = new Set(
      searchExercises(filter.value).flatMap(({ exercises }) => exercises.map((one) => one.id)),
    );

    for (const { id, node } of rows) node.classList.toggle("hidden", !matching.has(id));
    for (const { ids, section } of groups) {
      section.classList.toggle("hidden", !ids.some((id) => matching.has(id)));
    }
    empty.classList.toggle("hidden", matching.size > 0);
  };

  filter.addEventListener("input", () => {
    // Remembered so the query survives the re-render that adding an exercise causes.
    onPicker({ dayId: day.id, query: filter.value });
    narrow();
  });
  narrow();

  return el(
    "div",
    { class: "picker" },
    el(
      "div",
      { class: "add-row" },
      filter,
      iconButton("×", t("planEditor.closePicker"), false, () =>
        onPicker({ dayId: null, query: "" }),
      ),
    ),
    ...groups.map(({ section }) => section),
    empty,
  );
}

/**
 * `focused` is the day the editor was opened on. It carries the same outline the in-use plan
 * gets, and the tabIndex the caller needs to move focus here instead of the screen title —
 * which is what scrolls it into view. Kept for as long as the editor is open rather than
 * cleared after the first render: it goes on saying which day you came from while you work.
 */
function dayCard({ draft, day, index, focused, picker, onPicker, onChange }) {
  const label = dayLabel(draft, day);

  return el(
    "section",
    focused
      ? { class: "card card--day card--active", tabIndex: -1 }
      : { class: "card card--day" },
    el(
      "div",
      { class: "day-head" },
      nameInput({
        value: day.name ?? (day.nameKey ? t(day.nameKey) : null),
        placeholder: t("planEditor.dayNamePlaceholder"),
        ariaLabel: t("planEditor.dayNameAria", { n: index + 1 }),
        onInput: (value) => {
          day.name = value;
          // Once the user names a day, the shipped translation no longer applies.
          day.nameKey = null;
        },
      }),
      el(
        "div",
        { class: "row-actions" },
        iconButton("↑", t("planEditor.moveUpAria", { item: label }), index === 0, () => {
          draft.days = moveItem(draft.days, index, -1);
          onChange();
        }),
        iconButton(
          "↓",
          t("planEditor.moveDownAria", { item: label }),
          index === draft.days.length - 1,
          () => {
            draft.days = moveItem(draft.days, index, +1);
            onChange();
          },
        ),
        iconButton(
          "×",
          t("planEditor.removeDayAria", { item: label }),
          draft.days.length <= MIN_DAYS,
          () => {
            draft.days = draft.days.filter((candidate) => candidate !== day);
            onChange();
          },
        ),
      ),
    ),
    day.slots.length === 0
      ? el("p", { class: "note", text: t("planEditor.emptyDay") })
      : day.slots.map((slot, slotIndex) =>
          slotRow({ day, slot, index: slotIndex, onChange }),
        ),
    exercisePicker({ day, picker, onPicker, onChange }),
  );
}

/**
 * Renders the editor for `draft`. `onChange` re-renders; `onDone` hands the draft back to
 * the caller to be saved. `focusDayId` is the day to land on, or null when the editor was
 * not opened from one.
 */
export function renderPlanEditor({ draft, picker, focusDayId, onPicker, onChange, onDone }) {
  return fragment(
    el(
      "div",
      { class: "editor-head" },
      el("h2", { class: "screen-title", tabIndex: -1, text: t("planEditor.title") }),
      el("button", {
        type: "button",
        class: "btn btn--primary",
        text: t("planEditor.done"),
        on: { click: onDone },
      }),
    ),

    el(
      "div",
      { class: "tools" },
      el("div", { class: "eyebrow", text: t("planEditor.nameLabel") }),
      nameInput({
        value: draft.name ?? (draft.nameKey ? t(draft.nameKey) : null),
        placeholder: t("planEditor.namePlaceholder"),
        ariaLabel: t("planEditor.nameLabel"),
        onInput: (value) => {
          draft.name = value;
          draft.nameKey = null;
        },
      }),
      el(
        "div",
        { class: "editor-row" },
        el("span", { class: "eyebrow", text: t("planEditor.weeksLabel") }),
        stepper({
          value: draft.weeks,
          min: MIN_WEEKS,
          max: MAX_WEEKS,
          label: t("plans.weekCount", { n: draft.weeks }),
          addAria: t("planEditor.addWeekAria"),
          removeAria: t("planEditor.removeWeekAria"),
          onStep: (delta) => {
            draft.weeks = clampWeeks(draft.weeks + delta);
            onChange();
          },
        }),
      ),
    ),

    el("div", { class: "eyebrow", text: t("planEditor.daysLabel") }),
    draft.days.map((day, index) =>
      dayCard({
        draft,
        day,
        index,
        focused: day.id === focusDayId,
        picker,
        onPicker,
        onChange,
      }),
    ),

    el(
      "div",
      { class: "actions" },
      el("button", {
        type: "button",
        class: "btn",
        text: t("planEditor.addDay"),
        disabled: draft.days.length >= MAX_DAYS,
        on: {
          click: () => {
            draft.days = [...draft.days, newDay()];
            onChange();
          },
        },
      }),
    ),
  );
}
