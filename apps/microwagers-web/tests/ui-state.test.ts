import assert from "node:assert/strict";
import test from "node:test";
import { formatCountdown, marketShareUrl, oneTransactionAtATime, transactionPending, watchWalletSession } from "../src/lib/ui-state";
import type { EthereumProvider } from "../src/lib/wallet";

test("share links and short countdowns are reviewer-friendly", () => {
  assert.equal(marketShareUrl("https://microwagers.example", "w-7"), "https://microwagers.example/?wager=w-7");
  assert.equal(formatCountdown("125", 100), "25s");
  assert.equal(formatCountdown("225", 100), "2m 5s");
});

test("all pending stages disable duplicate actions", () => {
  for (const state of ["awaiting-signature", "submitted", "finalizing"] as const) assert.equal(transactionPending({ state, label: "pending" }), true);
  assert.equal(transactionPending({ state: "confirmed", label: "done" }), false);
});

test("only one write per account can run at a time", async () => {
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const first = oneTransactionAtATime("0xABC", async () => { await waiting; return "done"; });
  await assert.rejects(oneTransactionAtATime("0xabc", async () => "duplicate"), /already in progress/);
  release();
  assert.equal(await first, "done");
});

test("wallet account and chain changes invalidate the session", () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  let resets = 0;
  const provider: EthereumProvider = { request: async () => null, on: (event, listener) => { listeners.set(event, listener); }, removeListener: (event) => { listeners.delete(event); } };
  const cleanup = watchWalletSession(provider, `0x${"1".repeat(40)}`, () => { resets += 1; });
  listeners.get("accountsChanged")?.([`0x${"2".repeat(40)}`]);
  listeners.get("chainChanged")?.("0x1");
  assert.equal(resets, 2);
  cleanup();
  assert.equal(listeners.size, 0);
});
