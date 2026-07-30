# Progression

Lightweight web app (PWA) for logging strength-training loads and reps, built for phone
use in the gym. It does one thing well: when you open an exercise, you see **what you did
last time** on that same exercise — the target to beat — so you can add load.

**Plans are yours to build.** A plan sets how many weeks the block runs, how many days it
has, and which exercises sit on each day with what sets and rep range — all editable in
the app. Keep several plans side by side. Each keeps its own history, but a lift you have logged
before still shows its last numbers in a new block — so starting a fresh plan does not
start from nothing. Exercises come from a built-in catalog, and you can define your
own for anything it does not have. The app opens on the Plans screen, and a fresh install has
no plans until you create one there.

Interface available in **English** and **Português (Brasil)**, switchable in the app.

**Live app:** https://jpoanders.github.io/progression/

---

## Installing as a PWA on iPhone (required on iOS, via Safari)

iOS does **not** show an automatic install prompt — the app has an in-app reminder, but
the step is manual:

1. Open **https://jpoanders.github.io/progression/** in **Safari** (only Safari can install
   a PWA on iOS).
2. Tap **Share** (the square with an arrow pointing up).
3. Choose **"Add to Home Screen"**.
4. Launch it from the home-screen icon — it runs full screen, without Safari's chrome,
   respecting the notch/Dynamic Island and the home indicator, and **works offline** (the
   service worker caches the app on first visit).

On Android/Chrome, use the menu → "Install app" / "Add to Home screen".

## Running locally

The app is plain static files. The only requirement is serving over HTTP — service workers
and ES modules do not work from `file://`; `localhost` is fine:

```bash
cd progression
python3 -m http.server 8080   # or: npm run serve
```

Open `http://localhost:8080`. To approximate a phone, use the browser's device mode
(Chrome: `Ctrl/Cmd+Shift+M`).

Any static server works the same (`npx serve`, Nginx, GitHub Pages, …).

> Note: service workers require a secure context (HTTPS or `localhost`). Opening the app
> via the machine's LAN address (e.g. `http://192.168.0.7:8080`) will **not** register the
> service worker — the UI works, but without offline support or installation. For a full
> PWA on another device, use the public URL above or an HTTPS tunnel.

## Tests

```bash
npm test        # or: node --test
```

Node's built-in test runner — **no dependencies are installed and none are shipped**. The
tests cover the pure logic: number parsing and formatting, the plan model and its repair
of malformed data, the previous-record lookup, set counts, state normalization and the
cascading deletes that keep records consistent with the plan, backup import validation,
locale resolution, and translation key parity between locales (including that every
catalog exercise has a name in every language). They also assert that `sw.js` precaches
every shipped file, so
adding a module without updating the service worker fails the build rather than silently
breaking offline mode.

## Publishing (GitHub Pages)

The app is served by GitHub Pages from the root of the `main` branch of
`jpoanders/progression`. To publish updates:

```bash
git push
```

Pages rebuilds in about a minute. **When you change any shipped file, bump
`CACHE_VERSION` in `sw.js`**, otherwise devices that already installed the app keep
serving the old cache.

---

## Technical decisions

### Stack: vanilla HTML + CSS + JavaScript, no build step
No framework, no bundler, no dependencies. The app is small and the requirement is that it
runs as static files with no backend. With no build step there is nothing to compile,
install or keep up to date, and the service worker stays trivial (a fixed file list).
Fewer moving parts means more reliable offline behaviour.

The code is split into native ES modules rather than kept in one file. That costs a few
extra requests on the very first visit — after which the service worker has precached
everything — and buys module boundaries, unit-testable pure logic, and files small enough
to hold in your head.

```
index.html              static shell: <head>, header, banner markup, <main>, footer
styles/app.css          all styling, including the dark-mode palette and safe-area insets
src/main.js             entry point: collects the DOM, starts the app, registers the SW
src/app.js              orchestration: rendering and the destructive/IO actions
src/state.js            persistence, the storage schema, and pure state helpers
src/plan.js             the Plan model: factories and repair
src/catalog.js          the exercise catalog plans are built from
src/format.js           number parsing and locale-aware display formatting
src/dom.js              a small element builder
src/views/              view builders (selectors, day, plans, planEditor, exercises, tools, banners, fields)
src/i18n/               locale registry, t(), and one module per language
sw.js                   service worker: precaches the shell, serves cache-first
icons/                  PNG icons (180 for iOS, 192/512 and 512 maskable for the manifest)
tests/                  node --test suites
```

### Internationalization
All user-facing text lives in `src/i18n/<locale>.js`; view code contains no literal
strings, including `aria-label`s, placeholders and confirmation dialogs.

- Plural forms come from `Intl.PluralRules`, never a hand-written `n === 1` check — which
  is wrong in most languages, including Portuguese, where zero takes the singular.
- Ordinals ("1st" / "1ª") are a per-locale function, since the rule differs by language.
- Dates use the active locale via `Intl`. Number *input* stays locale-independent: a comma
  is always accepted as a decimal separator, because phone keyboards vary.
- The language is resolved from `navigator.languages` on first run and falls back to
  English. An explicit choice (Settings, at the bottom of any screen) is remembered and
  wins from then on. Switching re-renders immediately — it never touches training data.

**To add a locale:** copy `src/i18n/en.js`, translate it, then import it and add one entry
to `LOCALES` in `src/i18n/index.js`. The language picker is built from that registry, so
there is no UI to update. `tests/i18n.test.js` will fail if any key is missing, extra, or
lacking a plural form the language requires. Add the new file to `SHELL` in `sw.js`.

`manifest.webmanifest` cannot be localized — it is static JSON read before the app runs,
and its `name` is what iOS shows under the home-screen icon. It stays English-only.

