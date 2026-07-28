import { el, fragment } from "../dom.js";
import { formatDateTime } from "../format.js";
import { displayName } from "../plan.js";
import { activeLocale, availableLocales, t } from "../i18n/index.js";

/** The way into plan management: which plan is in use, and a button to change that. */
function planSection({ plan, onManagePlans }) {
  return el(
    "div",
    { class: "tools" },
    el("div", { class: "eyebrow", text: t("plans.title") }),
    el("p", {
      class: "note",
      text: displayName(plan) || t("plans.untitled"),
    }),
    el("button", {
      type: "button",
      class: "btn btn--full",
      text: t("plans.manage"),
      on: { click: onManagePlans },
    }),
  );
}

function backupSection({ store, onExport, onImport }) {
  const lastExport = store.state.lastExport;

  return el(
    "div",
    { class: "tools" },
    el("div", { class: "eyebrow", text: t("tools.title") }),
    el(
      "div",
      { class: "actions" },
      el("button", {
        type: "button",
        class: "btn btn--primary",
        text: t("tools.export"),
        on: { click: onExport },
      }),
      el("button", {
        type: "button",
        class: "btn",
        text: t("tools.import"),
        on: { click: onImport },
      }),
    ),
    // Says what restoring costs before the tap, not only in the confirm that follows it.
    el("p", { class: "note", text: t("tools.note") }),
    lastExport
      ? el("p", {
          class: "note",
          text: t("tools.lastBackup", { when: formatDateTime(lastExport, activeLocale()) }),
        })
      : null,
  );
}

/** Language picker, built from the locale registry so a new locale needs no UI change. */
function settingsSection({ onLocaleChange }) {
  const select = el(
    "select",
    {
      class: "select",
      "aria-label": t("settings.language"),
      on: { change: (event) => onLocaleChange(event.target.value) },
    },
    availableLocales().map(({ tag, label }) =>
      el("option", { value: tag, text: label, selected: tag === activeLocale() }),
    ),
  );

  return el(
    "div",
    { class: "tools" },
    el("div", { class: "eyebrow", text: t("settings.title") }),
    select,
  );
}

/** Plan, backup and settings, shown at the bottom of the training view. */
export function renderTools({ store, plan, onManagePlans, onExport, onImport, onLocaleChange }) {
  return fragment(
    planSection({ plan, onManagePlans }),
    backupSection({ store, onExport, onImport }),
    settingsSection({ onLocaleChange }),
  );
}
