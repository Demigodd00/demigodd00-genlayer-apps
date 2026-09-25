"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  attest,
  acknowledgeTransaction,
  claimPayout,
  CONTRACT_READY,
  expirePayout,
  expireClaim,
  formatGen,
  getClaim,
  getCoverage,
  type Coverage,
  type EvidenceReading,
  type IncidentClaim,
  type TxProgress,
} from "@/lib/contract";
import { useWallet } from "./WalletProvider";
import TxNotice from "./TxNotice";
import { utcLabel as dateLabel } from "@/lib/time";

function verdictLabel(value: string): string {
  return value.replaceAll("_", " ").replace("OUTAGE QUALIFIES", "OUTAGE · QUALIFIES")
    .replace("OUTAGE TOO SHORT", "OUTAGE · BELOW THRESHOLD");
}

function SourceCard({ title, reading }: { title: string; reading?: EvidenceReading }) {
  if (!reading) return <article className="source-card"><p className="eyebrow">{title}</p><strong>Awaiting attestation</strong></article>;
  return <article className="source-card">
    <div className="source-card-heading"><p className="eyebrow">{title}</p><span className={`mini-status status-${reading.source_verdict.toLowerCase()}`}>{verdictLabel(reading.source_verdict)}</span></div>
    <a className="source-url" href={reading.url} target="_blank" rel="noreferrer">{reading.url} ↗</a>
    <div className="source-facts"><span>Readable <b>{reading.readable ? "Yes" : "No"}</b></span><span>Service match <b>{reading.service_match ? "Yes" : "No"}</b></span><span>Region match <b>{reading.region_match ? "Yes" : "No"}</b></span><span>Confidence <b>{reading.confidence_bucket}%</b></span></div>
    {reading.start_unix > 0 ? <div className="source-window"><span>{dateLabel(reading.start_unix)}</span><b>→</b><span>{dateLabel(reading.end_unix)}</span></div> : null}
  </article>;
}

