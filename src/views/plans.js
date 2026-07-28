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
    { class: `plan-card${isActive ? " active" : ""}` },
    el(
      "div",
      { class: "ex-head" },
      el("h2", { class: "ex-name", text: displayName(plan) || t("plans.untitled") }),
      isActive ? el("span", { class: "badge", text: t("plans.inUse") }) : null,
    ),
    el("div", { class: "plan-summary", text: summaryText(store, plan) }),
    el(
      "div",
      { class: "tools-row" },
      isActive ? null : action("plans.use", "btn accent", onUse),
      action("plans.edit", "btn", onEdit),
      action("plans.duplicate", "btn", onDuplicate),
      action("plans.remove", "btn danger", onDelete),
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
  onBack,
}) {
  return fragment(
    el("p", { class: "day-title", text: t("plans.title") }),
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
      { class: "tools-row spread" },
      el("button", {
        type: "button",
        class: "btn accent",
        text: t("plans.create"),
        on: { click: onCreate },
      }),
      el("button", {
        type: "button",
        class: "btn",
        text: t("plans.back"),
        on: { click: onBack },
      }),
    ),
  );
}
