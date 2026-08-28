import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PactDetail } from "../src/components/Dashboard";
import type { PactView, WalletSession } from "../src/lib/contract";

const maker = `0x${"1".repeat(40)}` as const;
const recipient = `0x${"2".repeat(40)}` as const;
const later = String(Math.floor(Date.now() / 1000) + 3600);
const pact: PactView = {
  id: "sp2-5", mode: "SELF", status: "LIVE", title: "UI acceptance", success_criteria: "A public synthetic reading record.",
  maker, taker: "", failure_recipient: recipient, periods_total: "3", allowed_misses: "1",
  stake_atto: "1000000000000000", pot_atto: "1000000000000000", start_unix: later, end_unix: later,
  created_at_iso: new Date().toISOString(), kept_count: "0", miss_count: "0", next_period: "0",
  next_window_open: later, next_window_close: later, window_open_now: false, settleable: false,
  appeal_deadline_unix: "0", appeal_open: false,
};

function render(value: PactView, address: `0x${string}` | null) {
  const session = address ? { address, client: {} } as WalletSession : null;
  return renderToStaticMarkup(createElement(PactDetail, { pact: value, session, checkins: [], onRefresh: async () => {} }));
}

test("the maker can cancel an unstarted self-pact from its interface", () => {
  assert.match(render(pact, maker), /Cancel and refund/);
  assert.doesNotMatch(render(pact, recipient), /Cancel and refund/);
  assert.doesNotMatch(render({ ...pact, start_unix: "1" }, maker), /Cancel and refund/);
});

test("a self-pact failure recipient can claim from a shared pact view", () => {
  const lost = { ...pact, status: "LOST" };
  assert.match(render(lost, recipient), /Claim 0\.001 test GEN/);
  assert.doesNotMatch(render(lost, maker), /Claim 0\.001 test GEN/);
  assert.doesNotMatch(render(lost, null), /Claim 0\.001 test GEN/);
});

test("a shared pact is readable without a wallet and has a share button", () => {
  const html = render(pact, null);
  assert.match(html, /UI acceptance/);
  assert.match(html, /Copy pact link/);
  assert.doesNotMatch(html, /Acting as/);
});
