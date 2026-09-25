import assert from "node:assert/strict";
import test from "node:test";
import { utcLabel } from "../src/lib/time";

test("UTC incident labels remain UTC in non-UTC environments and handle missing values", () => {
  const original = process.env.TZ;
  process.env.TZ = "Africa/Lagos";
  try {
    assert.equal(utcLabel(1790347457), "2026-09-25 14:44:17 UTC");
    assert.equal(utcLabel("0"), "—");
    assert.equal(utcLabel("invalid"), "—");
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});
