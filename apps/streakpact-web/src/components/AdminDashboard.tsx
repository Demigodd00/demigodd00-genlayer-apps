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
        <a href="/" className="brand"><span className="brand-mark">S</span><span>StreakPact<small>Operations</small></span></a>
        <a className="button button-secondary" href="/">Back to product</a>
      </header>
      <section className="admin-hero">
        <div><p className="eyebrow">Read-only StudioNet operations</p><h1>Protocol health without outcome control.</h1><p>Monitor the test deployment and user flows. This surface intentionally cannot alter verdicts, move test escrow, or block claims.</p></div>
        <div className="contract-identity"><span className={CONTRACT_READY ? "network-dot" : "network-dot offline"} /><div><small>{NETWORK_NAME}</small><strong>{CONTRACT_READY ? shortenAddress(CONTRACT_ADDRESS) : "V2 not deployed"}</strong></div></div>
      </section>
      <section className="release-health" aria-label="Runtime release configuration">
        <div className={health?.contractConfigured ? "done" : ""}><span>V2 address configured</span></div>
        <div className={health?.evidencePublishingConfigured ? "done" : ""}><span>Public IPFS publishing</span></div>
        <div className={health?.originProtectionConfigured ? "done" : ""}><span>Upload origin locked</span></div>
        <div className={health?.readyForStudioNetTesting ? "done" : ""}><span>Runtime tester-ready</span></div>
      </section>
      {!CONTRACT_READY ? (
        <div className="admin-notice"><strong>StudioNet setup is incomplete</strong><p>Deploy the zero-fee V2 contract, record its address, set NEXT_PUBLIC_STREAKPACT_V2_ADDRESS, and configure the server-only evidence publisher.</p></div>
      ) : error ? (
        <div className="admin-notice error-panel"><strong>Metrics unavailable</strong><p>{error}</p></div>
      ) : !data ? (
        <div className="loading-panel"><span />Loading protocol metrics…</div>
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
          <section className="admin-grid">
            <div className="admin-card"><p className="eyebrow">Immutable configuration</p><dl>{Object.entries(data.config).map(([key, value]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{value}</dd></div>)}</dl></div>
            <div className="admin-card"><p className="eyebrow">StudioNet finish gates</p><ul className="gate-list"><li className="done">Contract lint and direct tests</li><li className={data.config.fee_bps === "0" ? "done" : ""}>Zero-fee contract configuration</li><li className={health?.contractConfigured ? "done" : ""}>Frontend contract address configured</li><li>Consensus evidence smoke test completed</li><li className={health?.evidencePublishingConfigured ? "done" : ""}>Evidence publishing service configured</li><li>Two-wallet acceptance run recorded</li></ul></div>
          </section>
        </>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}
