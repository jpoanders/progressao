/** Entry point: collect the static DOM, start the app, register the service worker. */

import { createApp } from "./app.js";
import { createStore } from "./state.js";

const byId = (id) => document.getElementById(id);

const elements = {
  appTitle: byId("app-title"),
  appFooter: byId("app-footer"),
  context: byId("ctx-label"),
  weekLabel: byId("week-label"),
  dayLabel: byId("day-label"),
  weekSeg: byId("week-seg"),
  daySeg: byId("day-seg"),
  content: byId("content"),
  importFile: byId("import-file"),
  backupBanner: byId("backup-banner"),
  backupTitle: byId("backup-banner-title"),
  backupBody: byId("backup-banner-body"),
  backupNow: byId("backup-now"),
  backupDismiss: byId("backup-dismiss"),
  installBanner: byId("install-banner"),
  installTitle: byId("install-banner-title"),
  installBody: byId("install-banner-body"),
  installDismiss: byId("install-dismiss"),
  metaDescription: document.querySelector('meta[name="description"]'),
};

createApp({ store: createStore(), elements }).start();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // Offline support only — a failure here is not worth bothering the user about.
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
