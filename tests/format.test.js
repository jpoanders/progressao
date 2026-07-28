import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatDateTime, formatNumber, isoDateStamp, parseNumber } from "../src/format.js";

describe("parseNumber", () => {
  it("reads plain numbers", () => {
    assert.equal(parseNumber("60"), 60);
    assert.equal(parseNumber("57.5"), 57.5);
    assert.equal(parseNumber(42), 42);
  });

  it("accepts a comma as the decimal separator", () => {
    assert.equal(parseNumber("57,5"), 57.5);
    assert.equal(parseNumber("0,5"), 0.5);
  });

  it("strips junk the phone keyboard may leave behind", () => {
    assert.equal(parseNumber("60kg"), 60);
    assert.equal(parseNumber(" 12 reps "), 12);
    assert.equal(parseNumber("-8"), 8, "minus is stripped; the app has no negative loads");
  });

  it("returns null when there is nothing usable", () => {
    assert.equal(parseNumber(""), null);
    assert.equal(parseNumber("   "), null);
    assert.equal(parseNumber("."), null);
    assert.equal(parseNumber(","), null);
    assert.equal(parseNumber("abc"), null);
    assert.equal(parseNumber(null), null);
    assert.equal(parseNumber(undefined), null);
  });
});

describe("formatNumber", () => {
  it("keeps one decimal for loads and avoids float artifacts", () => {
    assert.equal(formatNumber(57.5), "57.5");
    assert.equal(formatNumber(60), "60");
    assert.equal(formatNumber(0.1 + 0.2), "0.3");
    assert.equal(formatNumber(62.34), "62.3");
  });

  it("rounds integer fields to whole numbers", () => {
    assert.equal(formatNumber(8.4, { integer: true }), "8");
    assert.equal(formatNumber(8.6, { integer: true }), "9");
  });

  it("renders missing values as an empty string", () => {
    assert.equal(formatNumber(null), "");
    assert.equal(formatNumber(undefined), "");
    assert.equal(formatNumber(Number.NaN), "");
    assert.equal(formatNumber(Number.POSITIVE_INFINITY), "");
  });

  it("keeps zero, which is a real load for bodyweight work", () => {
    assert.equal(formatNumber(0), "0");
    assert.equal(formatNumber(0, { integer: true }), "0");
  });
});

describe("formatDateTime", () => {
  it("formats in the requested locale", () => {
    const timestamp = Date.UTC(2026, 6, 20, 14, 30);
    const enText = formatDateTime(timestamp, "en");
    const ptText = formatDateTime(timestamp, "pt-BR");

    assert.match(enText, /2026/);
    assert.match(ptText, /2026/);
    assert.notEqual(enText, ptText, "en and pt-BR order date parts differently");
  });

  it("returns an empty string for an unusable timestamp", () => {
    assert.equal(formatDateTime(Number.NaN, "en"), "");
  });
});

describe("isoDateStamp", () => {
  it("produces the YYYY-MM-DD used in the backup filename", () => {
    assert.equal(isoDateStamp(new Date(2026, 6, 5, 12, 0).getTime()), "2026-07-05");
  });

  it("pads single-digit months and days", () => {
    assert.equal(isoDateStamp(new Date(2026, 0, 9, 12, 0).getTime()), "2026-01-09");
  });

  it("uses the local date, so a late-evening export is not stamped with tomorrow", () => {
    // 23:30 local on the 27th is already the 28th in UTC anywhere west of Greenwich.
    assert.equal(isoDateStamp(new Date(2026, 6, 27, 23, 30).getTime()), "2026-07-27");
  });
});
