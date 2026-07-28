/**
 * Number parsing and display formatting.
 *
 * Pure module: no DOM, no storage, no i18n import. The active locale tag is passed in by
 * the caller so this stays testable under `node --test`.
 */

/**
 * Tolerant parse of whatever the user typed into a numeric field.
 *
 * Deliberately locale-independent: a comma is always accepted as a decimal separator and
 * any other junk is stripped, because phone keyboards differ and the user may be typing
 * in either locale. Returns a finite number, or null when there is nothing usable.
 */
export function parseNumber(raw) {
  if (raw == null) return null;
  const cleaned = String(raw).replace(",", ".").replace(/[^0-9.]/g, "");
  if (cleaned === "" || cleaned === ".") return null;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Formats a stored number for display, avoiding float artifacts.
 * Integer fields (reps, cycles) round to whole numbers; the rest keep one decimal.
 * Returns "" for missing values so it can be assigned straight to an input value.
 */
export function formatNumber(value, { integer = false } = {}) {
  if (value == null || !Number.isFinite(value)) return "";
  if (integer) return String(Math.round(value));
  return String(Math.round(value * 10) / 10);
}

/** Date + time of the last backup, in the active locale. */
export function formatDateTime(timestamp, localeTag) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString(localeTag);
  const time = date.toLocaleTimeString(localeTag, { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time}`;
}

/**
 * YYYY-MM-DD stamp used in the exported backup filename.
 *
 * Uses local date parts, not toISOString(): west of UTC an evening export would otherwise
 * be stamped with tomorrow's date.
 */
export function isoDateStamp(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
