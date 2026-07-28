/**
 * Minimal i18n: a locale registry, a resolver, and one lookup function.
 *
 * Adding a locale is two lines — import the module and add it to LOCALES below. Nothing
 * else in the app needs to change: the language picker is built from this registry and
 * tests assert that every locale has exactly the same key set as English.
 */

import en from "./en.js";
import ptBR from "./pt-BR.js";

export const LOCALES = {
  en,
  "pt-BR": ptBR,
};

export const DEFAULT_LOCALE = "en";

let active = LOCALES[DEFAULT_LOCALE];

/** [{ tag, label }] for the language picker; each label is written in its own language. */
export function availableLocales() {
  return Object.values(LOCALES).map(({ tag, label }) => ({ tag, label }));
}

export function activeLocale() {
  return active.tag;
}

export function setLocale(tag) {
  active = LOCALES[tag] ?? LOCALES[DEFAULT_LOCALE];
  return active.tag;
}

/**
 * Picks a locale from an explicit saved choice, else the browser's preference list.
 * Matches exactly first ("pt-BR"), then by primary subtag ("pt-PT" and "pt" both reach
 * "pt-BR"), and falls back to English. Pure — callers pass navigator.languages in.
 */
export function resolveLocale(preferred = [], saved = null) {
  if (saved && Object.hasOwn(LOCALES, saved)) return saved;

  const tags = Object.keys(LOCALES);
  for (const wanted of preferred) {
    if (typeof wanted !== "string" || wanted === "") continue;
    const lower = wanted.toLowerCase();
    const exact = tags.find((tag) => tag.toLowerCase() === lower);
    if (exact) return exact;

    const primary = lower.split("-")[0];
    const byLanguage = tags.find((tag) => tag.toLowerCase().split("-")[0] === primary);
    if (byLanguage) return byLanguage;
  }
  return DEFAULT_LOCALE;
}

function lookup(strings, key) {
  let node = strings;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object" || !(part in node)) return undefined;
    node = node[part];
  }
  return node;
}

function interpolate(template, params) {
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

/**
 * Translates a dot-separated key, interpolating {placeholders} from params.
 *
 * When the entry is an object of plural categories and params.n is a number, the form is
 * chosen with Intl.PluralRules for the active locale — never with a hand-rolled
 * `n === 1` test, which is wrong in most languages.
 *
 * A key missing from the active locale falls back to English, then to the key itself, so
 * a gap shows up as visible-but-harmless text instead of a crash.
 */
export function t(key, params = {}) {
  let value = lookup(active.strings, key);
  if (value === undefined) value = lookup(LOCALES[DEFAULT_LOCALE].strings, key);
  if (value === undefined) return key;

  if (typeof value === "object" && typeof params.n === "number") {
    const category = new Intl.PluralRules(active.tag).select(params.n);
    value = value[category] ?? value.other;
  }
  if (typeof value !== "string") return key;

  return interpolate(value, params);
}

/** Ordinal for set numbers ("1st" / "1ª") — the rule belongs to each locale. */
export function ordinal(n) {
  return active.ordinal(n);
}
