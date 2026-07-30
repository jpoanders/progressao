import { el, fragment, replaceChildren } from "./dom.js";
import { formatDateTime, isoDateStamp } from "./format.js";
import { clampSets, clonePlan, dayLabel, displayName, findDay, newPlan, slotName } from "./plan.js";
import {
  countDayEntries,
  countExerciseUse,
  countOrphans,
  countPlanEntries,
  hasCustomSetCounts,
  parseBackup,
  summarizeState,
} from "./state.js";
import { activeLocale, resolveLocale, setLocale, t } from "./i18n/index.js";
import { renderSelectors } from "./views/selectors.js";
import { renderDayView } from "./views/day.js";
import { renderPlansView } from "./views/plans.js";
import { renderExercises } from "./views/exercises.js";
import { renderPlanEditor } from "./views/planEditor.js";
import { renderTools } from "./views/tools.js";
import { updateBanners, wireBanners } from "./views/banners.js";

/**
 * Wires the store to the DOM.
 *
 * Rendering is deliberately whole-view: every structural change rebuilds <main> from
 * state. The DOM is a few dozen nodes and render() is never called from a text input's
 * handler, so there is nothing to gain from finer-grained updates — and a lot of
 * stale-node bugs to avoid.
 *
 * Three screens share that one <main>: the training log, the plan library, and the plan
 * editor. Which one is showing is in-memory only, never persisted — reopening the app in
 * the editor would be exactly wrong halfway through a session at the gym.
 */
