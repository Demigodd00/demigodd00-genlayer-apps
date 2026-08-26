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

  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.search).get("pact");
    if (fromLink) setPactId(fromLink);
  }, []);

  async function review() {
    setError("");
    setPact(null);
    if (!CONTRACT_READY) {
      setError("Join links become active after the reviewed V2 contract is deployed.");
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
        <h2>Read the commitment before you back the other side.</h2>
        <p>Joining matches the maker’s StudioNet test stake. The rules, schedule, evidence policy, and appeal window cannot be changed afterward.</p>
        <ol>
          <li><span>01</span>Open the shared pact ID</li>
          <li><span>02</span>Review the exact success criteria</li>
          <li><span>03</span>Match the test stake with your wallet</li>
        </ol>
      </div>
      <div className="form-card join-card">
        <label><span>Pact ID</span><div className="input-action"><input value={pactId} onChange={(event) => setPactId(event.target.value)} placeholder="sp2-…" /><button className="button button-secondary" onClick={() => void review()}>{loading ? "Loading…" : "Review"}</button></div></label>
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
              <div className="review-wide"><dt>Starts</dt><dd>{new Date(Number(pact.start_unix) * 1000).toLocaleString()}</dd></div>
            </dl>
            <button className="button button-primary button-wide" onClick={() => void join()}>Match test stake and join</button>
          </div>
        ) : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <TxNotice progress={progress} />
      </div>
    </section>
  );
}
