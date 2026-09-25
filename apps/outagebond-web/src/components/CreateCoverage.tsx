"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CONTRACT_READY,
  acknowledgeTransaction,
  createCoverage,
  formatGen,
  getCoverage,
  getCoverageByRef,
  isAddress,
  isPublicHttpsUrl,
  parseGen,
  type TxProgress,
} from "@/lib/contract";
import { useWallet } from "./WalletProvider";
import TxNotice from "./TxNotice";

export default function CreateCoverage() {
  const router = useRouter();
  const { session } = useWallet();
  const [serviceName, setServiceName] = useState("Northstar API");
  const [serviceUrl, setServiceUrl] = useState("https://api.example.com");
  const [operatorStatusUrl, setOperatorStatusUrl] = useState("https://status.example.com");
  const [region, setRegion] = useState("eu-west");
  const [beneficiary, setBeneficiary] = useState("");
  const [minimum, setMinimum] = useState("300");
  const [tolerance, setTolerance] = useState("60");
  const [payout, setPayout] = useState("0.01");
  const [maxClaims, setMaxClaims] = useState("3");
  const [coverageHours, setCoverageHours] = useState("168");
  const [review, setReview] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [created, setCreated] = useState(false);
  const [progress, setProgress] = useState<TxProgress | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const amount = useMemo(() => { try { return parseGen(payout); } catch { return 0n; } }, [payout]);
  const claims = Number(maxClaims);
  const hours = Number(coverageHours);
  const minSecs = Number(minimum);
  const toleranceSecs = Number(tolerance);

  function validate(): string {
    if (!serviceName.trim() || serviceName.trim().length > 80) return "Enter a service name of at most 80 characters.";
    if (!isPublicHttpsUrl(serviceUrl)) return "Use a public HTTPS service URL with a valid hostname.";
    if (!isPublicHttpsUrl(operatorStatusUrl)) return "Set the provider's public HTTPS status page before accepting coverage.";
    if (!region.trim() || region.trim().length > 80) return "Enter a region or service area, such as eu-west.";
    if (!session) return "Connect the provider wallet before creating coverage.";
    if (!isAddress(beneficiary.trim())) return "Enter the beneficiary's complete wallet address.";
    if (session.address.toLowerCase() === beneficiary.trim().toLowerCase()) return "Provider and beneficiary must use different wallets.";
    if (!Number.isInteger(minSecs) || minSecs < 60 || minSecs > 86400) return "Minimum outage must be 60–86,400 seconds.";
    if (!Number.isInteger(toleranceSecs) || toleranceSecs < 0 || toleranceSecs > 900) return "Time tolerance must be 0–900 seconds.";
    if (amount < 10n ** 15n || amount > 10n ** 18n) return "Payout per incident must be 0.001–1 GEN.";
    if (!Number.isInteger(claims) || claims < 1 || claims > 10) return "Choose 1–10 claim slots.";
    if (!Number.isFinite(hours) || hours < 5 / 60 || hours > 720) return "Coverage must last 5 minutes to 30 days.";
    if (amount * BigInt(claims) > 10n * 10n ** 18n) return "Total coverage collateral cannot exceed 10 GEN.";
    return "";
  }

  async function create() {
    if (busy) return;
    if (!session) { setError("Connect the provider wallet before locking collateral."); return; }
    if (!CONTRACT_READY) { setError("The OutageBond StudioNet address is not configured yet."); return; }
    const issue = validate();
    if (issue) { setError(issue); return; }
    if (!accepted) { setError("Review and acknowledge the coverage terms before signing."); return; }
    setBusy(true);
    setError("");
    const registrationRef = `ob-${crypto.randomUUID()}`;
    try {
      const transactionHash = await createCoverage(session, {
        serviceName: serviceName.trim(),
        registrationRef,
        serviceUrl: serviceUrl.trim(),
        operatorStatusUrl: operatorStatusUrl.trim(),
        region: region.trim(),
        beneficiary: beneficiary.trim() as `0x${string}`,
        minOutageSecs: minSecs,
        toleranceSecs,
        payoutAtto: amount,
        maxClaims: claims,
        coverageSecs: Math.floor(hours * 3600),
      }, setProgress);
      const receipt = await getCoverageByRef(registrationRef);
      if (!receipt.exists || !receipt.coverage_id) throw new Error("The transaction finalized, but its exact coverage record was not found. Refresh protocol status before retrying.");
      const record = await getCoverage(receipt.coverage_id);
      if (record.registration_ref !== registrationRef || record.provider.toLowerCase() !== session.address.toLowerCase()
        || record.beneficiary.toLowerCase() !== beneficiary.trim().toLowerCase()
        || record.service_name !== serviceName.trim() || record.service_url !== serviceUrl.trim()
        || record.operator_status_url !== operatorStatusUrl.trim() || record.region !== region.trim()
        || Number(record.min_outage_secs) !== minSecs || Number(record.tolerance_secs) !== toleranceSecs
        || BigInt(record.payout_atto) !== amount || Number(record.max_claims) !== claims
        || Number(record.ends_at_unix) - Number(record.created_at_unix) !== Math.floor(hours * 3600)) {
        throw new Error("The finalized coverage record does not match the submitted terms. Do not submit again; inspect its onchain details.");
      }
      acknowledgeTransaction(session, transactionHash);
      setCreated(true);
      router.push(`/coverage/${encodeURIComponent(record.id)}?submitted=${encodeURIComponent(transactionHash)}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setBusy(false); }
  }

  if (created) return <section className="loading-panel"><span /><h1>Coverage finalized.</h1><p>Opening the exact onchain record…</p></section>;

  return <section className="form-layout">
    <aside className="form-aside"><p className="eyebrow">PROVIDER SETUP</p><h2>Commit to the rule before the incident.</h2><p>OutageBond locks the maximum compensation on StudioNet. The provider cannot change the service, threshold, beneficiary, or payout after registration.</p>
      <div className="aside-steps"><div><span>01</span><p>Set a fixed outage duration and claim payout.</p></div><div><span>02</span><p>Choose the customer wallet receiving eligible compensation.</p></div><div><span>03</span><p>Attach exactly one payout for each claim slot.</p></div></div>
      <div className="aside-note"><strong>StudioNet demo</strong><span>GEN on StudioNet has no monetary value. The contract has no fee or admin settlement function.</span></div>
    </aside>
    <div className="form-card">
      <div className="form-heading"><div><p className="eyebrow">{review ? "FINAL REVIEW" : "NEW COVERAGE"}</p><h1>{review ? "Lock these terms?" : "Define the coverage."}</h1></div><span>{review ? "02 / 02" : "01 / 02"}</span></div>
      {!review ? <div className="form-stack">
        <div className="field-row"><label><span>Service name</span><input maxLength={80} value={serviceName} onChange={(event) => setServiceName(event.target.value)} /></label><label><span>Customer beneficiary wallet</span><input spellCheck={false} placeholder="0x…" value={beneficiary} onChange={(event) => setBeneficiary(event.target.value)} /></label></div>
        <div className="field-row"><label><span>Canonical service URL</span><input type="url" spellCheck={false} value={serviceUrl} onChange={(event) => setServiceUrl(event.target.value)} /><small>Evidence reports must identify this service.</small></label><label><span>Registered operator status page</span><input type="url" spellCheck={false} value={operatorStatusUrl} onChange={(event) => setOperatorStatusUrl(event.target.value)} /><small>Incident reports must use this host.</small></label></div>
        <div className="field-row"><label><span>Region or service area</span><input maxLength={80} value={region} onChange={(event) => setRegion(event.target.value)} /></label><label><span>Coverage duration (hours)</span><input inputMode="decimal" value={coverageHours} onChange={(event) => setCoverageHours(event.target.value)} /></label></div>
        <div className="field-row field-row-four"><label><span>Minimum outage (seconds)</span><input inputMode="numeric" value={minimum} onChange={(event) => setMinimum(event.target.value)} /></label><label><span>Source time tolerance</span><input inputMode="numeric" value={tolerance} onChange={(event) => setTolerance(event.target.value)} /></label><label><span>Payout / incident (GEN)</span><input inputMode="decimal" value={payout} onChange={(event) => setPayout(event.target.value)} /></label><label><span>Claim slots (1–10)</span><input inputMode="numeric" value={maxClaims} onChange={(event) => setMaxClaims(event.target.value)} /></label></div>
        <div className="collateral-preview"><span>Collateral required</span><strong>{formatGen(amount * (Number.isInteger(claims) ? BigInt(Math.max(0, claims)) : 0n))} <i>GEN</i></strong><small>{Number.isInteger(claims) ? claims : 0} × {formatGen(amount)} GEN</small></div>
        <button className="button button-primary button-wide" type="button" onClick={() => { const issue = validate(); setError(issue); if (!issue) setReview(true); }}>Review coverage</button>
      </div> : <div className="review-stack">
        <div className="review-service"><span>SERVICE · {region}</span><h2>{serviceName}</h2><a href={serviceUrl} target="_blank" rel="noreferrer">{serviceUrl} ↗</a><br /><a href={operatorStatusUrl} target="_blank" rel="noreferrer">Operator status: {operatorStatusUrl} ↗</a></div>
        <dl className="review-grid"><div><dt>Beneficiary</dt><dd className="mono">{beneficiary}</dd></div><div><dt>Minimum outage</dt><dd>{minSecs} seconds</dd></div><div><dt>Cross-source tolerance</dt><dd>±{toleranceSecs} seconds</dd></div><div><dt>Payout per incident</dt><dd>{formatGen(amount)} GEN</dd></div><div><dt>Maximum claims</dt><dd>{claims}</dd></div><div><dt>Coverage length</dt><dd>{hours} hours</dd></div></dl>
        <div className="terms-note"><strong>{formatGen(amount * BigInt(claims))} GEN will be locked</strong><span>The named customer is the only wallet that can submit claims. Anyone may trigger attestation. If the two sources disagree, the claim is marked unverifiable and collateral remains reserved through up to three retries.</span></div>
        <label className="consent"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} disabled={busy} /><span>I understand this is a StudioNet test deployment and the listed collateral has no monetary value.</span></label>
        <div className="form-actions"><button className="button button-secondary" type="button" onClick={() => setReview(false)} disabled={busy}>Edit terms</button><button className="button button-primary" type="button" onClick={() => void create()} disabled={busy || !accepted || !CONTRACT_READY}>{busy ? "Finalizing…" : CONTRACT_READY ? "Lock coverage" : "Preview only"}</button></div>
      </div>}
      {error ? <p className="form-error" role="alert">{error}</p> : null}<TxNotice progress={progress} />
    </div>
  </section>;
}
