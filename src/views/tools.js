import { el, fragment } from "../dom.js";
import { formatDateTime } from "../format.js";
import { displayName } from "../plan.js";
import { activeLocale, availableLocales, t } from "../i18n/index.js";

/** The way into plan management: which plan is in use, and a button to change that. */
function planSection({ plan, onManagePlans }) {
  return el(
    "div",
    { class: "tools" },
    el("div", { class: "tools-title", text: t("plans.title") }),
    el("div", {
      class: "tools-note",
      text: displayName(plan) || t("plans.untitled"),
    }),
    el(
      "div",
      { class: "tools-row" },
      el("button", {
        type: "button",
        class: "btn",
        text: t("plans.manage"),
        on: { click: onManagePlans },
      }),
    ),
  );
}

function backupSection({ store, onExport, onImport }) {
  const lastExport = store.state.lastExport;

  return el(
    "div",
    { class: "tools" },
    el("div", { class: "tools-title", text: t("tools.title") }),
    el(
      "div",
      { class: "tools-row" },
      el("button", {
        type: "button",
        class: "btn accent",
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
    lastExport
      ? el("div", {
          class: "tools-note",
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
    el("div", { class: "tools-title", text: t("settings.title") }),
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
