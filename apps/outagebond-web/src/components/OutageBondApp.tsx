"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CONTRACT_READY, formatGen, listCoverages, type Coverage } from "@/lib/contract";

function dateLabel(unix: string): string {
  const value = Number(unix);
  return Number.isFinite(value) ? new Date(value * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
}

export default function OutageBondApp() {
  const [coverages, setCoverages] = useState<Coverage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!CONTRACT_READY) { setLoading(false); return; }
    try { setCoverages(await listCoverages()); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return <>
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow"><span className="pulse-dot" />PUBLIC INCIDENTS · SETTLED ON GENLAYER</p>
        <h1>When service<br /><em>goes dark.</em></h1>
        <p className="hero-summary">Providers lock service credits in public. A customer submits a historical outage with two independent reports. GenLayer validators compare the evidence and the compensation rule.</p>
        <div className="hero-actions"><Link className="button button-primary button-large" href="/coverage/new">Create coverage <span>↗</span></Link><a className="button button-secondary button-large" href="#coverage">Explore coverage</a></div>
        <p className="environment-note">{CONTRACT_READY ? "Connected to the configured StudioNet contract" : "Preview mode · transactions remain disabled until deployment"}</p>
      </div>
      <div className="hero-visual" aria-label="Two independent outage reports converging on a compensation decision">
        <div className="visual-orbit orbit-a" /><div className="visual-orbit orbit-b" />
        <div className="event-card">
          <div className="event-top"><span><i /> ILLUSTRATIVE INCIDENT</span><small>NOT LIVE DATA</small></div>
          <strong className="event-title">API unavailable</strong>
          <div className="timeline"><span /><span /><span /><span className="active" /><span className="active" /><span className="active" /><span /><span /></div>
          <div className="event-window"><span>14:02:10</span><b>6m 12s</b><span>14:08:22</span></div>
          <div className="source-pair"><div><small>OPERATOR REPORT</small><strong>Confirmed</strong></div><div><small>INDEPENDENT MONITOR</small><strong>Confirmed</strong></div></div>
        </div>
        <div className="consensus-chip"><span>✓</span><div><small>DERIVED OUTCOME</small><strong>Eligible for 0.01 GEN</strong></div></div>
        <div className="evidence-chip"><small>SAME WINDOW · SAME VERDICT</small><strong>Validator consensus</strong></div>
      </div>
    </section>

    <section className="value-strip" aria-label="Protocol guarantees">
      <div><span>01</span><strong>Two distinct report hosts</strong></div>
      <div><span>02</span><strong>Threshold result must agree</strong></div>
      <div><span>03</span><strong>Escrow and payout onchain</strong></div>
    </section>

    <section id="coverage" className="coverage-section">
      <div className="section-heading"><div><p className="eyebrow">REGISTERED COVERAGE</p><h2>Service commitments</h2></div><span className="count-label">{loading ? "Reading finalized state…" : `${coverages.length} shown · newest first`}</span></div>
      <p className="panel-copy">Records named “OutageBond Synthetic API” are acceptance fixtures, not real outages. Their reports are both demo-author controlled, even though they use different public hosts.</p>
      {!CONTRACT_READY ? <div className="empty-card"><div className="empty-icon">◌</div><h3>Contract address not configured</h3><p>The frontend is ready for StudioNet. After deploying the OutageBond contract, set <code>NEXT_PUBLIC_OUTAGEBOND_ADDRESS</code> to its recorded address.</p><Link className="button button-secondary" href="/status">View release status</Link></div>
        : error ? <div className="empty-card"><h3>Could not read StudioNet</h3><p>{error}</p><button className="button button-secondary" onClick={() => void refresh()}>Retry read</button></div>
          : !coverages.length && !loading ? <div className="empty-card"><div className="empty-icon">⌁</div><h3>No coverage registered yet</h3><p>Start with a service, a named beneficiary, an outage threshold, and enough test GEN to fund the claim slots.</p><Link className="button button-primary" href="/coverage/new">Register coverage</Link></div>
            : <div className="coverage-grid">{coverages.map((coverage) => <article className="coverage-card" key={coverage.id}>
              <div className="card-eyebrow"><span className={`status-dot ${coverage.closed ? "closed" : ""}`} />{coverage.closed ? "CLOSED" : coverage.can_submit ? "ACCEPTING CLAIMS" : "CAPACITY RESERVED"}<span className="mono">{coverage.id}</span></div>
              <h3>{coverage.service_name}</h3><p>{coverage.service_url} · {coverage.region}</p>
              <div className="coverage-metrics"><div><small>PER INCIDENT</small><strong>{formatGen(coverage.payout_atto)} <i>GEN</i></strong></div><div><small>MINIMUM OUTAGE</small><strong>{Math.ceil(Number(coverage.min_outage_secs) / 60)} <i>MIN</i></strong></div><div><small>CLAIMS</small><strong>{coverage.claims_submitted} / {coverage.max_claims}</strong></div></div>
              <div className="card-bottom"><span>Ends {dateLabel(coverage.ends_at_unix)}</span><Link href={`/coverage/${encodeURIComponent(coverage.id)}`}>Open coverage <b>↗</b></Link></div>
            </article>)}</div>}
    </section>

    <section className="how-grid">
      <div><p className="eyebrow">THE CLAIM FLOW</p><h2>Make outages<br />settle on evidence.</h2><p>Coverage rules and collateral are committed before an incident. The claim keeps its UTC window and both report links fixed while validators independently extract the facts.</p><Link href="/how-it-works" className="text-link">Read how it works ↗</Link></div>
      <div className="flow-list"><div><span>01</span><p><strong>Provider registers coverage</strong><small>Collateral, service, region, minimum duration and payout are fixed onchain.</small></p></div><div><span>02</span><p><strong>Beneficiary submits two sources</strong><small>One service report and a second report from a different public host.</small></p></div><div><span>03</span><p><strong>Anyone calls attest()</strong><small>Validators re-fetch both pages and must agree on the derived eligibility result.</small></p></div><div><span>04</span><p><strong>Beneficiary collects</strong><small>Eligible payouts remain reserved for 30 days, then can be returned if unclaimed.</small></p></div></div>
    </section>
  </>;
}
