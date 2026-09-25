"use client";

import { useEffect, useState } from "react";
import { CONTRACT_ADDRESS, CONTRACT_READY, EXPLORER_URL, getStats, type ProtocolStats } from "@/lib/contract";

export default function ProtocolStatus() {
  const [stats, setStats] = useState<ProtocolStats | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!CONTRACT_READY) return;
    setBusy(true);
    try { setStats(await getStats()); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  useEffect(() => { void refresh(); }, []);

  return <section className="status-page">
    <p className="eyebrow">READ-ONLY PROTOCOL CONSOLE</p><h1>OutageBond release status.</h1><p className="status-lede">Inspect the configured contract and its public counters. This page cannot alter verdicts or escrow.</p>
    <div className="status-grid"><div className="status-card"><small>NETWORK</small><strong>GenLayer StudioNet</strong></div><div className="status-card"><small>CONTRACT</small><a href={EXPLORER_URL} target="_blank" rel="noreferrer"><strong>{CONTRACT_READY ? `${CONTRACT_ADDRESS.slice(0, 8)}…${CONTRACT_ADDRESS.slice(-6)}` : "Not configured"} ↗</strong></a></div><div className="status-card"><small>RELEASE</small><strong>{stats?.version ?? "Not verified"}</strong></div><div className="status-card"><small>CONTRACT MODE</small><strong>No fees · no admin settlement</strong></div></div>
    {!CONTRACT_READY ? <div className="release-pending"><span>!</span><p><strong>Waiting for StudioNet deployment</strong><small>Build and contract source are ready. Set <code>NEXT_PUBLIC_OUTAGEBOND_ADDRESS</code> after recording the deployed contract address.</small></p></div> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {stats ? <><div className="status-grid status-grid-small"><div className="status-card"><small>COVERAGES</small><strong>{stats.total_coverages}</strong></div><div className="status-card"><small>CLAIMS</small><strong>{stats.total_claims}</strong></div><div className="status-card"><small>ELIGIBLE</small><strong>{stats.total_eligible}</strong></div><div className="status-card"><small>UNVERIFIABLE</small><strong>{stats.total_unverifiable}</strong></div></div><section className="panel policy-panel"><p className="eyebrow">CONSENSUS POLICY</p><h2>{stats.source_policy.replaceAll("_", " ").toLowerCase()}</h2><dl><div><dt>Report size limit</dt><dd>{stats.max_source_bytes} bytes per source</dd></div><div><dt>Cross-source outcome</dt><dd>Both derived results must agree</dd></div><div><dt>Threshold boundary</dt><dd>Duration verdicts must match</dd></div><div><dt>Network use</dt><dd>StudioNet test GEN has no monetary value</dd></div></dl></section></> : null}
    <button className="button button-secondary" onClick={() => void refresh()} disabled={busy}>{busy ? "Reading…" : "Refresh finalized state ↻"}</button>
  </section>;
}
