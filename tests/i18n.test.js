import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_LOCALE,
  LOCALES,
  activeLocale,
  availableLocales,
  ordinal,
  resolveLocale,
  setLocale,
  t,
} from "../src/i18n/index.js";
import { CATALOG, GROUPS } from "../src/catalog.js";
import { DEFAULT_PLAN, planSlots } from "../src/plan.js";

const PLURAL_CATEGORIES = new Set(["zero", "one", "two", "few", "many", "other"]);

const isPluralEntry = (value) =>
  typeof value === "object" &&
  value !== null &&
  Object.keys(value).length > 0 &&
  Object.keys(value).every((key) => PLURAL_CATEGORIES.has(key));

/** Walks a locale's string tree, treating plural entries as leaves. */
function keyPaths(node, prefix = "") {
  if (typeof node === "string" || isPluralEntry(node)) return [prefix];
  return Object.entries(node).flatMap(([key, value]) =>
    keyPaths(value, prefix ? `${prefix}.${key}` : key),
  );
}

function pluralEntries(node, prefix = "") {
  if (isPluralEntry(node)) return [[prefix, node]];
  if (typeof node !== "object" || node === null) return [];
  return Object.entries(node).flatMap(([key, value]) =>
    pluralEntries(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe("locale registry", () => {
  it("ships English and Brazilian Portuguese", () => {
    assert.deepEqual(Object.keys(LOCALES).sort(), ["en", "pt-BR"]);
    assert.equal(DEFAULT_LOCALE, "en");
  });

  it("labels each locale in its own language for the picker", () => {
    assert.deepEqual(availableLocales(), [
      { tag: "en", label: "English" },
      { tag: "pt-BR", label: "Português (Brasil)" },
    ]);
  });

  it("keeps each locale's tag in sync with its registry key", () => {
    for (const [key, locale] of Object.entries(LOCALES)) {
      assert.equal(locale.tag, key);
    }
  });
});

describe("locale key parity", () => {
  const reference = keyPaths(LOCALES[DEFAULT_LOCALE].strings).sort();

  for (const tag of Object.keys(LOCALES)) {
    it(`${tag} defines exactly the same keys as ${DEFAULT_LOCALE}`, () => {
      const paths = keyPaths(LOCALES[tag].strings).sort();

      const missing = reference.filter((key) => !paths.includes(key));
      const extra = paths.filter((key) => !reference.includes(key));

      assert.deepEqual(missing, [], `${tag} is missing keys`);
      assert.deepEqual(extra, [], `${tag} has keys no other locale has`);
    });
  }

  it("names every catalog exercise and group, so none can render as a raw key", () => {
    for (const tag of Object.keys(LOCALES)) {
      const { catalog } = LOCALES[tag].strings;

      for (const exercise of CATALOG) {
        assert.equal(typeof catalog.exercises[exercise.id], "string", `${tag}: ${exercise.id}`);
      }
      for (const group of GROUPS) {
        assert.equal(typeof catalog.groups[group], "string", `${tag}: group ${group}`);
      }
    }
  });

  it("resolves every nameKey the built-in plan carries", () => {
    const keys = [DEFAULT_PLAN.nameKey, ...DEFAULT_PLAN.days.map((day) => day.nameKey)];

    for (const tag of Object.keys(LOCALES)) {
      setLocale(tag);
      for (const key of keys) {
        assert.notEqual(t(key), key, `${tag} has no string for ${key}`);
      }
    }
    setLocale(DEFAULT_LOCALE);
  });

  it("leaves the built-in plan's slots to the catalog rather than naming them twice", () => {
    for (const slot of planSlots(DEFAULT_PLAN)) {
      assert.equal(slot.name, null);
      assert.equal(slot.nameKey, null);
    }
  });
});

describe("plural entries", () => {
  for (const tag of Object.keys(LOCALES)) {
    it(`${tag} covers every plural form the language needs for realistic counts`, () => {
      const rules = new Intl.PluralRules(tag);
      // Counts the app can actually show: 0-8 sets, plus record counts when clearing.
      const needed = new Set(
        Array.from({ length: 61 }, (_, n) => rules.select(n)),
      );

      for (const [path, entry] of pluralEntries(LOCALES[tag].strings)) {
        assert.ok(entry.other, `${tag}: ${path} must define "other" as a fallback`);
        for (const category of needed) {
          assert.ok(entry[category], `${tag}: ${path} is missing the "${category}" form`);
        }
      }
    });
  }
});

describe("resolveLocale", () => {
  it("honours an explicit saved choice above the device language", () => {
    assert.equal(resolveLocale(["en-US"], "pt-BR"), "pt-BR");
    assert.equal(resolveLocale(["pt-BR"], "en"), "en");
  });

  it("ignores a saved locale that no longer exists", () => {
    assert.equal(resolveLocale(["pt-BR"], "klingon"), "pt-BR");
  });

  it("matches an exact tag", () => {
    assert.equal(resolveLocale(["pt-BR"]), "pt-BR");
    assert.equal(resolveLocale(["PT-br"]), "pt-BR", "tag matching is case-insensitive");
  });

  it("falls back to the primary language subtag", () => {
    assert.equal(resolveLocale(["pt"]), "pt-BR");
    assert.equal(resolveLocale(["pt-PT"]), "pt-BR");
    assert.equal(resolveLocale(["en-GB"]), "en");
  });

  it("walks the preference list in order", () => {
    assert.equal(resolveLocale(["fr-FR", "de", "pt-BR"]), "pt-BR");
  });

  it("falls back to English for anything unsupported", () => {
    assert.equal(resolveLocale(["fr-FR", "de"]), "en");
    assert.equal(resolveLocale([]), "en");
    assert.equal(resolveLocale(), "en");
    assert.equal(resolveLocale([null, "", 42]), "en");
  });
});

describe("t", () => {
  it("interpolates named placeholders", () => {
    setLocale("en");
    assert.equal(t("header.context", { week: 3 }), "Week 3");

    setLocale("pt-BR");
    assert.equal(t("header.context", { week: 3 }), "Semana 3");
  });

  it("picks plural forms through Intl, not a hand-rolled test", () => {
    setLocale("en");
    assert.equal(t("exercise.setCount", { n: 1 }), "1 set");
    assert.equal(t("exercise.setCount", { n: 3 }), "3 sets");

    setLocale("pt-BR");
    assert.equal(t("exercise.setCount", { n: 1 }), "1 série");
    assert.equal(t("exercise.setCount", { n: 3 }), "3 séries");
    // CLDR: Portuguese uses the singular for zero. This is exactly the kind of rule a
    // hand-rolled `n === 1` check gets wrong.
    assert.equal(t("exercise.setCount", { n: 0 }), "0 série");
  });

  it("falls back to 'other' for a category a locale does not define", () => {
    setLocale("pt-BR");
    // pt-BR has a "many" category (large numbers) that these strings do not define.
    assert.equal(new Intl.PluralRules("pt-BR").select(1e6), "many");
    assert.equal(t("exercise.setCount", { n: 1e6 }), "1000000 séries");
  });

  it("resolves exercise names from the catalog ids", () => {
    setLocale("en");
    assert.equal(
      t("catalog.exercises.bench-press"),
      "Flat bench press (barbell or dumbbells)",
    );
    assert.equal(t("plan.defaultDays.d2"), "Day 2 — Legs (quads)");

    setLocale("pt-BR");
    assert.equal(t("catalog.exercises.bench-press"), "Supino reto (barra ou halteres)");
  });

  it("falls back to English when a key is missing from the active locale", () => {
    setLocale("pt-BR");
    const original = LOCALES["pt-BR"].strings.tools.title;
    delete LOCALES["pt-BR"].strings.tools.title;
    try {
      assert.equal(t("tools.title"), "Backup");
    } finally {
      LOCALES["pt-BR"].strings.tools.title = original;
    }
  });

  it("returns the key itself rather than crashing on an unknown key", () => {
    setLocale("en");
    assert.equal(t("nope.not.here"), "nope.not.here");
    assert.equal(t("exercise"), "exercise", "a branch is not a string");
  });

  it("leaves an unknown placeholder in place instead of printing undefined", () => {
    setLocale("en");
    assert.equal(t("header.context", {}), "Week {week}");
  });
});

describe("setLocale", () => {
  it("reports the tag it settled on", () => {
    assert.equal(setLocale("pt-BR"), "pt-BR");
    assert.equal(activeLocale(), "pt-BR");
  });

  it("falls back to the default for an unknown tag", () => {
    assert.equal(setLocale("klingon"), "en");
    assert.equal(activeLocale(), "en");
  });
});

describe("ordinal", () => {
  it("uses English ordinal suffixes", () => {
    setLocale("en");
    assert.deepEqual([1, 2, 3, 4, 8, 11, 21].map(ordinal), [
      "1st",
      "2nd",
      "3rd",
      "4th",
      "8th",
      "11th",
      "21st",
    ]);
  });

  it("uses the feminine ordinal in Portuguese, agreeing with 'série'", () => {
    setLocale("pt-BR");
    assert.deepEqual([1, 2, 3].map(ordinal), ["1ª", "2ª", "3ª"]);
  });
});
