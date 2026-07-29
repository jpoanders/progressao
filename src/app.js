import { el, fragment, replaceChildren } from "./dom.js";
import { isoDateStamp } from "./format.js";
import { clampSets, clonePlan, displayName, findDay, newPlan, slotName } from "./plan.js";
import {
  countDayEntries,
  countOrphans,
  countPlanEntries,
  hasCustomSetCounts,
  parseBackup,
} from "./state.js";
import { resolveLocale, setLocale, t } from "./i18n/index.js";
import { renderSelectors } from "./views/selectors.js";
import { dayTitle, renderDayView } from "./views/day.js";
import { renderPlansView } from "./views/plans.js";
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
    const message = t("day.clearConfirm", { week, day: dayTitle(plan, day), n: count });
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

  function createPlan() {
    // Nothing is stored until the editor is done, so abandoning a new plan leaves no
    // half-built entry behind in the library.
    draft = newPlan(t("plans.newName"));
    goTo("editor");
  }

  function editPlan(plan) {
    draft = clonePlan(plan);
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
    render(); // a now-stale prefs.planId resolves to the first plan on the way through
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
    draft = null;
    goTo("plans");
  }

  // ── Backup ─────────────────────────────────────────────────────────────────────────

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
    return t("header.context", { week });
  }

  function currentView(plan, week, day) {
    if (screen === "editor") {
      return renderPlanEditor({ draft, onChange: render, onDone: savePlan });
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
        onEditPlan: editPlan,
      }),
      renderTools({
        store,
        plan,
        onManagePlans: () => goTo("plans"),
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
    if (screen !== lastScreen) {
      if (lastScreen !== null) elements.content.querySelector(".screen-title")?.focus();
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
