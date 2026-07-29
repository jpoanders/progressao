import { el, fragment } from "../dom.js";
import { displayName } from "../plan.js";
import { countPlanEntries } from "../state.js";
import { t } from "../i18n/index.js";

/** "4 weeks · 5 days · 12 records" — enough to tell two blocks apart at a glance. */
function summaryText(store, plan) {
  const records = countPlanEntries(store.state, plan.id);

  return [
    t("plans.weekCount", { n: plan.weeks }),
    t("plans.dayCount", { n: plan.days.length }),
    records > 0 ? t("plans.recordCount", { n: records }) : t("plans.noRecords"),
  ].join(" · ");
}

function planCard({ store, plan, isActive, onUse, onEdit, onDuplicate, onDelete }) {
  const action = (labelKey, className, onClick) =>
    el("button", {
      type: "button",
      class: className,
      text: t(labelKey),
      on: { click: () => onClick(plan) },
    });

  return el(
    "section",
    { class: `card${isActive ? " card--active" : ""}` },
    el(
      "div",
      { class: "card-head" },
      el("h3", { class: "card-title", text: displayName(plan) || t("plans.untitled") }),
      isActive ? el("span", { class: "badge", text: t("plans.inUse") }) : null,
    ),
    el("p", { class: "note", text: summaryText(store, plan) }),
    // Four actions never fit two columns on a phone, so this row wraps instead.
    el(
      "div",
      { class: "actions actions--wrap" },
      isActive ? null : action("plans.use", "btn btn--primary", onUse),
      action("plans.edit", "btn", onEdit),
      action("plans.duplicate", "btn", onDuplicate),
      action("plans.remove", "btn btn--danger", onDelete),
    ),
  );
}

/**
 * The plan library: every plan the user has, which one is in use, and the actions that
 * change that. Creating and editing happen in the editor view; this screen only routes.
 */
export function renderPlansView({
  store,
  activePlanId,
  onUse,
  onEdit,
  onDuplicate,
  onDelete,
  onCreate,
  onManageExercises,
  onBack,
}) {
  return fragment(
    el("h2", { class: "screen-title", tabIndex: -1, text: t("plans.title") }),
    store.plans.length === 0 ? el("p", { class: "note", text: t("plans.empty") }) : null,
    store.plans.map((plan) =>
      planCard({
        store,
        plan,
        isActive: plan.id === activePlanId,
        onUse,
        onEdit,
        onDuplicate,
        onDelete,
      }),
    ),
    el(
      "div",
      { class: "actions clear-wrap" },
      el("button", {
        type: "button",
        class: "btn btn--primary",
        text: t("plans.create"),
        on: { click: onCreate },
      }),
      // Plans is the landing screen and the only one reachable with nothing selected, so it
      // has to be a way into the exercise library too — the Tools entry point only exists on
      // the log screen, which a fresh install cannot reach yet.
      el("button", {
        type: "button",
        class: "btn",
        text: t("exercises.manage"),
        on: { click: onManageExercises },
      }),
      onBack
        ? el("button", {
            type: "button",
            class: "btn",
            text: t("plans.back"),
            on: { click: onBack },
          })
        : null,
    ),
  );
}
