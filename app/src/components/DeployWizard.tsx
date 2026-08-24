"use client";

import { useState } from "react";
import { deployStreakPact, makeClient } from "@/lib/contract";

const CADENCES: Array<[string, number]> = [
  ["Demo — every 60 seconds", 60],
  ["Hourly", 3600],
  ["Daily", 86400],
  ["Weekly", 604800],
];

export default function DeployWizard({
  pk,
  onDeployed,
}: {
  pk: string;
  onDeployed: (addr: string) => void;
}) {
  const [cadence, setCadence] = useState(CADENCES[2][1]);
  const [feeBps, setFeeBps] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");

  async function submit() {
    setMsg("");
    setOk("");
    if (!pk) return setMsg("Set a private key first.");
    setBusy(true);
    try {
      const client = makeClient(pk);
      const res = await fetch("/streak_pact.py");
      if (!res.ok) throw new Error(`cannot load contract source (${res.status})`);
      const code = await res.text();
      const address = await deployStreakPact(client, code, feeBps, cadence);
      onDeployed(address);
      setOk(`Deployed at ${address} — now the active contract.`);
    } catch (e) {
      setMsg(String(e).slice(0, 400));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h2>Deploy a fresh StreakPact</h2>
      <label>Cadence (length of one check-in window)</label>
      <select value={cadence} onChange={(e) => setCadence(parseInt(e.target.value, 10))}>
        {CADENCES.map(([label, secs]) => (
          <option key={secs} value={secs}>
            {label}
          </option>
        ))}
      </select>
      <label>Treasury fee (basis points, 0–1000)</label>
      <input type="number" min={0} max={1000} value={feeBps} onChange={(e) => setFeeBps(Math.max(0, Math.min(1000, parseInt(e.target.value || "0", 10))))} />
      <div className="note" style={{ marginTop: 8 }}>
        Deploys the exact contract source from this repo to studionet. The new address becomes active in this
        browser. Studionet is gasless — no funding needed.
      </div>
      <button className="primary" disabled={busy} onClick={submit}>
        {busy ? "Deploying…" : "Deploy"}
      </button>
      {msg && <div className="status err">{msg}</div>}
      {ok && <div className="status ok">{ok}</div>}
    </div>
  );
}
