# Progression

Lightweight web app (PWA) for logging strength-training loads and reps, built for phone
use in the gym. It does one thing well: when you open an exercise, you see **what you did
last time** on that same exercise — the target to beat — so you can add load.

Built-in plan: 4 weeks, 4 strength days plus a progressive walk-run.

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
tests cover the pure logic: number parsing and formatting, the previous-record lookup, set
counts, state normalization, backup import validation, locale resolution, and translation
key parity between locales. They also assert that `sw.js` precaches every shipped file, so
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
src/plan.js             the training plan as pure data (ids, set counts, rep ranges)
src/format.js           number parsing and locale-aware display formatting
src/dom.js              a small element builder
src/views/              view builders (selectors, day, running, tools, banners, fields)
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
The data volume is tiny (4 weeks × 4 days × ~6 exercises × ~3 sets × 2 numbers). At that
size `localStorage` is the right call: a synchronous API, simple code, no async state to
get wrong, and the whole state is a single JSON object — which makes export/import
trivial. IndexedDB would be overkill.

Saving is **automatic**: every field edit is written immediately. There is no save button.

### The storage schema is frozen
The two top-level keys are `progression:v1` (the training log) and `progression:ui`
(preferences). They were renamed from `progressao:*` when the repository moved to English;
installs predating the rename are migrated on first load, so no history was orphaned. That
fallback is permanent — a phone that has not opened the app since the rename still holds
the old keys, and nothing else can recover that data.

Everything *inside* the state — the day ids `d1`–`d4` and the Portuguese exercise ids such
as `supino-reto` — is **opaque identifiers, not labels**, and stays frozen. Unlike the
top-level keys these are written into every backup file ever exported, where no migration
can reach them. Display names are resolved from these ids at render time through
`src/i18n`. See the header comment in `src/state.js`. Only ever add fields — never rename
or repurpose one.

### ⚠️ iOS clears storage after ~7 days — so make backups
On iPhone (WebKit), both `localStorage` and IndexedDB can be **wiped automatically after
about 7 days without visiting the site**. Two defences:

1. **Install the app to the home screen** (steps above). In standalone mode this automatic
   eviction is drastically reduced.
2. **Export a backup now and then.** The app shows a gentle reminder once the last backup
   is more than ~7 days old.

## Backing up your progress

At the bottom of any screen there is a **Backup** section:

- **Export JSON** — downloads `progression-backup-YYYY-MM-DD.json` containing 100% of your
  progress. Keep it wherever you like (email it to yourself, iCloud Drive, Google Drive…).
- **Import JSON** — pick an exported backup to **restore everything**. Importing replaces
  current progress (it asks for confirmation first). Backups exported by older versions of
  the app still import: the file format has not changed.

Tip: export after important sessions, and before switching devices or clearing your browser.

---

## How to use it

1. Pick the **Week** (W1–W4) and the **Day** (Day 1–4, or **Run**) at the top.
2. For each exercise, fill in **kg** and **reps** per set. It saves itself.
3. Under each set you see the **target to beat** — your most recent record for that same
   exercise and set (ideally last week). Tap **copy** to pull the previous values in, then
   beat them.
4. **Adjustable sets:** use `−` / `+` at the bottom of each exercise card to remove or add
   sets (limits 1 to 8). It starts at the plan's value, and the adjustment applies **per
   week** (W1 can have 4 sets while W2 stays at 3). Removing a set that holds data asks for
   confirmation. The `3×6-8` beside the name remains the **prescribed** rep range for
   reference — the actual count is shown by the set stepper.
5. **Run** shows the week's protocol plus fields to log distance, time and cycles, with the
   same target-to-beat hint as the strength days.
6. **Clear this day** erases the current day/week's records and returns the set counts to
   the plan default (with confirmation).
7. **Settings**, at the bottom, switches the interface language.

## Out of scope (v1)
No charts, volume statistics, progression/deload maths, user accounts, cloud sync or
timers. Deliberately lean.
