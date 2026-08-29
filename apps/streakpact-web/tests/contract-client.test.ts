import assert from "node:assert/strict";
import test from "node:test";
import { friendlyError, isTransientReadError, withReadRetry } from "../src/lib/contract";

test("transient StudioNet reads retry twice and then recover", async () => {
  let attempts = 0;
  const waits: number[] = [];
  const result = await withReadRetry(async () => {
    attempts += 1;
    if (attempts < 3) throw new Error("An unknown RPC error occurred. Details: Failed to fetch");
    return "recovered";
  }, async (delayMs) => { waits.push(delayMs); });

  assert.equal(result, "recovered");
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [300, 900]);
});

test("contract rejections are never retried", async () => {
  let attempts = 0;
  await assert.rejects(
    withReadRetry(async () => {
      attempts += 1;
      throw new Error("[EXPECTED] pact not found");
    }, async () => {}),
    /pact not found/,
  );
  assert.equal(attempts, 1);
});

test("raw fetch failures become a useful recovery message", () => {
  const error = new Error("An unknown RPC error occurred. Details: Failed to fetch Version: viem@2.55.19");
  assert.equal(isTransientReadError(error), true);
  assert.equal(
    friendlyError(error),
    "StudioNet is temporarily unreachable. If you just submitted a transaction, check your wallet activity before retrying, then refresh.",
  );
});