export default function ClaimDetail({ claimId }: { claimId: string }) {
  const { session } = useWallet();
  const [claim, setClaim] = useState<IncidentClaim | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<TxProgress | null>(null);
  const [attestationTx, setAttestationTx] = useState("");
  const [submissionTx, setSubmissionTx] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);

  const refresh = useCallback(async () => {
    if (!CONTRACT_READY) { setLoading(false); return; }
    try {
      const record = await getClaim(claimId);
      const associatedCoverage = await getCoverage(record.coverage_id);
      setClaim(record);
      setCoverage(associatedCoverage);
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setLoading(false); }
  }, [claimId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSubmissionTx(params.get("submitted") ?? "");
    void refresh();
    const refreshTimer = window.setInterval(() => void refresh(), 5000);
    const clockTimer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    setNow(Math.floor(Date.now() / 1000));
    return () => { window.clearInterval(refreshTimer); window.clearInterval(clockTimer); };
  }, [refresh]);

  const attestation = claim?.attestation;
  const claimantOwns = Boolean(session && claim && session.address.toLowerCase() === claim.claimant.toLowerCase());
  const retryAt = useMemo(() => Number(claim?.attested_at_unix ?? 0) + 60, [claim?.attested_at_unix]);
  const waitingToRetry = Boolean(claim?.status === "PENDING" && Number(claim.attestation_attempts) > 0 && now < retryAt);

  async function run(action: "attest" | "payout" | "expire" | "expire-claim") {
    if (!session || busy) return;
    setBusy(true);
    setError("");
    try {
      let hash: string;
      if (action === "attest") {
        hash = await attest(session, claimId, setProgress);
        setAttestationTx(hash);
      } else if (action === "payout") {
        hash = await claimPayout(session, claimId, setProgress);
      } else if (action === "expire-claim") {
        hash = await expireClaim(session, claimId, setProgress);
      } else {
        hash = await expirePayout(session, claimId, setProgress);
      }
      await getClaim(claimId);
      acknowledgeTransaction(session, hash);
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  if (loading) return <section className="loading-panel"><span /><p>Reading the exact incident claim…</p></section>;
  if (!CONTRACT_READY) return <section className="empty-card page-empty"><h1>Claim requires a deployment</h1><p>Configure the StudioNet contract address to read incident records.</p></section>;
  if (!claim || !coverage) return <section className="empty-card page-empty"><h1>Claim not found</h1><p>{error || "The claim ID is not registered on the configured contract."}</p><Link href="/" className="button button-secondary">Back to coverage</Link></section>;

  return <section className="detail-page claim-detail-page">
    <div className="breadcrumb"><Link href={`/coverage/${encodeURIComponent(claim.coverage_id)}`}>{coverage.service_name}</Link><span>/</span><span>{claim.id}</span></div>
    <header className="detail-header"><div><p className="eyebrow">INCIDENT CLAIM · {claim.id}</p><h1>{claim.status === "PENDING" ? "Evidence review" : verdictLabel(claim.status)}</h1><p>{coverage.service_name} <span>·</span> {coverage.region}</p></div><span className={`claim-status status-${claim.status.toLowerCase()}`}>{claim.status.replaceAll("_", " ")}</span></header>
    {coverage.service_name === "OutageBond Synthetic API" ? <p className="terms-note">Synthetic acceptance fixture, not a real outage. Both reports are demo-author controlled; distinct hosts do not establish operational independence.</p> : null}
    <div className="claim-summary">
      <div><small>SUBMITTED BY</small><strong className="mono">{claim.claimant}</strong></div>
      <div><small>INCIDENT START · UTC</small><strong>{dateLabel(claim.incident_start_unix)}</strong></div>
      <div><small>INCIDENT END · UTC</small><strong>{dateLabel(claim.incident_end_unix)}</strong></div>
      <div><small>MINIMUM OUTAGE</small><strong>{coverage.min_outage_secs} seconds</strong></div>
    </div>

    {attestation?.outcome ? <section className={`decision-banner decision-${attestation.outcome.toLowerCase()}`}>
      <span>{attestation.outcome === "ELIGIBLE" ? "✓" : attestation.outcome === "INELIGIBLE" ? "×" : "?"}</span>
      <div><small>GENLAYER CONSENSUS RESULT · ATTEMPT {claim.attestation_attempts} / 3</small><strong>{verdictLabel(attestation.outcome)}</strong><p>{attestation.reason}</p>
        {attestation.intervals_agree ? <em>The two extracted outage intervals agree within ±{coverage.tolerance_secs} seconds.</em> : <em>The source readings do not currently support one shared interval and outcome.</em>}
      </div>
    </section> : null}

    {claim.status === "PENDING" && Number(claim.attestation_attempts) > 0 ? <div className="retry-notice"><strong>{attestation?.outcome === "UNVERIFIABLE" ? "The two sources did not produce a reliable shared result." : "Waiting for an attestation attempt."}</strong><span>{Number(claim.attestation_attempts) < 3 ? waitingToRetry ? `Another permissionless attempt becomes available ${dateLabel(String(retryAt))}. The same URLs and incident window stay fixed.` : "Anyone can retry now using the same submitted evidence links." : "Three attempts were used. Reserved collateral has returned to the coverage pool."}</span></div> : null}

    <div className="source-grid"><SourceCard title="SERVICE OPERATOR REPORT" reading={attestation?.operator} /><SourceCard title="INDEPENDENT MONITOR" reading={attestation?.monitor} /></div>

    <section className="submission-proof panel"><div><p className="eyebrow">EXACT SUBMISSION</p><h2>Evidence links are fixed</h2><p>Validators fetch these submitted URLs directly. The frontend reads this claim ID after finality and verifies its wallet, incident window, and both source links against the submission.</p></div><div className="proof-meta"><span>Submitted <b>{dateLabel(claim.submitted_at_unix)}</b></span><span>Claim transaction <b>{submissionTx || "Open this page from the coverage record to inspect the source transaction."}</b></span>{attestationTx ? <span>Attestation transaction <b>{attestationTx}</b></span> : null}</div></section>

    <div className="claim-actions">
      {claim.can_expire_claim ? <button className="button button-primary" type="button" onClick={() => void run("expire-claim")} disabled={busy || !session}>Release timed-out claim reservation</button> : null}
      {claim.can_attest ? <button className="button button-primary" type="button" onClick={() => void run("attest")} disabled={busy || !session}>{busy ? "Waiting for validators…" : "Run independent attestation"}</button> : claim.status === "PENDING" && !claim.can_expire_claim ? <button className="button button-primary" type="button" disabled>{waitingToRetry ? "Retry delay active" : "Waiting for incident window"}</button> : null}
      {claim.can_claim_payout && claimantOwns ? <button className="button button-primary" type="button" onClick={() => void run("payout")} disabled={busy}>{busy ? "Finalizing payout…" : `Collect ${formatGen(claim.payout_atto)} GEN`}</button> : null}
      {claim.can_expire_payout ? <button className="button button-secondary" type="button" onClick={() => void run("expire")} disabled={busy || !session}>Release expired payout</button> : null}
      <Link className="button button-secondary" href={`/coverage/${encodeURIComponent(claim.coverage_id)}`}>Back to coverage</Link>
    </div>
    <p className="panel-copy">Attestation deadline: {dateLabel(claim.attestation_deadline_unix)}. After that deadline, anyone can release an unresolved reservation without inferring an outage verdict. {claim.resolution_reason}</p>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <TxNotice progress={progress} />
  </section>;
}
