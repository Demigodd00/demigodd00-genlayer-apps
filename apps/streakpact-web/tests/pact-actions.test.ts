import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PactDetail } from "../src/components/Dashboard";
import type { CheckinView, PactView, WalletSession } from "../src/lib/contract";

const maker = `0x${"1".repeat(40)}` as const;
const recipient = `0x${"2".repeat(40)}` as const;
const verifier = `0x${"3".repeat(40)}` as const;
const later = String(Math.floor(Date.now() / 1000) + 3600);
const pact: PactView = {
  id: "sp2-5", mode: "SELF", status: "LIVE", title: "UI acceptance", success_criteria: "A public synthetic reading record.",
  maker, taker: "", failure_recipient: recipient, evidence_attestor: maker, provenance_policy: "SELF_ATTESTED",
  periods_total: "3", allowed_misses: "1",
  stake_atto: "1000000000000000", pot_atto: "1000000000000000", start_unix: later, end_unix: later,
  created_at_iso: new Date().toISOString(), kept_count: "0", miss_count: "0", next_period: "0",
  next_window_open: later, next_window_close: later, window_open_now: false, settleable: false,
  appeal_deadline_unix: "0", appeal_open: false,
};

function render(value: PactView, address: `0x${string}` | null, checkins: CheckinView[] = []) {
  const session = address ? { address, client: {} } as WalletSession : null;
  return renderToStaticMarkup(createElement(PactDetail, { pact: value, session, checkins, onRefresh: async () => {} }));
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

test("an unmatched voided challenge shows the refunded stake, not a theoretical matched pot", () => {
  const voided = {
    ...pact,
    mode: "CHALLENGE" as const,
    status: "VOIDED",
    stake_atto: "10000000000000000",
    pot_atto: "20000000000000000",
  };
  const html = render(voided, maker);
  assert.match(html, /0\.01 GEN/);
  assert.match(html, /refunded/);
  assert.match(html, /Cancelled before start/);
  assert.match(html, /Original rules remain visible onchain for auditability\./);
  assert.doesNotMatch(html, /0\.02 GEN/);
  assert.doesNotMatch(html, /matched pot/);
});

test("only the configured verifier gets the signed check-in controls", () => {
  const now = Math.floor(Date.now() / 1000);
  const verified = {
    ...pact,
    evidence_attestor: verifier,
    provenance_policy: "WALLET_VERIFIED" as const,
    start_unix: String(now - 10),
    end_unix: String(now + 170),
    next_window_open: String(now - 10),
    next_window_close: String(now + 50),
    window_open_now: true,
  };
  assert.match(render(verified, maker), /Waiting for verifier/);
  assert.doesNotMatch(render(verified, maker), /Sign and submit/);
  assert.match(render(verified, verifier), /Sign and submit/);
});

test("all periods and complete original audit fields remain reviewable", () => {
  const checkins = Array.from({ length: 7 }, (_, period): CheckinView => {
    const record = {
      verdict: "KEPT" as const,
      method: "SIGNED_CONTENT_EVIDENCE",
      statement: `Signed statement for period ${period + 1}`,
      evidence_url: `https://arweave.net/period-${period + 1}`,
      content_digest: String(period).padStart(64, "0"),
      confidence_bucket: "90",
      reason: `Complete original reason for period ${period + 1}`,
      judged_at_iso: "2033-05-18T04:00:30+00:00",
      attestor: verifier,
      observed_at_iso: "2033-05-18T04:00:23+00:00",
      attestation_id: String(period + 1).padStart(64, "0"),
      provenance: "WALLET_VERIFIED",
    };
    return {
      period: String(period), ...record, subject: maker, configured_attestor: verifier,
      attestation_schema: "streakpact.wallet-attestation.v1", appealed: false,
      original_record: record, appeal_record: {},
    };
  });
  const html = render({ ...pact, status: "SETTLED", periods_total: "7", kept_count: "7" }, maker, checkins);
  assert.match(html, /Show 3 earlier periods/);
  assert.match(html, /Complete original reason for period 1/);
  assert.match(html, /Signed statement for period 1/);
  assert.match(html, new RegExp(verifier));
  assert.match(html, /Provenance/);
  assert.match(html, /Judged/);
});
