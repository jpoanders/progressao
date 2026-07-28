import { el, replaceChildren } from "./dom.js";
import { isoDateStamp } from "./format.js";
import { PLAN, RUN_DAY_ID, findDay } from "./plan.js";
import {
  clampSetCount,
  countDayEntries,
  hasCustomSetCounts,
  parseBackup,
  runHasData,
} from "./state.js";
import { resolveLocale, setLocale, t } from "./i18n/index.js";
import { renderSelectors } from "./views/selectors.js";
import { exerciseName, renderDayView } from "./views/day.js";
import { renderRunningView } from "./views/running.js";
import { renderTools } from "./views/tools.js";
import { updateBanners, wireBanners } from "./views/banners.js";

/**
 * Wires the store to the DOM.
 *
 * Rendering is deliberately whole-view: every structural change rebuilds <main> from
 * state. The DOM is a few dozen nodes and render() is never called from an input handler,
 * so there is nothing to gain from finer-grained updates — and a lot of stale-node bugs
 * to avoid.
 */
export function createApp({ store, elements }) {
  function applyLocale(tag) {
    const resolved = setLocale(tag);
    document.documentElement.lang = resolved;
    document.title = t("app.name");
    elements.metaDescription?.setAttribute("content", t("app.description"));
    return resolved;
  }

  function selectWeek(week) {
    store.setPref("week", week);
    render();
  }

  function selectDay(dayId) {
    store.setPref("day", dayId);
    render();
  }

  function changeLocale(tag) {
    store.setPref("locale", applyLocale(tag));
    render();
  }

  /** Adds or removes the last set, confirming first if that set holds data. */
  function changeSetCount(day, exercise, delta) {
    const week = store.prefs.week;
    const current = store.getSetCount(week, day.id, exercise);
    const next = clampSetCount(current + delta);
    if (next === current) return;

    if (next < current) {
      const lastIndex = current - 1;
      const hasData = Boolean(store.getEntry(week, day.id, exercise.id, lastIndex));
      const confirmed =
        !hasData ||
        window.confirm(
          t("exercise.removeSetConfirm", {
            set: current,
            exercise: exerciseName(exercise.id),
          }),
        );
      if (!confirmed) return;
      store.deleteEntry(week, day.id, exercise.id, lastIndex);
    }

    store.setSetCount(week, day.id, exercise, next);
    render();
  }

  function clearDay(day) {
    const week = store.prefs.week;
    const count = countDayEntries(store.state, week, day);

    if (count === 0 && !hasCustomSetCounts(store.state, week, day)) {
      window.alert(t("day.clearEmpty"));
      return;
    }
    const message = t("day.clearConfirm", { week, day: t(`plan.days.${day.id}`), n: count });
    if (!window.confirm(message)) return;

    store.clearDay(week, day);
    render();
  }

  function clearRun(week) {
    if (!runHasData(store.getRun(week))) {
      window.alert(t("run.clearEmpty"));
      return;
    }
    if (!window.confirm(t("run.clearConfirm", { week }))) return;

    store.deleteRun(week);
    render();
  }

  function exportBackup() {
    store.markExported();

    const blob = new Blob([JSON.stringify(store.state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = el("a", { href: url, download: `progression-backup-${isoDateStamp()}.json` });

    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    render(); // refreshes the "last backup" note and clears the reminder banner
  }

  function openImportPicker() {
    elements.importFile.click();
  }

  function handleImportFile(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = parseBackup(String(reader.result));
        if (!window.confirm(t("tools.importConfirm"))) {
          input.value = "";
          return;
        }
        store.replaceState(imported);
        render();
        window.alert(t("tools.importDone"));
      } catch {
        window.alert(t("tools.importInvalid", { app: t("app.name") }));
      }
      input.value = "";
    };
    reader.onerror = () => {
      window.alert(t("tools.readError"));
      input.value = "";
    };
    reader.readAsText(file);
  }

  function render() {
    const { week, day: dayId } = store.prefs;
    const isRunDay = dayId === RUN_DAY_ID;
    // An unknown day id (hand-edited prefs, older build) falls back to the first day.
    const day = isRunDay ? null : (findDay(dayId) ?? PLAN[0]);

    elements.appTitle.textContent = t("app.name");
    elements.appFooter.textContent = t("app.footer", { app: t("app.name") });
    elements.context.textContent = isRunDay
      ? t("header.contextRun", { week })
      : t("header.context", { week });

    renderSelectors({
      elements,
      prefs: store.prefs,
      onSelectWeek: selectWeek,
      onSelectDay: selectDay,
    });

    const view = isRunDay
      ? renderRunningView({ store, week, onClearRun: clearRun })
      : renderDayView({
          store,
          week,
          day,
          onChangeSetCount: changeSetCount,
          onClearDay: clearDay,
        });

    replaceChildren(
      elements.content,
      view,
      renderTools({
        store,
        onExport: exportBackup,
        onImport: openImportPicker,
        onLocaleChange: changeLocale,
      }),
    );

    updateBanners({ elements, store });
    window.scrollTo(0, 0);
  }

  function start() {
    const preferred = navigator.languages ?? [navigator.language];
    // Resolved but not persisted: without an explicit choice the app keeps following the
    // device language.
    applyLocale(resolveLocale(preferred, store.prefs.locale));

    wireBanners({
      elements,
      onExport: exportBackup,
      onDismissBackup: () => {
        store.setPref("backupDismissedAt", Date.now());
        updateBanners({ elements, store });
      },
      onDismissInstall: () => {
        store.setPref("installDismissed", true);
        updateBanners({ elements, store });
      },
    });

    elements.importFile.addEventListener("change", handleImportFile);
    render();
  }

  return { start, render };
}
