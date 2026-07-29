# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test                              # node --test — the whole suite (no deps installed)
node --test tests/state.test.js       # one file
node --test --test-name-pattern="previous"   # one suite/test by name
npm run serve                         # python3 -m http.server 8080
```

There is no build, no lint step, and no `node_modules`. Deployment is `git push` — GitHub
Pages serves the repo root of `main`.

The app must be served over HTTP (`localhost` is fine); ES modules and the service worker
do not work from `file://`, and a LAN IP is not a secure context so the SW will not
register there.

## Constraints that shape everything

- **No dependencies, no build step, no framework.** Native ES modules loaded directly by
  the browser. Do not introduce a bundler, a package, or a transpile step — the service
  worker's precache is a hand-maintained file list, which only works because the shipped
  files *are* the source files.
- **Mobile Safari is the target.** Prefer conservative DOM APIs (`src/dom.js` routes
  `role`/hyphenated keys through `setAttribute` for that reason).

## Two things break silently if you forget them

1. **Adding or renaming any file under `src/`, `styles/`, `icons/`, or `fonts/` requires
   updating `SHELL` in `sw.js`.** `cache.addAll()` is atomic — one wrong path leaves the app
   entirely uncached. `tests/service-worker.test.js` fails on both a missing and a stale
   entry, so run the tests. `sw.js` is a classic script, not a module, and uses single
   quotes — the test parses `SHELL` with a single-quote regex, so keep them.
2. **Changing any shipped file requires bumping `CACHE_VERSION` in `sw.js`,** or installed
   devices keep serving the old cache forever. The bump has a second half: the last line of
   `tests/service-worker.test.js` asserts the version is not the *previous* literal, so move
   that literal forward too — the assertion names the version you are replacing, so it has to
   change in the same commit.

## Architecture

`src/main.js` collects the static DOM from `index.html` into an `elements` object and
hands it plus a store to `createApp`. `index.html` holds only the shell (header, banner
markup, empty `<main id="content">`); everything inside `<main>` is built in JS.

Three layers, one direction of dependency:

- **Pure logic** — `plan.js`, `state.js` (helpers), `format.js`, `catalog.js`, `progress.js`,
  `i18n/`. No DOM. This is what the tests cover.
- **Store** — `createStore(storage)` in `state.js` wraps a Storage-like object; tests
  inject a fake. Every mutator writes through immediately (there is no save button).
- **Views** — `views/*` are pure builders: they take state + callbacks and return DOM
  nodes. Actions go through the callbacks `app.js` passes in, with one deliberate
  exception: `views/day.js` calls `store.setEntryField` itself, because a keystroke has to
  write through *without* a `render()` and `app.js` owns `render()`. Everything else —
  confirmations, destructive actions, navigation — is `app.js`'s.

There are no DOM tests and there cannot be: `node --test` runs without a DOM, and jsdom
would be a dependency. So `views/*`, `dom.js`, `app.js` and `main.js` are checked by hand
in the browser (`npm run serve`) — which is the reason to keep anything decidable out of
them and in the pure layer, where a test can reach it.

Rendering is **whole-view**: any structural change rebuilds `<main>` from state via
`render()`. Do not add fine-grained DOM patching — the tree is small and this rules out
stale-node bugs. `render()` is deliberately not called from text-input handlers
(`views/fields.js` writes through on every keystroke and re-reads on blur).

Two conventions the whole-view rebuild depends on: each screen's heading carries
`class="screen-title"` with `tabIndex: -1`, because `render()` moves focus there when the
screen changes (without it a keyboard user is stranded); and static markup in `index.html`
is reachable only through the `elements` map in `main.js`, so a new static node means
editing both.

Screen state (`"log" | "plans" | "editor" | "exercises"`) lives in a closure variable in
`app.js` and is never persisted. The plan editor works on a **copy** (`draft`) and commits on
Done — the one place in the app where edits are not saved immediately.

### The data model

Two localStorage keys: `progression:v2` (the log, including plans and the user's own
exercises — it is user data, so it belongs in the backup) and `progression:ui` (disposable
preferences). Header comments in `src/state.js` and `src/plan.js` document the schema; keep
them accurate.

Records are keyed `<planId>|<week>|<slotId>|<setIndex>`. Three invariants follow, and most
of the state code exists to preserve them:

- **A *slot* — one placement of an exercise on a day — owns the history, not the exercise.**
  So renaming a day, reordering, or repeating an exercise on a day never disturbs records.
  Only removing a slot, dropping a day, or shortening a block discards them, and `app.js`
  reports the count (`countOrphans`) before it happens.
