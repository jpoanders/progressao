#!/usr/bin/env node
/**
 * Serves the app and drives headless Chrome over CDP to prove the service worker installs,
 * precaches the whole SHELL, and evicts the previous cache.
 *
 * No dependencies, deliberately: the repo has none and must keep none. Node 24 ships global
 * `WebSocket` and `fetch`, which is all a CDP client needs.
 *
 * The expected cache name and file count are parsed out of sw.js rather than hardcoded, so
 * this stays correct across every CACHE_VERSION bump without being edited.
 *
 *   node .claude/skills/running-the-app/check-service-worker.mjs [--port 8080] [--keep-open]
 *
 * Exits non-zero on the first failed check. Always reclaims the Chrome profile, the browser and
 * the server — including on Ctrl-C, and including under --keep-open, which parks until you
 * interrupt it rather than orphaning what it left running.
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = new URL("../../../", import.meta.url).pathname.replace(/\/$/, "");
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const HTTP_PORT = Number(flag("port", 8099));
const CDP_PORT = Number(flag("cdp-port", 9333));
const ORIGIN = `http://localhost:${HTTP_PORT}/`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (ok, label, detail = "") => {
  results.push({ ok, label, detail });
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? `  — ${detail}` : ""}`);
};

// ── What sw.js claims ────────────────────────────────────────────────────────────────
// Single-quote regexes on purpose: sw.js is a classic script written with single quotes,
// and tests/service-worker.test.js parses it the same way.
const sw = await readFile(join(REPO, "sw.js"), "utf8");
const expectedVersion = sw.match(/const CACHE_VERSION = '([^']+)'/)?.[1];
const shell = [...sw.matchAll(/^\s*'(\.\/[^']*)',?$/gm)].map((m) => m[1]);
if (!expectedVersion || shell.length === 0) {
  console.error("could not parse CACHE_VERSION / SHELL out of sw.js");
  process.exit(1);
}
console.log(`sw.js declares ${expectedVersion} with ${shell.length} SHELL entries\n`);

// ── Serve. Must be over HTTP: ES modules and the SW do not work from file://, and a LAN
// IP is not a secure context so registration would silently not happen. ───────────────
const server = spawn("python3", ["-m", "http.server", String(HTTP_PORT)], {
  cwd: REPO,
  stdio: "ignore",
});

const chromeBinary = ["google-chrome", "chromium", "chromium-browser"];
let chrome;
let profile;
let ws;

/**
 * SIGTERM, then *wait for the exit*. Chrome is still writing to its profile when kill()
 * returns, so removing the directory immediately loses the race and leaves it behind — and
 * the removal is deliberately silent, so the leak is invisible. SIGKILL after 4s in case
 * Chrome will not go quietly.
 */
const endProcess = (child) =>
  new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return resolve();
    const force = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      resolve();
    }, 4000);
    child.once("exit", () => {
      clearTimeout(force);
      resolve();
    });
    try {
      child.kill();
    } catch {
      clearTimeout(force);
      resolve();
    }
  });

let torndown = false;
const teardown = async () => {
  if (torndown) return;
  torndown = true;
  try { ws?.close(); } catch {}
  await endProcess(chrome);
  await endProcess(server);
  if (profile) await rm(profile, { recursive: true, force: true }).catch(() => {});
};

/**
 * `finally` does not run when node is signalled, and Ctrl-C is how an interrupted run ends.
 * Without this, an interrupted check leaves a live Chrome, a live server holding the port,
 * and a profile in the temp directory — which is exactly how 41 of them accumulated.
 */
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, async () => {
    await teardown();
    process.exit(130);
  });
}

