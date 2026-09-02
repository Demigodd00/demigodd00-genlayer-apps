"use client";

import { useEffect, useState } from "react";
import {
  CONTRACT_READY,
  formatGen,
  friendlyError,
  getPact,
  joinPact,
  shortenAddress,
  type PactView,
  type TxProgress,
  type WalletSession,
} from "@/lib/contract";
import TxNotice from "./TxNotice";
import { transactionPending } from "@/lib/ui-state";

export default function JoinPact({
  session,
  onJoined,
}: {
  session: WalletSession | null;
  onJoined: () => void;
}) {
  const [pactId, setPactId] = useState("");
  const [pact, setPact] = useState<PactView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<TxProgress | null>(null);
  const busy = transactionPending(progress);

  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.search).get("pact");
    if (fromLink) setPactId(fromLink);
  }, []);

  async function review() {
    if (loading || busy) return;
    setError("");
    setPact(null);
    if (!CONTRACT_READY) {
      setError("Joining is unavailable in preview mode.");
      return;
    }
    if (!pactId.trim()) {
      setError("Enter a pact ID from your invitation.");
      return;
    }
    setLoading(true);
    try {
      const result = await getPact(pactId.trim());
      if (result.mode !== "CHALLENGE" || result.status !== "OPEN") {
        throw new Error("This pact is not open for a challenger.");
      }
      setPact(result);
    } catch (reviewError) {
      setError(friendlyError(reviewError));
    } finally {
      setLoading(false);
    }
  }

  async function join() {
    if (busy) return;
    setError("");
    if (!session || !pact) {
      setError("Connect your wallet before joining.");
      return;
    }
    try {
      await joinPact(session, pact.id, BigInt(pact.stake_atto), setProgress);
      onJoined();
    } catch (joinError) {
      setError(friendlyError(joinError));
    }
  }

  return (
    <section className="join-layout">
      <div className="join-intro">
        <p className="eyebrow">Challenge invitation</p>
        <h2>Join a challenge</h2>
        <p>Match the test stake. The rules are fixed.</p>
      </div>
      <div className="form-card join-card">
        <label><span>Pact ID</span><div className="input-action"><input value={pactId} disabled={busy || loading} onChange={(event) => { setPactId(event.target.value); setPact(null); }} placeholder="sp2-…" /><button className="button button-secondary" disabled={busy || loading} onClick={() => void review()}>{loading ? "Loading…" : "Review"}</button></div></label>
        {pact ? (
          <div className="invite-review">
            <div className="detail-chips"><span className="mode-chip mode-challenge">Challenge</span><span className="status-chip status-open">Open</span></div>
            <h3>{pact.title}</h3>
            <p>{pact.success_criteria}</p>
            <dl className="review-grid">
              <div><dt>Maker</dt><dd>{shortenAddress(pact.maker)}</dd></div>
              <div><dt>You match</dt><dd>{formatGen(pact.stake_atto)} test GEN</dd></div>
              <div><dt>Periods</dt><dd>{pact.periods_total}</dd></div>
              <div><dt>Allowed misses</dt><dd>{pact.allowed_misses}</dd></div>
              <div className="review-wide"><dt>Evidence attestor</dt><dd>{shortenAddress(pact.evidence_attestor)} · {pact.provenance_policy === "WALLET_VERIFIED" ? "verifier" : "self"}</dd></div>
              <div className="review-wide"><dt>Starts</dt><dd>{new Date(Number(pact.start_unix) * 1000).toLocaleString()}</dd></div>
            </dl>
            <button className="button button-primary button-wide" disabled={busy} onClick={() => void join()}>Match stake &amp; join</button>
          </div>
        ) : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <TxNotice progress={progress} />
      </div>
    </section>
  );
}
