import assert from "node:assert/strict";
import test from "node:test";
import type { EthereumProvider, PactView, TxProgress } from "../src/lib/contract";
import { formatCountdown, initialWorkspace, oneTransactionAtATime, pactShareUrl, pactTiming, readAllPages, readRecentPage, transactionPending, watchWalletSession } from "../src/lib/ui-state";

const timed = {
  status: "LIVE", next_period: "0", periods_total: "3", next_window_open: "1000",
  next_window_close: "1060", end_unix: "1180", appeal_deadline_unix: "1500",
} as PactView;

test("shared pact links open the dashboard while legacy invitation links still work", () => {
  assert.equal(initialWorkspace("?pact=sp2-5&view=dashboard"), "dashboard");
  assert.equal(initialWorkspace("?pact=sp2-5&view=join"), "join");
  assert.equal(initialWorkspace("?pact=sp2-5"), "join");
  assert.equal(initialWorkspace(""), "dashboard");
  assert.equal(pactShareUrl("https://streakpact.example", "sp2-5"), "https://streakpact.example/?pact=sp2-5&view=dashboard");
});

test("proof controls open and close at the correct local-clock boundaries", () => {
  assert.equal(pactTiming(timed, 999).window_open_now, false);
  assert.equal(pactTiming(timed, 1000).window_open_now, true);
  assert.equal(pactTiming(timed, 1059).window_open_now, true);
  assert.equal(pactTiming(timed, 1060).window_open_now, false);
});

test("result controls become available after the last period or after all verdicts", () => {
  assert.equal(pactTiming(timed, 1179).settleable, false);
  assert.equal(pactTiming(timed, 1180).settleable, true);
  assert.equal(pactTiming({ ...timed, next_period: "3" }, 1100).settleable, true);
  assert.equal(pactTiming({ ...timed, status: "SETTLED" }, 1200).settleable, false);
});

test("appeal controls include the contract deadline second, then close", () => {
  const provisional = { ...timed, status: "PROVISIONAL_LOST" };
  assert.equal(pactTiming(provisional, 1500).appeal_open, true);
  assert.equal(pactTiming(provisional, 1501).appeal_open, false);
  assert.equal(pactTiming(timed, 1400).appeal_open, false);
});

test("short StudioNet windows show seconds rather than zero hours", () => {
  assert.equal(formatCountdown("1029", 1000), "29s");
  assert.equal(formatCountdown("1061", 1000), "1m 1s");
  assert.equal(formatCountdown("999", 1000), "Now");
});

test("all pending transaction stages disable duplicate actions", () => {
  for (const state of ["awaiting-signature", "submitted", "finalizing"] as const) {
    assert.equal(transactionPending({ state, label: "pending" }), true);
  }
  for (const state of ["confirmed", "failed"] as const) {
    assert.equal(transactionPending({ state, label: "done" } as TxProgress), false);
  }
  assert.equal(transactionPending(null), false);
});

test("duplicate writes for the same account cannot start while one is pending", async () => {
  let finish!: () => void;
  const pending = oneTransactionAtATime("0xABC", () => new Promise<void>((resolve) => { finish = resolve; }));
  await assert.rejects(oneTransactionAtATime("0xabc", async () => "duplicate"), /already in progress/);
  assert.equal(await oneTransactionAtATime("0xDEF", async () => "other wallet"), "other wallet");
  finish();
  await pending;
  assert.equal(await oneTransactionAtATime("0xabc", async () => "next"), "next");
});

test("a rejected wallet action releases its local transaction lock", async () => {
  await assert.rejects(oneTransactionAtATime("0x123", async () => { throw new Error("User rejected"); }), /User rejected/);
  assert.equal(await oneTransactionAtATime("0x123", async () => "retry"), "retry");
});

test("all 60 period verdicts are loaded through the contract's 25-item pages", async () => {
  const calls: number[] = [];
  const all = Array.from({ length: 60 }, (_, index) => index);
  const result = await readAllPages(async (offset, count) => {
    calls.push(offset);
    return { total: "60", items: all.slice(offset, offset + count) };
  }, 60);
  assert.deepEqual(result, all);
  assert.deepEqual(calls, [0, 25, 50]);
});

test("an empty page cannot silently hide remaining verdicts", async () => {
  await assert.rejects(readAllPages(async () => ({ total: "30", items: [] }), 60), /incomplete page/);
});

test("recent pacts include the newest creation after the first 25 pacts", async () => {
  const all = Array.from({ length: 32 }, (_, index) => index + 1);
  const result = await readRecentPage(async (offset, count) => ({ total: "32", items: all.slice(offset, offset + count) }));
  assert.deepEqual(result, all.slice(-25).reverse());
});

test("wallet account, network and disconnect events invalidate the session and are cleaned up", () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  let resets = 0;
  const provider: EthereumProvider = {
    request: async () => [],
    on: (event, listener) => { listeners.set(event, listener); },
    removeListener: (event, listener) => { if (listeners.get(event) === listener) listeners.delete(event); },
  };
  const cleanup = watchWalletSession(provider, "0xABC", () => { resets += 1; });
  listeners.get("accountsChanged")!(["0xabc"]);
  assert.equal(resets, 0);
  listeners.get("accountsChanged")!(["0xdef"]);
  listeners.get("chainChanged")!("0x1");
  listeners.get("disconnect")!();
  assert.equal(resets, 3);
  cleanup();
  assert.equal(listeners.size, 0);
});
