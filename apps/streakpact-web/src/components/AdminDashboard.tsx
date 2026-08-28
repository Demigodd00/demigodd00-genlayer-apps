"use client";

import { useEffect, useState } from "react";
import { CONTRACT_ADDRESS, CONTRACT_READY, NETWORK_NAME, friendlyError, getAdminData, shortenAddress } from "@/lib/contract";

interface ReleaseHealth {
  contractConfigured: boolean;
  evidencePublishingConfigured: boolean;
  originProtectionConfigured: boolean;
  readyForStudioNetTesting: boolean;
}

export default function AdminDashboard() {
  const [data, setData] = useState<{ config: Record<string, string>; stats: Record<string, string> } | null>(null);
  const [health, setHealth] = useState<ReleaseHealth | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then((response) => response.json() as Promise<ReleaseHealth>)
      .then(setHealth)
      .catch(() => setHealth(null));
    if (!CONTRACT_READY) return;
    getAdminData().then(setData).catch((reason: unknown) => setError(friendlyError(reason)));
  }, []);

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <a href="/" className="brand"><span className="brand-mark">S</span><span>StreakPact<small>by demigodd00</small></span></a>
        <a className="button button-secondary" href="/">Back to app</a>
      </header>
      <section className="admin-hero">
        <div><p className="eyebrow">StudioNet · Read-only</p><h1>App status</h1><p>Test GEN has no monetary value.</p></div>
        <div className="contract-identity"><span className={CONTRACT_READY ? "network-dot" : "network-dot offline"} /><div><small>{NETWORK_NAME}</small><strong>{CONTRACT_READY ? shortenAddress(CONTRACT_ADDRESS) : "Not configured"}</strong></div></div>
      </section>
      <section className="release-health" aria-label="Runtime release configuration">
        <ConfigurationGate label="Contract" configured={health?.contractConfigured} />
        <ConfigurationGate label="Evidence uploads" configured={health?.evidencePublishingConfigured} />
        <ConfigurationGate label="Origin protection" configured={health?.originProtectionConfigured} />
        <ConfigurationGate label="Complete setup" configured={health?.readyForStudioNetTesting} />
      </section>
      {!CONTRACT_READY ? (
        <div className="admin-notice"><strong>Contract setup is incomplete.</strong></div>
      ) : error ? (
        <div className="admin-notice error-panel"><strong>Metrics unavailable</strong><p>{error}</p></div>
      ) : !data ? (
        <div className="loading-panel"><span />Loading metrics…</div>
      ) : (
        <>
          <section className="admin-metrics">
            <Metric label="Pacts created" value={data.stats.total_created ?? "0"} />
            <Metric label="Pacts settled" value={data.stats.total_settled ?? "0"} />
            <Metric label="Self-stake" value={data.stats.total_self ?? "0"} />
            <Metric label="Challenges" value={data.stats.total_challenge ?? "0"} />
            <Metric label="Kept periods" value={data.stats.total_kept ?? "0"} />
            <Metric label="Missed periods" value={data.stats.total_missed ?? "0"} />
          </section>
          <details className="admin-card admin-configuration">
            <summary>Contract configuration</summary>
            <dl>{Object.entries(data.config).map(([key, value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{value}</dd></div>)}</dl>
          </details>
        </>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function ConfigurationGate({ label, configured }: { label: string; configured: boolean | undefined }) {
  return <div className={configured ? "done" : ""}><span>{label}<strong>{configured === undefined ? "Unknown" : configured ? "Configured" : "Incomplete"}</strong></span></div>;
}
