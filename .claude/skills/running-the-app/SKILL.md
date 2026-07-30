---
name: running-the-app
description: Use when serving this app, driving it in a real browser, checking the service worker or its cache version, or hand-verifying a change to views/, dom.js, app.js or main.js that node --test cannot reach.
---

# Running Progression

## Overview

`npm test` covers the pure layer only. The views, `dom.js`, `app.js`, `main.js` and the
service worker are checked by running the app — there are no DOM tests and there cannot be
(jsdom would be a dependency).

## Serve it

```bash
npm run serve            # python3 -m http.server 8080
```

**It must be HTTP on `localhost`.** ES modules and the service worker do not work from
`file://`, and a LAN IP is not a secure context, so registration silently never happens —
you get a working-looking app and no worker.

## Check the service worker

After any `CACHE_VERSION` bump or `SHELL` edit:

```bash
node .claude/skills/running-the-app/check-service-worker.mjs
```

Serves the repo, drives headless Chrome over CDP, and asserts the worker activates, the
cache is named what `sw.js` declares, every `SHELL` entry precached, the app boots, and a
fresh worker evicts an older version's cache. Exits non-zero on the first failure. It reads
`CACHE_VERSION` and `SHELL` out of `sw.js`, so it never needs editing after a bump.

**What it does not prove:** that you *bumped* the version. It trusts `sw.js`; the bump and
its paired literal in `tests/service-worker.test.js` are enforced by `npm test`. Run both.

## Driving it yourself

The script is the worked example — copy its CDP setup. No dependencies: node 24 ships global
`WebSocket` and `fetch`, which is all a CDP client needs. Keep it that way.

| Gotcha | What happens | Do this |
|---|---|---|
| Evaluating too early | `Target.createTarget` resolves before the navigation commits; the initial document is an opaque origin with **no `navigator.serviceWorker`** — reads as "the API is missing" | Poll until `location.href` is the origin |
| Waiting on `readyState` | `about:blank` is already `"complete"`, so the poll exits immediately and you evaluate into the empty document | Check `location.href` **and** `readyState` |
| Running in a container | Chrome refuses to start | `--no-sandbox --headless=new` |
| Using the real browser | Registers a worker and cache in the user's own profile | Headless with a throwaway `--user-data-dir` |
| Looking for the Backup or day UI on load | The app lands on **Plans**, and a fresh profile has no plans at all — so "Back up now" is not on screen and cannot be found | Create a plan, then click "Back to training"; only then is the log screen (and `renderTools`) rendered |
| `try { el.click() } catch` | An exception inside a click handler does **not** propagate out of `.click()` — it goes to `window.onerror`, so a broken action looks exactly like a missing button | Collect `window` errors and assert on those, never on a throw from the click |

## Common mistakes

- Reading `sw.js` and calling the worker verified. Reading the file proves the literal
  changed; only a browser proves `addAll()` resolved. A single missing `SHELL` path leaves
  the app **entirely** uncached.
- Trusting a passing check that cannot fail. Break something on purpose once — add a
  nonexistent path to `SHELL` and confirm the script reports `SW never activated`.
- Editing this skill and reaching for a `CACHE_VERSION` bump. `.claude/` is not shipped and
  is not in `SHELL`; only files under `src/`, `styles/`, `icons/`, `fonts/` and the root
  shell carry that obligation.