export function createApp({ store, elements }) {
  let screen = "plans";
  /** The plan being edited: a copy, so abandoning the editor changes nothing. */
  let draft = null;
  /**
   * Where Done returns to, and which day the editor was opened on — both set when it opens.
   * The editor is reachable from Plans and from the day you are looking at, and being put
   * down on Plans when you arrived mid-session from the log is the wrong place to land.
   */
  let editor = { returnTo: "plans", dayId: null };
  /**
   * Which day's exercise picker is open, and what has been typed into its filter. Where you
   * are looking rather than part of the plan, so it lives here beside `screen` and never
   * reaches the draft. Only one picker is open at a time, so one query is enough.
   */
  let picker = { dayId: null, query: "" };
  /**
   * Where Back from the exercises screen returns to. It is reachable from Plans and from the
   * training view's tools, and landing somewhere other than where you came from is exactly
   * the wart docs/roadmap.md notes about the plan editor — not worth adding a second one.
   */
  let exercisesReturn = "plans";
  /** Last rendered position, so only real navigation scrolls back to the top. */
  let lastAnchor = null;
  /** Last rendered screen, so only a screen change moves focus. */
  let lastScreen = null;

  /**
   * Preferences hold ids, not references, and an id can go stale — a plan deleted, a day
   * removed, a backup imported over the top. Everything is resolved here, at render time,
   * with a fallback, rather than being defended against at each use.
   */
  const activePlan = () => store.findPlan(store.prefs.planId) ?? store.plans[0];
  const activeDay = (plan) => findDay(plan, store.prefs.day) ?? plan.days[0];
  const activeWeek = (plan) => Math.min(Math.max(store.prefs.week, 1), plan.weeks);

  const planLabel = (plan) => displayName(plan) || t("plans.untitled");

  function applyLocale(tag) {
    const resolved = setLocale(tag);
    document.documentElement.lang = resolved;
    document.title = t("app.name");
    elements.metaDescription?.setAttribute("content", t("app.description"));
    return resolved;
  }

  function goTo(next) {
    screen = next;
    render();
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
  function changeSetCount(slot, delta) {
    const plan = activePlan();
    const week = activeWeek(plan);
    const current = store.getSetCount(plan.id, week, slot);
    const next = clampSets(current + delta);
    if (next === current) return;

    if (next < current) {
      const lastIndex = current - 1;
      const hasData = Boolean(store.getEntry(plan.id, week, slot.id, lastIndex));
      const confirmed =
        !hasData ||
        window.confirm(
          t("exercise.removeSetConfirm", { set: current, exercise: slotName(slot) }),
        );
      if (!confirmed) return;
      store.deleteEntry(plan.id, week, slot.id, lastIndex);
    }

    store.setSetCount(plan.id, week, slot, next);
    render();
  }

  function clearDay(day) {
    const plan = activePlan();
    const week = activeWeek(plan);
    const count = countDayEntries(store.state, plan.id, week, day);

    if (count === 0 && !hasCustomSetCounts(store.state, plan.id, week, day)) {
      window.alert(t("day.clearEmpty"));
      return;
    }
    const message = t("day.clearConfirm", { week, day: dayLabel(plan, day), n: count });
    if (!window.confirm(message)) return;

    store.clearDay(plan.id, week, day);
    render();
  }

  // ── Plans ──────────────────────────────────────────────────────────────────────────

  function usePlan(plan) {
    store.setPref("planId", plan.id);
    store.setPref("day", plan.days[0].id);
    store.setPref("week", 1);
    goTo("log");
  }

  /**
   * Opening or closing the picker is a structural change and needs a render; typing into its
   * filter must not have one, or the rebuild would take the keyboard away mid-word. Same
   * split the editor already makes between its steppers and its text inputs.
   */
  function setPicker(next) {
    const opened = next.dayId !== picker.dayId;
    picker = next;
    if (opened) render();
  }

  /**
   * Creating one is reported back so the form can clear its field only on success — the view
   * has no way to know whether the name it was given was usable.
   */
  function manageExercises(from) {
    exercisesReturn = from;
    goTo("exercises");
  }

  function createExercise({ name, group, kind }) {
    if (!store.addExercise({ name, group, kind })) {
      window.alert(t("exercises.nameRequired"));
      return false;
    }
    render();
    return true;
  }

  function renameExercise(exercise, name) {
    if (!store.renameExercise(exercise.id, name)) window.alert(t("exercises.nameRequired"));
    // Rendered either way: on success to pick the new name up everywhere it shows, and on
    // failure to put back the name the input has just been cleared of.
    render();
  }

  /**
   * Deleting one takes every slot placing it and every record on those, so it says how much
   * before it does it — the same contract savePlan and deletePlan already keep.
   */
  function deleteExercise(exercise) {
    const { slots, plans, records } = countExerciseUse(store.state, exercise.id);
    const message =
      slots === 0
        ? t("exercises.removeConfirmUnused", { exercise: exercise.name })
        : t("exercises.removeConfirm", { exercise: exercise.name, slots, plans, n: records });

    if (!window.confirm(message)) return;
    store.deleteExercise(exercise.id);
    render();
  }

  function createPlan() {
    // Nothing is stored until the editor is done, so abandoning a new plan leaves no
    // half-built entry behind in the library.
    draft = newPlan(t("plans.newName"));
    picker = { dayId: null, query: "" };
    // A plan that does not exist yet has no day to have come from.
    editor = { returnTo: "plans", dayId: null };
    goTo("editor");
  }

  /** `dayId` is the day to land on — the log screen passes the one you were looking at. */
  function editPlan(plan, { returnTo = "plans", dayId = null } = {}) {
    draft = clonePlan(plan);
    picker = { dayId: null, query: "" };
    editor = { returnTo, dayId };
    goTo("editor");
  }

  function duplicatePlan(plan) {
    store.duplicatePlan(plan.id, t("plans.copyName", { name: planLabel(plan) }));
    render();
  }

  function deletePlan(plan) {
    const records = countPlanEntries(store.state, plan.id);
    const message =
      records > 0
        ? t("plans.removeConfirm", { plan: planLabel(plan), n: records })
        : t("plans.removeConfirmEmpty", { plan: planLabel(plan) });
    if (!window.confirm(message)) return;

    store.deletePlan(plan.id);
    render(); // a now-stale prefs.planId resolves to the first remaining plan, or nothing if none are left
  }

  /**
   * Commits the draft. Every edit made in the editor lands at once, so this is the single
   * point where the user is told what the change costs: reordering and renaming are free,
   * but removing a day or shortening a block takes records with it.
   */
  function savePlan() {
    const orphans = countOrphans(store.state, draft);
    if (orphans > 0 && !window.confirm(t("planEditor.dropRecordsConfirm", { n: orphans }))) {
      return;
    }

    const saved = store.updatePlan(draft);
    if (store.prefs.planId === saved.id && !findDay(saved, store.prefs.day)) {
      store.setPref("day", saved.days[0].id);
    }
    const returnTo = editor.returnTo;
    draft = null;
    picker = { dayId: null, query: "" };
    editor = { returnTo: "plans", dayId: null };
    goTo(returnTo);
  }

  // ── Backup ─────────────────────────────────────────────────────────────────────────

  /**
   * Stamped after the file has been produced, not before: the stamp is what silences the
   * reminder banner, so stamping first meant a Blob or object-URL failure left the banner quiet
   * with nothing downloaded. A synthetic anchor cannot report whether the browser accepted the
   * download, so reaching the click is as close to "on success" as this path gets.
   *
   * The file still carries the moment it was written rather than the previous export, so
   * restoring a fresh backup does not land on a device that thinks it is overdue — hence the
   * one `now` shared by the serialized copy and the stamp.
   */
  function exportBackup() {
    const now = Date.now();
    const backup = { ...store.state, lastExport: now };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = el("a", { href: url, download: `progression-backup-${isoDateStamp()}.json` });

    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    store.markExported(now);
    render(); // refreshes the "last backup" note and clears the reminder banner
  }

  function openImportPicker() {
    elements.importFile.click();
  }

  /**
   * What restoring costs, said before the tap that does it. Both sides are countable here because
   * parseBackup has already normalized the candidate — the file's own numbers are never trusted.
   *
   * Assembled line by line rather than from one template per case: a file the app did not stamp
   * has no date to show, and a device with nothing on it is not being warned about a loss, which
   * as whole templates would be four of them in every locale.
   */
  function importMessage(deviceState, fileState) {
    const counts = (state) => {
      const { plans, records } = summarizeState(state);
      return {
        plans: t("plans.planCount", { n: plans }),
        records: t("plans.recordCount", { n: records }),
      };
    };

    // A plan with no records still has something to lose, so it gets the warning.
    const { plans, records } = summarizeState(deviceState);
    const empty = plans === 0 && records === 0;

    const lines = empty
      ? [t("tools.importEmptyDevice"), "", t("tools.importFileOnly", counts(fileState))]
      : [
          t("tools.importReplaces"),
          "",
          t("tools.importCurrent", counts(deviceState)),
          t("tools.importFile", counts(fileState)),
        ];

    if (fileState.lastExport) {
      const when = formatDateTime(fileState.lastExport, activeLocale());
      lines.push(t("tools.importDate", { when }));
    }
    lines.push("", empty ? t("tools.importRestore") : t("tools.importContinue"));

    return lines.join("\n");
  }

  function handleImportFile(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = parseBackup(String(reader.result));
        if (!window.confirm(importMessage(store.state, imported))) {
          input.value = "";
          return;
        }
        store.replaceState(imported);
        screen = "plans";
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

  // ── Rendering ──────────────────────────────────────────────────────────────────────

  function contextText(week) {
    if (screen === "plans") return t("header.contextPlans");
    if (screen === "editor") return t("header.contextEditor");
    if (screen === "exercises") return t("header.contextExercises");
    return t("header.context", { week });
  }

  function currentView(plan, week, day) {
    if (screen === "editor") {
      return renderPlanEditor({
        draft,
        picker,
        focusDayId: editor.dayId,
        onPicker: setPicker,
        onChange: render,
        onDone: savePlan,
      });
    }
    if (screen === "exercises") {
      return renderExercises({
        store,
        onCreate: createExercise,
        onRename: renameExercise,
        onDelete: deleteExercise,
        onBack: () => goTo(exercisesReturn),
      });
    }

    if (screen === "plans") {
      return renderPlansView({
        store,
        activePlanId: plan?.id ?? null,
        onUse: usePlan,
        onEdit: editPlan,
        onDuplicate: duplicatePlan,
        onDelete: deletePlan,
        onCreate: createPlan,
        onManageExercises: () => manageExercises("plans"),
        onBack: plan ? () => goTo("log") : null,
      });
    }
    return fragment(
      renderDayView({
        store,
        plan,
        week,
        day,
        onChangeSetCount: changeSetCount,
        onClearDay: clearDay,
        onEditDay: (fromDay) => editPlan(plan, { returnTo: "log", dayId: fromDay.id }),
      }),
      renderTools({
        store,
        plan,
        onManagePlans: () => goTo("plans"),
        onManageExercises: () => manageExercises("log"),
        onExport: exportBackup,
        onImport: openImportPicker,
        onLocaleChange: changeLocale,
      }),
    );
  }

  function render() {
    const plan = activePlan();
    const week = plan ? activeWeek(plan) : null;
    const day = plan ? activeDay(plan) : null;

    elements.appTitle.textContent = t("app.name");
    elements.appFooter.textContent = t("app.footer", { app: t("app.name") });
    elements.context.textContent = contextText(week);

    // The week and day chips belong to the training log; the other screens are not
    // scoped to a week, and leaving the chips up would invite tapping them.
    const isLog = screen === "log";
    elements.selectors.classList.toggle("hidden", !isLog);
    if (isLog) {
      renderSelectors({
        elements,
        store,
        plan,
        week,
        dayId: day.id,
        onSelectWeek: selectWeek,
        onSelectDay: selectDay,
      });
    }

    replaceChildren(elements.content, currentView(plan, week, day));
    updateBanners({ elements, store });

    // Only real navigation jumps back to the top: a stepper re-render must leave the
    // page where the thumb left it.
    const anchor = `${screen}|${plan?.id ?? "none"}|${week ?? ""}|${day?.id ?? ""}`;
    if (anchor !== lastAnchor) {
      window.scrollTo(0, 0);
      lastAnchor = anchor;
    }

    // Changing screen replaces everything under <main>, which leaves a keyboard or screen
    // reader user stranded at the top of the document. Moving to the new heading tells
    // them where they landed. Not done on every render: a stepper tap must not steal
    // focus from the input the thumb is in.
    //
    // The editor prefers the day card you arrived on, which is also how it gets scrolled
    // to — focus() brings its element into view, and this runs after the scrollTo above, so
    // the card wins. Focusing the heading as well would snap the page back to the top.
    // The selector is compound on purpose: .card--active alone also marks the plan in use.
    if (screen !== lastScreen) {
      if (lastScreen !== null) {
        const target =
          elements.content.querySelector(".card--day.card--active") ??
          elements.content.querySelector(".screen-title");
        target?.focus();
      }
      lastScreen = screen;
    }
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
