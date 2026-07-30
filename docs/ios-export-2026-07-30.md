# iOS export check — 2026-07-30

> **A snapshot, deliberately not updated.** It records what an installed iOS build actually did
> on one device on one day, because roadmap step 7 rests on a claim about iOS behaviour that
> could only be settled by trying it. `docs/roadmap.md` carries the current status and whatever
> was decided afterwards.
>
> Two notes added at the end of the same day, because the text below would otherwise send a reader
> after a file that no longer exists. **`docs/probe.html` has been deleted** — it answered what it
> was built to answer and both results are recorded here. And the blank-fields question it could not
> settle **was settled: it is a paint bug**, measured from inside the app. Roadmap step 9 has the
> reading and the fix; everything below stands as it was written.
>
> A third note, same day: the two candidate directions this note left open (**What this changes
> about the fix**, below) were settled by building the first. `navigator.share({ files })` now runs whenever the app
> is installed, and `markExported()` waits for the sheet to resolve — so the stamp described below as
> lying no longer can. Roadmap step 7 records what shipped and why the gate is standalone-and-capable
> rather than capable alone.

**Device.** iPhone 14, iOS 26.3.1, iOS UI in Portuguese. Installed from
https://jpoanders.github.io/progression/ via Safari → Adicionar à Tela de Início, launched
from the home-screen icon, and confirmed to be in standalone mode two ways: no address bar,
and the app's own install banner gone — that banner is `isIOS() && !isStandalone()`
(`src/views/banners.js:53`), so its absence is the app agreeing it is installed.

Deployed commit was `de8a9bc` (`progression-v17`), identical to `main` at the time.

## Verdict: the premise was wrong, and the real problem is worse-shaped

Step 7 said the synthetic `<a download>` "has historically been a dead end" in an iOS
home-screen PWA. **On iOS 26.3.1 it is not a dead end.** The file is produced, correctly
named, saves to Files, and imports back into the app — the whole round trip works, unchanged,
today. But nothing on screen says so, and the route is three taps down a screen that offers a
different action instead.

So this is not a broken export. It is an export that a person cannot find their way out of —
which the check demonstrated the hard way: the author of the app, who wrote `exportBackup`,
did not find "Salvar em Arquivos" and sent the file out over WhatsApp instead, then could not
test Restore because nothing had ever been saved to the device.

**And the check turned up two things that were not what it went looking for**, both below: the
day's inputs render blank after returning from the export preview (a real bug, and not confined
to export), and a successful import lands you on Plans (not a bug — deliberate, and worth
recording so nobody "fixes" it).

## What actually happens, tap by tap

1. **Fazer backup agora** — the standalone app is *replaced* by a full-screen black document
   preview: a generic document glyph, the filename **`progression-backup-2026-07-30.json`**,
   the subtitle **`JSON - 3 KB`**, an `✕` at top left, a blue **"Abrir com…"** link in the
   middle, and a bottom bar with a share icon, a reload icon and a compass (open in Safari).
   No download prompt, no download-arrow indicator, no toolbar chrome — there is none in
   standalone.
   *The filename is the important detail:* iOS honoured the anchor's `download` attribute.
   This is a real named download being previewed, not an anonymous blob.
2. **The share icon** — a standard share sheet over the preview, headed with the same filename
   and `JSON · 3 KB`. App row: AirDrop, Mensagens, E-mail, WhatsApp, …. Action row:
   **Copiar, Nova Nota Rápida, Salvar em Arquivos, Ver Mais**.
3. **"Abrir com…"** — opens *the same share sheet*. It is not a separate app-picker, so the
   middle-of-screen link and the bottom-bar icon lead to one place.

`Salvar em Arquivos` is therefore reachable, and iCloud Drive and email are one tap from the
same sheet. Export works on installed iOS today, at a cost of two extra taps and knowing they
exist.

Three screenshots of exactly this — the preview, the share sheet, and "Abrir com…" — were taken
and are **deliberately not committed**: they are photographs of a personal device, partially
redacted, and this repository is public. They were held at
`~/30-inbox/downloads/prtsc-when-clicking-{fazer-backup,compartilhar,abrir-com}.jpeg` on the day
of the check. The description above is written to stand on its own without them.

