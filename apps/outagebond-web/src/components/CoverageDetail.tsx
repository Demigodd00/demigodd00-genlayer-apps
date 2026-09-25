"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CONTRACT_READY,
  acknowledgeTransaction,
  closeCoverage,
  formatGen,
  getClaim,
  getClaimForDay,
  getCoverage,
  isPublicHttpsUrl,
  listClaims,
  samePublicHost,
  submitClaim,
  type Coverage,
  type IncidentClaim,
  type TxProgress,
} from "@/lib/contract";
import { useWallet } from "./WalletProvider";
import TxNotice from "./TxNotice";
import { utcLabel as dateLabel } from "@/lib/time";

function localDate(minutesAgo: number): string {
  const date = new Date(Date.now() - minutesAgo * 60_000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function CoverageDetail({ coverageId }: { coverageId: string }) {
  const router = useRouter();
  const { session } = useWallet();
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [claims, setClaims] = useState<IncidentClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [startText, setStartText] = useState(() => localDate(25));
  const [endText, setEndText] = useState(() => localDate(15));
  const [operatorUrl, setOperatorUrl] = useState("");
  const [monitorUrl, setMonitorUrl] = useState("");
  const [progress, setProgress] = useState<TxProgress | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!CONTRACT_READY) { setLoading(false); return; }
    try {
      const [latestCoverage, latestClaims] = await Promise.all([getCoverage(coverageId), listClaims(coverageId)]);
      setCoverage(latestCoverage);
      setClaims(latestClaims.reverse());
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setLoading(false); }
  }, [coverageId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const startUnix = useMemo(() => Math.floor(new Date(startText).getTime() / 1000), [startText]);
  const endUnix = useMemo(() => Math.floor(new Date(endText).getTime() / 1000), [endText]);
  const isBeneficiary = Boolean(session && coverage && session.address.toLowerCase() === coverage.beneficiary.toLowerCase());
  const isProvider = Boolean(session && coverage && session.address.toLowerCase() === coverage.provider.toLowerCase());

  function validate(): string {
    if (!session) return "Connect the named beneficiary wallet to report an incident.";
    if (!isBeneficiary) return "Only the beneficiary wallet recorded in this coverage may submit a claim.";
    if (!coverage?.can_submit) return "This coverage is not currently accepting claims.";
    if (!Number.isFinite(startUnix) || !Number.isFinite(endUnix) || startUnix <= 0 || endUnix <= startUnix) return "Enter a valid incident start and end.";
    if (endUnix > Math.floor(Date.now() / 1000)) return "The incident must have ended before it can be claimed.";
    if (endUnix - startUnix > 86400) return "An incident window cannot exceed 24 hours.";
    if (startUnix < Number(coverage.created_at_unix) || endUnix > Number(coverage.ends_at_unix)) return "The incident must fall within the coverage dates.";
    if (!isPublicHttpsUrl(operatorUrl) || !isPublicHttpsUrl(monitorUrl)) return "Both report links must be public HTTPS URLs.";
    if (!samePublicHost(operatorUrl, coverage.operator_status_url)) return "Use the status-page host committed when this coverage was created.";
    if (samePublicHost(operatorUrl, monitorUrl)) return "Use reports hosted on two different public domains.";
    if (samePublicHost(monitorUrl, coverage.service_url)) return "Use a monitor hosted separately from the service itself.";
    return "";
  }

  async function report() {
    if (busy || !session) return;
    const issue = validate();
    if (issue) { setError(issue); return; }
    setBusy(true);
    setError("");
    try {
      const txHash = await submitClaim(session, coverageId, startUnix, endUnix, operatorUrl.trim(), monitorUrl.trim(), setProgress);
      const day = Math.floor(startUnix / 86400) * 86400;
      const ref = await getClaimForDay(coverageId, day);
      if (!ref.exists || !ref.claim_id) throw new Error("The finalized transaction has no claim for its submitted UTC day. Check the transaction before retrying.");
      const record = await getClaim(ref.claim_id);
      if (record.coverage_id !== coverageId || record.claimant.toLowerCase() !== session.address.toLowerCase()
        || Number(record.incident_start_unix) !== startUnix || Number(record.incident_end_unix) !== endUnix
        || record.operator_report_url !== operatorUrl.trim() || record.monitor_report_url !== monitorUrl.trim()) {
        throw new Error("The onchain claim does not match these exact incident details. Do not resubmit; inspect the recorded claim.");
      }
      acknowledgeTransaction(session, txHash);
      router.push(`/claims/${encodeURIComponent(record.id)}?submitted=${encodeURIComponent(txHash)}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function close() {
    if (!session || !coverage || busy) return;
    setBusy(true);
    setError("");
    try { const hash = await closeCoverage(session, coverage.id, setProgress); await getCoverage(coverage.id); acknowledgeTransaction(session, hash); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  if (loading) return <section className="loading-panel"><span /><p>Reading finalized coverage…</p></section>;
  if (!CONTRACT_READY) return <section className="empty-card page-empty"><h1>Coverage requires a deployment</h1><p>Configure the OutageBond StudioNet address to load its onchain records.</p></section>;
  if (!coverage) return <section className="empty-card page-empty"><h1>Coverage not found</h1><p>{error || "This ID is not registered on the configured StudioNet contract."}</p><Link className="button button-secondary" href="/">Back to coverage</Link></section>;

  return <section className="detail-page">
    <div className="breadcrumb"><Link href="/">Coverage</Link><span>/</span><span>{coverage.id}</span></div>
    <header className="detail-header"><div><p className="eyebrow">{coverage.closed ? "CLOSED COVERAGE" : "STUDIONET COVERAGE"} · {coverage.id}</p><h1>{coverage.service_name}</h1><p>{coverage.service_url} <span>·</span> {coverage.region}</p></div><a className="button button-secondary" href={coverage.service_url} target="_blank" rel="noreferrer">Service ↗</a></header>
    <div className="detail-stats">
      <div><small>BENEFICIARY</small><strong className="mono">{coverage.beneficiary}</strong></div><div><small>PAYOUT / QUALIFIED INCIDENT</small><strong>{formatGen(coverage.payout_atto)} <i>GEN</i></strong></div><div><small>MINIMUM DURATION</small><strong>{coverage.min_outage_secs}s <i>outage</i></strong></div><div><small>READING TOLERANCE</small><strong>±{coverage.tolerance_secs}s</strong></div>
    </div>
    <div className="balance-line"><span>Collateral available <b>{formatGen(coverage.available_atto)} GEN</b></span><span>Reserved for active claims <b>{formatGen(coverage.reserved_atto)} GEN</b></span><span>Expires <b>{dateLabel(coverage.ends_at_unix)}</b></span></div>

    <div className="detail-columns">
      {isBeneficiary && coverage.can_submit ? <section className="panel claim-form">
        <div className="panel-heading"><div><p className="eyebrow">BENEFICIARY ACTION</p><h2>Report an incident</h2></div><span>New claim</span></div>
        <p className="panel-copy">The incident window and both links become immutable. Each claim reserves every UTC day it touches, including both days for a cross-midnight outage.</p>
        <div className="form-stack"><div className="field-row"><label><span>Incident start (local time)</span><input type="datetime-local" value={startText} onChange={(event) => setStartText(event.target.value)} /></label><label><span>Incident end (local time)</span><input type="datetime-local" value={endText} onChange={(event) => setEndText(event.target.value)} /></label></div>
          <label><span>Service operator incident report · registered host</span><input type="url" spellCheck={false} placeholder={`${coverage.operator_status_url}/incidents/…`} value={operatorUrl} onChange={(event) => setOperatorUrl(event.target.value)} /><small>Must match {coverage.operator_status_url}</small></label>
          <label><span>Independent monitor report</span><input type="url" spellCheck={false} placeholder="https://monitor.example/incidents/…" value={monitorUrl} onChange={(event) => setMonitorUrl(event.target.value)} /><small>Must use a different public host from the operator report.</small></label>
          <button className="button button-primary button-wide" type="button" onClick={() => void report()} disabled={busy}>{busy ? "Finalizing…" : "Submit exact incident"}</button>
        </div>
      </section> : <section className="panel eligibility-panel"><p className="eyebrow">CLAIM ACCESS</p><h2>{coverage.closed ? "Coverage closed" : !coverage.can_submit ? "Claim capacity unavailable" : "Named beneficiary"}</h2><p>{coverage.closed ? "This coverage is closed; existing onchain claims remain available." : isBeneficiary ? "The coverage has no remaining claim slots or its report period has ended." : "Only the customer wallet named when coverage was created can submit an incident claim."}</p>{!session ? <small>Connect the beneficiary wallet to submit a report.</small> : null}</section>}
      <section className="panel policy-panel"><p className="eyebrow">FIXED POLICY</p><h2>Terms onchain</h2><dl><div><dt>Provider</dt><dd className="mono">{coverage.provider}</dd></div><div><dt>Coverage created</dt><dd>{dateLabel(coverage.created_at_unix)}</dd></div><div><dt>Claim slots used</dt><dd>{coverage.claims_submitted} total · {coverage.paid_claims} paid</dd></div><div><dt>Retries for unclear evidence</dt><dd>Up to 3 attestations, 60 seconds apart</dd></div><div><dt>Collection window</dt><dd>30 days after an eligible attestation</dd></div></dl>
        {coverage.can_close && isProvider ? <button className="button button-secondary button-wide" type="button" onClick={() => void close()} disabled={busy}>Close coverage and return unused collateral</button> : null}
      </section>
    </div>

    <section className="claims-section"><div className="section-heading"><div><p className="eyebrow">PUBLIC RECORD</p><h2>Incident claims</h2></div><button className="button button-secondary" onClick={() => void refresh()}>Refresh ↻</button></div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {!claims.length ? <div className="empty-card compact"><p>No incident has been submitted for this coverage.</p></div> : <div className="claim-list">{claims.map((claim) => <Link className="claim-row" href={`/claims/${encodeURIComponent(claim.id)}`} key={claim.id}><span className={`claim-status status-${claim.status.toLowerCase()}`}>{claim.status.replaceAll("_", " ")}</span><span className="mono">{claim.id}</span><span>{dateLabel(claim.incident_start_unix)}</span><span className="mono">{claim.claimant.slice(0, 6)}…{claim.claimant.slice(-4)}</span><b>Open ↗</b></Link>)}</div>}
    </section>
    <TxNotice progress={progress} />
  </section>;
}
