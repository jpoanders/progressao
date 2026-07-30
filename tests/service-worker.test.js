import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Guards the easiest way to ship a broken offline app: adding a module and forgetting it
 * in the service worker's precache list. cache.addAll() is atomic, so one missing or
 * misspelled path silently leaves the whole app uncached.
 */

const root = new URL("../", import.meta.url);
const serviceWorker = readFileSync(new URL("sw.js", root), "utf8");

/** Directories whose contents the browser downloads. */
const SHIPPED_DIRS = ["src", "styles", "icons", "fonts"];
/** Root files the browser downloads. sw.js is fetched by the browser, not from cache. */
const SHIPPED_ROOT_FILES = ["index.html", "manifest.webmanifest"];

function walk(dir) {
  return readdirSync(new URL(`${dir}/`, root), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`],
  );
}

const shippedFiles = [...SHIPPED_ROOT_FILES, ...SHIPPED_DIRS.flatMap(walk)].sort();

function parseShell() {
  const match = serviceWorker.match(/const SHELL = \[([\s\S]*?)\];/);
  assert.ok(match, "sw.js must declare a SHELL array");
  return [...match[1].matchAll(/'([^']+)'/g)].map(([, path]) => path);
}

describe("service worker precache", () => {
  const shell = parseShell();

  it("lists every shipped file", () => {
    const cached = new Set(shell.map((path) => path.replace(/^\.\//, "")));
    const missing = shippedFiles.filter((file) => !cached.has(file));

    assert.deepEqual(missing, [], "add these to SHELL in sw.js");
  });

  it("lists nothing that does not exist", () => {
    const shipped = new Set([...shippedFiles, ""]); // "" is the "./" navigation entry
    const stale = shell
      .map((path) => path.replace(/^\.\//, ""))
      .filter((path) => !shipped.has(path));

    assert.deepEqual(stale, [], "these SHELL entries have no file — addAll() would reject");
  });

  it("precaches the navigation entry used as the offline fallback", () => {
    assert.ok(shell.includes("./"), "the scope root must be cached");
    assert.ok(shell.includes("./index.html"), "offline navigations fall back to the shell");
  });

  it("has a cache version to bust the old cache with", () => {
    const version = serviceWorker.match(/const CACHE_VERSION = '([^']+)'/);
    assert.ok(version, "sw.js must declare CACHE_VERSION");
    assert.notEqual(version[1], 'progression-v13', "bump the version when shipped files change");
  });
});