### Persistence: `localStorage`
The data volume is tiny (a block is a few weeks × a few days × ~6 exercises × ~3 sets × 2
numbers). At that size `localStorage` is the right call: a synchronous API, simple code, no
async state to get wrong, and the whole state is a single JSON object — which makes
export/import trivial. IndexedDB would be overkill.

Saving is **automatic**: every field edit is written immediately. There is no save button.
The plan editor is the one exception: it works on a copy and commits on **Done**, so a
half-finished edit never becomes your plan.

### The storage schema
Two top-level keys: `progression:v2` (the training log, including your plans and your own
exercises) and
`progression:ui` (preferences — which plan, week and day you were on, and your language).
Losing the second one loses nothing.

Records are keyed `<planId>|<week>|<slotId>|<setIndex>`.

- **Plans live in the log, not in preferences**, because they are your data and belong in
  the backup file.
- **A *slot* is one placement of an exercise on a day**, with its own id — which is what
  records are keyed by. That is why renaming a day, reordering exercises, or putting the
  same exercise on a day twice never disturbs history: only *removing* a slot, dropping a
  day, or shortening a block discards records, and the editor says how many before it does.
- **Stored records never cross plans** — every key starts with a plan id, and deleting or
  editing a plan only ever touches its own. The target-to-beat *lookup* crosses once: it
  walks earlier weeks of the same plan first, and only when it finds nothing there does it
  fall back to the same exercise and set in another block, tagged with how long ago that
  was. So week 1 of a new plan is not blank, but a plan's own history always wins.

Exercise ids (`bench-press`, `romanian-deadlift`) come from `src/catalog.js` and are
resolved to display names at render time through `src/i18n`. Names you type yourself are
stored as-is and have no translation. See the header comments in `src/state.js` and
`src/plan.js`.

### ⚠️ iOS clears storage after ~7 days — so make backups
On iPhone (WebKit), both `localStorage` and IndexedDB can be **wiped automatically after
about 7 days without visiting the site**. Two defences:

1. **Install the app to the home screen** (steps above). In standalone mode this automatic
   eviction is drastically reduced.
2. **Export a backup now and then.** The app shows a gentle reminder once the last backup
   is more than ~7 days old.

## Backing up your progress

At the bottom of any screen there is a **Backup** section:

- **Back up now** — produces `progression-backup-YYYY-MM-DD.json` containing 100% of your
  progress. On a desktop browser and on Android it downloads, and you keep it wherever you
  like (email it to yourself, iCloud Drive, Google Drive…).

  **On an iPhone with the app installed to the home screen, nothing downloads** — iOS replaces
  the app with a full-screen preview of the file. To keep it, tap the share icon in the bottom
  bar (or "Open with…", which opens the same sheet) and choose **Save to Files**; AirDrop, Mail
  and iCloud Drive are in that sheet too. A file saved that way is selectable by **Restore a
  backup**, so the round trip works — but dismissing the preview with ✕ keeps no file at all,
  while the app still records the backup and stops reminding you. That last part is a known
  bug, not the intent; `docs/ios-export-2026-07-30.md` records what the device actually did.
- **Restore a backup** — pick a backup file to **restore everything**. Restoring replaces
  current progress, and it asks first, naming the trade: how many plans and records are on this
  device now, how many are in the file, and when the file was made. A device with nothing on it
  yet is told that instead of being warned about a loss. Backups exported before plans became
  user-editable are rejected as invalid: they carry no `plans` array, and their records are
  keyed by exercise rather than by slot, so there is nothing to restore them against.

Tip: back up after important sessions, and before switching devices or clearing your browser.

---

## How to use it

1. Pick the **Week** and the **Day** at the top. Both rows come from the active plan, so a
   6-week, 3-day plan shows six week chips and three day chips.
2. For each exercise, fill in **kg** and **reps** per set. It saves itself. Cardio
   exercises log **km** and **min** instead.
3. Directly above each set sits the **target to beat** — your most recent record for that
   same exercise and set (ideally last week), in the same column as the boxes you type in,
   so you can read straight down. Tap it to pull those values in, then beat them. When what
   you log goes past it, the set shows how far by (`+2.5 kg`, `+1 rep`).
4. **Adjustable sets:** use `−` / `+` at the bottom of each exercise card to remove or add
   sets (limits 1 to 8). It starts at the plan's value, and the adjustment applies **per
   week** (W1 can have 4 sets while W2 stays at 3). Removing a set that holds data asks for
   confirmation. The `3×6-8` beside the name remains the **prescribed** rep range for
   reference — the actual count is shown by the set stepper.
5. **Clear this day's log** erases the current day/week's records and returns the set counts
   to the plan default (with confirmation).
6. **Settings**, at the bottom, switches the interface language.

## Building a plan

**Plans → Manage plans** (at the bottom of the training screen) lists every plan you have,
which one is in use, and how much is logged against each. From there you can start a new
one, duplicate an existing one as a starting point (structure only — the copy starts with
no records), edit, or delete.

The editor covers the whole shape of a block:

- **Weeks** — how long the block runs (1 to 24).
- **Days** — add, remove, rename and reorder them (up to 10). A day left unnamed is shown
  as "Day 3".
- **Exercises** — type to filter the list, then tap to add. Set the prescribed sets and rep
  range for each; clear either rep box for exercises logged without a rep target. Reorder or
  remove them freely.

Nothing is saved until you tap **Done**. Renaming and reordering never touch your records;
if an edit *would* discard some — a removed exercise, a dropped day, a shorter block — you
are told how many first.

## Out of scope
No charts, volume statistics, progression/deload maths, user accounts, cloud sync or
timers. Deliberately lean. See `docs/roadmap.md` for the ordered list of what comes next.