## The file itself is correct

The exported file was moved off the phone over WhatsApp and checked on the desktop:

- `parseBackup` accepts it, and the normalized result is **identical** to the file — nothing
  repaired, nothing pruned, so no field was lost on the way out or in transit.
- 4032 bytes, `version: 3`, 1 plan (3 days, 9 slots), 9 records, `exercises: []`,
  `setCounts: {}`.
- `lastExport` = 1785392557857 = 2026-07-30 03:22 (UTC−3, confirmed as the device's own zone),
  and the newest record `at` is 03:17 — the export stamp is the moment of the export, five
  minutes after the last set, not a copy of the last write. The shared-`now` property holds on
  WebKit.

That answers the part of step 7 that was about serialization: WebKit's `Blob` +
`URL.createObjectURL` path produces a complete, re-importable file.

The screenshots below are timestamped 06:00–06:05 on the device clock, so they are a *later*
export than the file examined here — same day, same build, same behaviour, different tap.

## Import works, end to end

**Salvar em Arquivos → Restaurar backup → restored.** The document picker opens from
`elements.importFile.click()` on a hidden `<input type="file">` in standalone mode (not a given),
lands on the usual three tabs (Recentes | Compartilhado | Explorar), and the saved `.json` is
**selectable** — so `accept="application/json,.json"` (`index.html:69`) resolves to a UTType that
matches a file saved this way. The import succeeded and reported
`Progresso importado com sucesso`.

Which means: **nothing in the export/import path needs building for iOS to work.** Everything
still open on step 7 is about whether a person can be expected to discover it, and about the
app telling the truth afterwards.

## Found while checking: the day's inputs come back blank

**Observed.** Export, then dismiss the preview with `✕`. You land back on the day you were on —
and every exercise field is **empty**. Switch to another day and back, and the numbers are all
there again. Nothing was lost: the records were in `localStorage` the whole time, and the export
file proves they were in `state`. It is the *display* that is empty.

**This is worth more attention than the export itself.** On the target platform, at the moment
the user is being reassured their data is safe, the app shows them an empty workout. Anyone who
does not think to navigate away and back has every reason to believe the backup ate their
session.

**It is almost certainly not a reload.** After a reload the app lands on Plans — `screen` is a
closure variable initialized to `"plans"` and never persisted (`src/app.js:35`). Landing back on
the *day view* means the JS closure survived, so the document was restored rather than re-created,
and the DOM in front of you is the same DOM `render()` built.

**The mechanism, from the code.** `numericField` passes `value: show()` to `el()`
(`src/views/fields.js:33`), and `el()` sets anything unhyphenated **as a property**, not an
attribute (`src/dom.js:31`). Same for the `blur` handler and `sync()`, which both assign
`input.value`. So the number on screen lives *only* in the IDL property; the `value` content
attribute — the input's **default** value — is never set and stays empty. Any WebKit path that
restores or resets form state therefore lands the field on its default, which is blank, while
the store is untouched. Returning via a fresh `render()` re-assigns the property and the numbers
reappear. That fits the symptom exactly.

> **Superseded the same day — this paragraph and the two fixes under it are wrong.**
> `docs/probe.html` put the three cases on
> the device and the restore did *not* empty the property-only input. Everything above is a correct
> reading of the code and a wrong explanation of the bug. Kept as written because the reasoning is
> what the probe was built to test; see "Probe results" below for what actually happened.

**Two candidate fixes, neither implemented.** Setting the `value` attribute alongside the
property makes the default value correct, so a restore shows the right number instead of nothing
— and it belongs inside `numericField` (creation, `blur` and `sync` all assign the same way), not
sprinkled at call sites. Alternatively, re-`render()` on `pageshow` when `event.persisted` is
true, which repairs whatever else the restore clobbered too. The first is narrower and needs no
event at all; the second is broader but only fires on the page-cache path, so it does nothing for
a plain reset. (`visibilitychange` was the third candidate and is now ruled out — see below.)

**Backgrounding the app does *not* do it — checked the same day.** With a day's numbers on
screen, the app was sent to the background and left there for several minutes, then reopened from
the home-screen icon. It came back **on the same day view** (so the document was restored, not
re-created — a fresh launch lands on Plans) with **every field still filled**. Repeated with a
longer wait, same result.

That was the check meant to show this had nothing to do with export, and it showed the opposite.
Two consequences. A `visibilitychange` fix is pointless: there is nothing to repair on resume.
And the trigger is narrower than "any navigation away" — freeze/resume is not enough.

**What is left fits the mechanism better, not worse.** The remaining difference between the two
cases is a *session-history* navigation: the anchor click takes the app's own top-level browsing
context to the `blob:` URL, iOS renders that as the preview, and `✕` is a **back** navigation.
Restoring from WebKit's page cache keeps the JS closure alive — which is exactly why you land on
the day view and not on Plans — and on that restore WebKit reapplies the form state saved in the
history entry. For an input whose value was only ever assigned as a property, there is no saved
state and no `value` attribute, so it restores to a blank default. Resume, by contrast, involves
no history entry and no form-state reapplication, which is why it comes back filled. Every
observation so far fits; none of it has been confirmed by reading the DOM.

**So today, export is the only way to reach this.** The app has no outbound links and no
in-app navigation — `render()` swaps the contents of one `<main>` and never leaves the document —
which means the export preview is the only thing that creates a history entry to come back from.
That does not make the bug less real when it fires, but it does mean it is not a general
"leave the app and lose your screen" defect, and it changes the ordering against step 7 (see the
roadmap).

## Probe results, same day (`docs/probe.html`)

Standalone confirmed, iOS 26.3 / AppleWebKit 605.1.15. Each button declared what the person was
about to do — cancel or save, `✕` or Save to Files — because the page cannot observe it and a log
without that is uninterpretable. The first run of the probe proved that: it came back `RESOLVED`
from a share that had been *saved*, and a `✕` that had actually been a Save to Files, so it answered
neither question.

**Step 7 is answered, and the answer is yes.**

- `canShare({ files: [json] })` is **true** for a `File` of type `application/json` named like a real
  backup.
- `share({ files })`, then backing out of the sheet: **`REJECTED AbortError — Abort due to
  cancellation of share.`** iOS *does* report the cancel, so `markExported()` can move into the
  resolve branch and stop claiming backups that never happened. That was the last unknown standing
  between step 7 and being buildable.
- The share sheet logged **no `pagehide`, `pageshow` or `visibilitychange` at all**. It does not
  freeze the document — so a share-based export never takes the app through the restore that step 9
  needs, which is the second reason to prefer it.

**Step 9's mechanism is not what the code suggested.**

- `Export → then ✕`, with the three inputs rebuilt immediately after `link.click()` the way
  `render()` does: `pagehide persisted=true` → `pageshow persisted=true` a second later, the
  closure id unchanged, and on return **A: `value="123.5"`, `attr=null`**. The property-only input
  kept its value. The missing attribute cost nothing.
- The restore path reproduced exactly; the symptom did not reproduce at all. So the empty `value`
  attribute is not the cause, and setting it is not the fix. Two runs now say so — the first without
  the post-click rebuild, the second with it.

**What the probe cannot see, and what that leaves.** The probe reads the DOM; the report from the app
was visual — "all the exercise fields appear blank". If the values are present and simply unpainted,
this log is exactly what that would print. The app rebuilds `<main>` synchronously while the
navigation to the `blob:` URL is already in flight, one frame before the freeze, and a restored
snapshot that missed that update would show empty boxes over correct state until any interaction
repaired it — which is what moving to another day and back did. That would also explain why nothing
was ever lost.

**The cheap next measurement is a pair of eyes, not more code:** run `Export → then ✕` again and
report whether the three boxes *looked* filled on return, alongside what the log says they
contained. If they looked blank while the log says `123.5`, the bug is in painting and not in state,
and no amount of DOM instrumentation will find it.

## Found while checking: import returns you to Plans (deliberate)

Reported as strange; it is intentional, and the reason should survive. `handleImportFile` sets
`screen = "plans"` before `render()` (`src/app.js:343`).

`replaceState` normalizes and writes the log state (`src/state.js:738`) but does not touch
`progression:ui` — the two keys are separate, and preferences are not user data. So after an
import `prefs.planId` and `prefs.day` still name ids from the *replaced* state, which the new
state does not contain. Resolution at render time falls back:
`store.findPlan(store.prefs.planId) ?? store.plans[0]` (`src/app.js:66-67`). Staying on the log
screen would therefore present an arbitrary first plan and first day as though they had been
chosen. Plans is the landing screen and the only screen valid with nothing selected, so going
there is the honest destination — after a restore, *which plan am I using* is a question the
user should answer.

The one gap is that nothing says so: `tools.importDone` reports success and the move happens
silently. A clause in that message, in both locales, is the whole fix — and cheaper than
teaching prefs to survive an import, which would mean mapping old ids onto new ones and has no
correct answer.

## What this changes about the fix

**The `markExported()` stamp is observably too optimistic.** The stamp now runs after
`link.click()` (which was the right direction), but on iOS `link.click()` only means *the
preview opened*. Dismiss it with `✕` and the app has recorded a backup, silenced the reminder
banner, and no file exists anywhere. This is no longer a theoretical gap in the anchor's
inability to report success — it is the normal outcome of the normal-looking gesture on the
one platform whose storage gets evicted.

Two candidate directions, both still unbuilt:

- **`navigator.share({ files })` behind `navigator.canShare`.** Replaces an undiscoverable
  three-tap route with the share sheet directly, and — the reason that now matters more — it
  *returns a promise that rejects on cancel*, so `markExported()` can finally be honest on the
  platform where honesty counts. Building the JSON is synchronous, so the call stays inside the
  tap's user activation. Note that the sheet reached this way is the same one screenshotted
  above, so the *destinations* gained are zero; what is gained is discoverability and a truthful
  stamp.
- **Say what to do instead.** A line under the export button, iOS-and-standalone only, naming
  the two taps. Cheap, no feature detection, no new failure mode — and it fixes neither the
  stamp nor the fact that the app disappears behind a full-screen preview.

They are not exclusive, and the first subsumes the second's benefit only if `canShare({ files })`
is actually true for a JSON file on this device — itself worth checking before committing.

**One documentation bug found.** `README.md`'s backup section says "Back up now — *downloads*
`progression-backup-YYYY-MM-DD.json` … Keep it wherever you like". On installed iOS it does not
download anywhere; it previews, and the keeping is a share-sheet step the README never mentions.
The install instructions push iOS users into exactly this mode, so this is the one platform the
sentence is wrong for.

## Not checked

Worth doing on the next pass, none of it blocking the write-up:

- **Whether export → `✕` blanks the fields every time.** Observed once. One observation is
  enough to justify a fix but not enough to describe the trigger, and everything above rests on
  it.
- **Whether the return path matters, or only the dismissal.** Export → **Salvar em Arquivos** →
  back in the app: still filled, or blank? Both routes come back through the same history entry,
  so if saving the file leaves the numbers alone then the story above is wrong.
- **The decisive DOM read**, which needs a console the phone does not have without a Mac: after
  `✕`, compare `input.value` with `input.getAttribute("value")`. `docs/probe.html` does exactly
  that — three inputs built property-only, attribute-only and both, snapshotted automatically on
  `pageshow` — and reports `canShare({ files })` in the same visit. Delete it once both are
  answered.
- **Opening in Safari via the preview's compass** and returning to the app. Different again from
  both cases above: it leaves the app entirely rather than navigating within it.
- Whether the `✕` return preserves *everything else* the closure held, or only the screen: scroll
  position, the picker's open state, an in-progress plan draft.
- The same export in a normal Safari tab on the same phone, which would show whether the
  full-screen preview is standalone-specific or WebKit-wide.
- The app's own locale during the check (the iOS UI was Portuguese; the app's `t()` locale was
  not separately confirmed, and a check that silently ran in the wrong locale has bitten this
  project before — see step 8's note in the roadmap).
- A second consecutive export, for first-run permission wrinkles.
