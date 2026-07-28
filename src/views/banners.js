import { t } from "../i18n/index.js";

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Running from the home screen (iOS uses a non-standard flag). */
export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

/** iPadOS reports itself as MacIntel, hence the touch-point check. */
export function isIOS() {
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** One-time wiring of the banner buttons; the text is refreshed on every render. */
export function wireBanners({ elements, onExport, onDismissBackup, onDismissInstall }) {
  elements.backupNow.addEventListener("click", onExport);
  elements.backupDismiss.addEventListener("click", onDismissBackup);
  elements.installDismiss.addEventListener("click", onDismissInstall);
}

/**
 * Backup reminder: shown once there is data to lose, the last export is over a week old,
 * and the reminder has not been dismissed within the last week.
 *
 * Install hint: iOS only, and only outside standalone mode — installing is what keeps
 * WebKit from evicting localStorage after ~7 days of not opening the site.
 */
export function updateBanners({ elements, store, now = Date.now() }) {
  const { state, prefs } = store;

  elements.backupTitle.textContent = t("banner.backupTitle");
  elements.backupBody.textContent = t("banner.backupBody");
  // Same action as the Backup section below, so it carries the same name.
  elements.backupNow.textContent = t("tools.export");
  elements.backupDismiss.setAttribute("aria-label", t("banner.dismissAria"));

  elements.installTitle.textContent = t("banner.installTitle");
  elements.installBody.textContent = t("banner.installBody");
  elements.installDismiss.setAttribute("aria-label", t("banner.dismissAria"));

  const overdue = !state.lastExport || now - state.lastExport > WEEK_MS;
  const hasData = Object.keys(state.entries).length > 0;
  const dismissedRecently = now - prefs.backupDismissedAt < WEEK_MS;
  elements.backupBanner.classList.toggle("hidden", !(overdue && hasData && !dismissedRecently));

  const showInstall = isIOS() && !isStandalone() && !prefs.installDismissed;
  elements.installBanner.classList.toggle("hidden", !showInstall);
}
