import { el, fragment } from "../dom.js";
import { formatDateTime } from "../format.js";
import { activeLocale, availableLocales, t } from "../i18n/index.js";

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

/** Backup and settings, shown at the bottom of every view. */
export function renderTools({ store, onExport, onImport, onLocaleChange }) {
  return fragment(
    backupSection({ store, onExport, onImport }),
    settingsSection({ onLocaleChange }),
  );
}
