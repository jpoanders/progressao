import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { setGain } from "../src/progress.js";

const STRENGTH = "bench-press";
const CARDIO = "walk-run";

describe("setGain on a strength exercise", () => {
  it("reports the extra weight", () => {
    const gain = setGain({ kg: 72.5, reps: 8 }, { kg: 75, reps: 8 }, STRENGTH);
    assert.deepEqual(gain, { field: "kg", delta: 2.5 });
  });

  it("falls back to reps only when the weight is unchanged", () => {
    const gain = setGain({ kg: 72.5, reps: 8 }, { kg: 72.5, reps: 9 }, STRENGTH);
    assert.deepEqual(gain, { field: "reps", delta: 1 });
  });

  it("says nothing about extra reps at a lighter load", () => {
    assert.equal(setGain({ kg: 72.5, reps: 8 }, { kg: 70, reps: 12 }, STRENGTH), null);
  });

  it("prefers the weight when both went up", () => {
    const gain = setGain({ kg: 70, reps: 8 }, { kg: 75, reps: 10 }, STRENGTH);
    assert.deepEqual(gain, { field: "kg", delta: 5 });
  });

  it("reports the load before the reps have been typed", () => {
    const gain = setGain({ kg: 72.5, reps: 8 }, { kg: 75 }, STRENGTH);
    assert.deepEqual(gain, { field: "kg", delta: 2.5 }, "loading the bar is already the gain");
  });

  it("stays quiet on an identical set", () => {
    assert.equal(setGain({ kg: 72.5, reps: 8 }, { kg: 72.5, reps: 8 }, STRENGTH), null);
  });

  it("treats an unknown exercise as strength, like the rest of the app", () => {
    const gain = setGain({ kg: 40, reps: 10 }, { kg: 45, reps: 10 }, "removed-long-ago");
    assert.deepEqual(gain, { field: "kg", delta: 5 });
  });
});

describe("setGain on a cardio exercise", () => {
  it("reports the extra distance", () => {
    const gain = setGain({ dist: 3, time: 30 }, { dist: 3.2, time: 30 }, CARDIO);
    assert.equal(gain.field, "dist");
    assert.ok(Math.abs(gain.delta - 0.2) < 1e-9);
  });

  it("leaves a faster time alone — the app does not rank pace against distance", () => {
    assert.equal(setGain({ dist: 3, time: 30 }, { dist: 3, time: 26 }, CARDIO), null);
  });
});

describe("setGain with incomplete records", () => {
  it("needs both sides", () => {
    assert.equal(setGain(null, { kg: 75, reps: 8 }, STRENGTH), null);
    assert.equal(setGain({ kg: 72.5, reps: 8 }, null, STRENGTH), null);
  });

  it("needs the compared field on both sides", () => {
    assert.equal(setGain({ reps: 8 }, { kg: 75, reps: 8 }, STRENGTH), null);
    assert.equal(setGain({ kg: 72.5, reps: 8 }, { reps: 9 }, STRENGTH), null);
  });

  it("does not read a missing weight as zero and call every set a gain", () => {
    assert.equal(setGain({ kg: null, reps: 8 }, { kg: 60, reps: 8 }, STRENGTH), null);
  });
});