- **Stored records never cross plans; the *lookup* does, once.** Every key starts with a
  plan id and no mutator leaves the plan it was asked about. `findPrevious` is the single
  exception: it prefers the slot's own earlier weeks in the same plan, and only when there
  are none falls back to the same exercise and set index in *another* plan, so week 1 of a
  new block still shows a target to beat. The fallback never reads the plan being viewed —
  one plan may place the same exercise twice on purpose. The cross-plan index
  (`newestByExercise`) is a projection, memoized in the store and dropped on every write.
- **State is self-consistent.** `normalizeState`/`normalizePlan` repair anything read from
  storage or an imported backup and prune records that fit nowhere; they never throw.
  Any new field must be handled there, or it will be silently dropped on the next load.

Preferences hold ids that can go stale. They are resolved at render time in `app.js`
(`activePlan`/`activeDay`/`activeWeek`) with a fallback — do not add defensive id checks at
each call site.

**There may be no plans at all.** A fresh install starts empty and the last plan can be
deleted, so `activePlan()` returns undefined and `render()` passes `plan`/`week`/`day` as
null. Plans is the landing screen and the only one reachable in that state (the log screen
is entered by using a plan, and its Back button is withheld when there is none), but any
new screen has to hold up with nothing selected.

### i18n

No user-facing literal strings in view code — including `aria-label`s, placeholders, and
`confirm()`/`alert()` text. Everything goes through `t("dot.separated.key")` from
`src/i18n/index.js`.

- Plurals: pass `{ n }` and give the key an object of `Intl.PluralRules` categories. Never
  hand-write `n === 1`.
- Ordinals are a per-locale function (`ordinal()`), not a format string.
- Number *input* is deliberately locale-independent: `parseNumber` always accepts a comma
  as decimal separator.

Adding a locale: copy `src/i18n/en.js`, translate, import it and add one entry to `LOCALES`
in `src/i18n/index.js`, then add the file to `SHELL` in `sw.js`. The picker is built from
the registry. `tests/i18n.test.js` enforces exact key parity with English (the reference
locale) and that every catalog exercise has a name in every language.

### Exercises come from two places

`CATALOG` in `src/catalog.js` is the shipped list; the user's own exercises live in the log
(`state.exercises`) and reach the lookup through `makeLookup`. `kind` decides which fields a
set logs (`strength` → kg/reps, `cardio` → dist/time), and those two are the only kinds a
user may pick — a third needs new `ENTRY_FIELDS`, `INTEGER_FIELDS` handling and
`exercise.columns`/`pair`/`fields` keys in every locale.

To add a *shipped* exercise: append to `CATALOG` and add its name under
`catalog.exercises.<id>` in every locale. Ids are written into user plans, so **additions
are cheap and renames break existing data**. Keep `CATALOG` the shipped list only —
`tests/i18n.test.js` iterates it to demand a translation per id, which a name the user typed
can never have.

**Two lookups, and the difference matters.** Anything that can *delete* takes
`makeLookup(exercises)` as an argument — `normalizeState`, `normalizePlan`, `normalizeEntry`
— because `normalizeSlot` drops a slot whose exercise it cannot resolve and the records go
with it, so the list has to be the one that arrived with the state. `parseBackup` normalizes
a candidate file *before* the user confirms the import (`app.js:205`), so a module-level list
written during normalization would survive a cancelled import and the next plan edit would
delete every custom slot. Views and labels use the module registry instead
(`findExercise`/`byGroup`/`entryFields`/`exerciseKind`/`exerciseLabel`/`searchExercises`),
installed by the store in `saveState()`: threading a lookup to every leaf of `day.js` would
buy nothing, and a stale registry only mislabels.

## Style

Modules and non-obvious functions carry a short comment explaining *why*, not what —
match that density rather than commenting every line or none. Double quotes, semicolons,
2-space indent, ~100 column lines. Tests use `node:test`'s `describe`/`it` with
`node:assert/strict`, and their names read as sentences ("keeps the session usable instead
of throwing").

`styles/app.css` states its own rule in its header and means it: the gain badge (`--gain`)
is the only colour the design *spends*. Primary buttons are a solid ink fill, never a
coloured one; `--focus` is only ever an outline and `--danger` only ever text and a border.
New UI stays inside that.

## Out of scope (by decision, not omission)

No charts, volume stats, progression maths, accounts, cloud sync, or timers. See the end of
`README.md`.