try {
  for (let i = 0; i < 40; i++) {
    try {
      await fetch(ORIGIN);
      break;
    } catch {
      await wait(250);
    }
  }

  profile = await mkdtemp(join(tmpdir(), "progression-sw-"));
  for (const bin of chromeBinary) {
    chrome = spawn(bin, [
      "--headless=new",
      "--no-sandbox", // required in a container; harmless on a desktop
      "--disable-gpu",
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profile}`,
      "about:blank",
    ], { stdio: "ignore" });
    await wait(500);
    if (chrome.exitCode === null) break;
  }

  let socketUrl;
  for (let i = 0; i < 40; i++) {
    try {
      socketUrl = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json())
        .webSocketDebuggerUrl;
      break;
    } catch {
      await wait(250);
    }
  }
  if (!socketUrl) throw new Error("no Chrome on the debugging port — is one installed?");

  ws = new WebSocket(socketUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));

  let nextId = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id == null || !pending.has(msg.id)) return;
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });

  const { targetId } = await send("Target.createTarget", { url: ORIGIN });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    );
    if (exceptionDetails) throw new Error(exceptionDetails.text || "evaluation threw");
    return result.value;
  };

  // Target.createTarget resolves before the navigation commits, and the initial empty
  // document is *also* readyState "complete" — on an opaque origin where
  // navigator.serviceWorker does not exist. Waiting on readyState alone reports the API
  // missing. Wait for the real URL.
  const settle = async () => {
    for (let i = 0; i < 80; i++) {
      if ((await evaluate("location.href")) === ORIGIN &&
          (await evaluate("document.readyState")) === "complete") return;
      await wait(250);
    }
    throw new Error(`never landed on ${ORIGIN}`);
  };
  await settle();

  const first = await evaluate(`
    (async () => {
      if (!("serviceWorker" in navigator)) return { error: "no serviceWorker in this context" };
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, x) => setTimeout(() => x(new Error("SW never activated")), 20000)),
      ]);
      const worker = reg.active || reg.waiting || reg.installing;
      const names = await caches.keys();
      const keys = await (await caches.open(names[0])).keys();
      return {
        secure: window.isSecureContext,
        state: worker.state,
        scriptURL: worker.scriptURL,
        names,
        precached: keys.length,
        hasIndex: keys.some((r) => r.url === location.origin + "/" || r.url.endsWith("/index.html")),
        booted: document.querySelector("#content")?.children.length ?? 0,
      };
    })()
  `);

  if (first.error) throw new Error(first.error);

  check(first.secure, "localhost is a secure context", String(first.secure));
  check(first.state === "activated", "service worker reaches activated", first.state);
  check(first.scriptURL === `${ORIGIN}sw.js`, "registered script is sw.js", first.scriptURL);
  check(
    first.names.length === 1 && first.names[0] === expectedVersion,
    `cache is ${expectedVersion}`,
    JSON.stringify(first.names),
  );
  // addAll() rejects atomically, so a short count means the app is entirely uncached.
  check(
    first.precached === shell.length,
    `precached every SHELL entry (${shell.length})`,
    `got ${first.precached}`,
  );
  check(first.hasIndex, "the app shell itself is cached");
  check(first.booted > 0, "the app boots and renders into #content", `${first.booted} children`);

  // ── The upgrade path: the reason a bump exists at all. Seed the cache a previously
  // installed device would be holding, then reload so a fresh worker activates. ───────
  await evaluate(`
    (async () => {
      const c = await caches.open("progression-stale-test");
      await c.put("/index.html", new Response("STALE"));
    })()
  `);
  const before = await evaluate("caches.keys()");
  await evaluate("navigator.serviceWorker.getRegistration().then((r) => r.unregister())");
  await send("Page.navigate", { url: ORIGIN }, sessionId);
  await settle();
  await evaluate("navigator.serviceWorker.ready");
  await wait(2000);

  const after = await evaluate("caches.keys()");
  const served = await evaluate(
    `fetch("/index.html").then((r) => r.text()).then((t) => t.includes("STALE") ? "stale" : "fresh")`,
  );
  const controlled = await evaluate("!!navigator.serviceWorker.controller");

  check(
    before.includes("progression-stale-test") && !after.includes("progression-stale-test"),
    "activate evicts a cache from an older version",
    `${JSON.stringify(before)} -> ${JSON.stringify(after)}`,
  );
  check(served === "fresh", "the shell is served fresh, not from the stale cache", served);
  check(controlled, "a returning load is controlled by the worker");
} catch (error) {
  check(false, "check run completed", error.message);
} finally {
  if (!args.includes("--keep-open")) await teardown();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);

// --keep-open used to fall straight through to process.exit(), which orphaned Chrome and the
// server: no parent left to interrupt, nothing holding the port accountable. Park here instead,
// so the signal handlers above are what ends the run.
if (args.includes("--keep-open")) {
  console.log(
    `\nstill open for inspection:` +
      `\n  Chrome  pid ${chrome?.pid}  CDP http://127.0.0.1:${CDP_PORT}` +
      `\n  server  pid ${server.pid}  ${ORIGIN}` +
      `\n  profile ${profile}` +
      `\nCtrl-C closes all three.`,
  );
  await new Promise(() => {});
}

process.exit(failed.length === 0 ? 0 : 1);
