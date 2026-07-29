import { el, fragment } from "../dom.js";
import { GROUPS, USER_KINDS } from "../catalog.js";
import { t } from "../i18n/index.js";

/**
 * The user's own exercises: create, rename, delete.
 *
 * Reads the list off the store rather than the catalog registry, because the store is where
 * it actually lives — the registry is a projection kept for the views that only need to
 * resolve one id.
 *
 * Renaming commits on `change` (blur or Enter) rather than on every keystroke. The day view
 * writes through per keystroke because a set's numbers must survive a phone being put down
 * mid-set, but a name has no such urgency, and going through a callback keeps every action in
 * app.js where the rest of them live.
 */

/**
 * The form that defines a new one.
 *
 * Group and kind are chosen once, here, and not editable afterwards: both are written into
 * how existing slots render, and there is no evidence yet that anyone needs to change their
 * mind. The name is the field people actually get wrong, and that one *is* editable.
 */
function createForm({ onCreate }) {
  const name = el("input", {
    type: "text",
    autocomplete: "off",
    class: "text-input",
    placeholder: t("exercises.namePlaceholder"),
    "aria-label": t("exercises.nameAria"),
  });

  const group = el(
    "select",
    { class: "select", "aria-label": t("exercises.groupAria") },
    GROUPS.map((slug) => el("option", { value: slug, text: t(`catalog.groups.${slug}`) })),
  );

  // Not "strength or cardio" but what a set of it records, which is the part that shows.
  const kind = el(
    "select",
    { class: "select", "aria-label": t("exercises.kindAria") },
    USER_KINDS.map((slug) => el("option", { value: slug, text: t(`exercises.kind.${slug}`) })),
  );

  return el(
    "div",
    { class: "tools" },
    el("div", { class: "eyebrow", text: t("exercises.createTitle") }),
    name,
    group,
    kind,
    el("button", {
      type: "button",
      class: "btn btn--primary btn--full",
      text: t("exercises.create"),
      on: {
        click: () => {
          if (onCreate({ name: name.value, group: group.value, kind: kind.value })) {
            name.value = "";
          }
        },
      },
    }),
  );
}

function exerciseCard({ exercise, onRename, onDelete }) {
  const meta = [
    t(`catalog.groups.${exercise.group}`),
    t(`exercises.kind.${exercise.kind}`),
  ].join(" · ");

  const name = el("input", {
    type: "text",
    autocomplete: "off",
    class: "text-input",
    value: exercise.name,
    "aria-label": t("exercises.renameAria", { exercise: exercise.name }),
    on: { change: () => onRename(exercise, name.value) },
  });

  return el(
    "section",
    { class: "card" },
    el("div", { class: "eyebrow", text: meta }),
    name,
    el("button", {
      type: "button",
      class: "btn btn--danger btn--full",
      text: t("exercises.remove"),
      on: { click: () => onDelete(exercise) },
    }),
  );
}

export function renderExercises({ store, onCreate, onRename, onDelete, onBack }) {
  const exercises = store.state.exercises;

  return fragment(
    el(
      "div",
      { class: "editor-head" },
      el("h2", { class: "screen-title", tabIndex: -1, text: t("exercises.title") }),
      el("button", {
        type: "button",
        class: "btn",
        text: t("exercises.back"),
        on: { click: onBack },
      }),
    ),
    createForm({ onCreate }),
    el("div", { class: "eyebrow clear-wrap", text: t("exercises.mine") }),
    exercises.length === 0 ? el("p", { class: "note", text: t("exercises.empty") }) : null,
    exercises.map((exercise) => exerciseCard({ exercise, onRename, onDelete })),
  );
}
