"use client";

import { useState } from "react";
import { createPact, makeClient } from "@/lib/contract";

const MIN_STAKE = 10n ** 15n;

export default function PactWizard({ pk, addr }: { pk: string; addr: string }) {
  const [commitment, setCommitment] = useState("Go to the gym and complete a strength workout");
  const [days, setDays] = useState(7);
  const [misses, setMisses] = useState(2);
  const [stake, setStake] = useState("0.01");
  const [startLocal, setStartLocal] = useState(() => {
    const d = new Date(Date.now() + 10 * 60 * 1000);
    d.setSeconds(0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");

  const maxMisses = Math.floor(days / 3);

  async function submit() {
    setMsg("");
    setOk("");
    if (!pk) return setMsgErr("Set a private key first.");
    if (misses > maxMisses) return setMsgErr(`allowed misses must be ≤ ${maxMisses} (one third of ${days} days)`);
    const stakeAtto = BigInt(Math.round(parseFloat(stake || "0") * 1e18));
    if (stakeAtto < MIN_STAKE) return setMsgErr("stake below minimum of 0.001 GEN");
    const startUnix = Math.floor(new Date(startLocal).getTime() / 1000);
    if (startUnix < Math.floor(Date.now() / 1000) + 60)
      return setMsgErr("start must be at least 60s in the future");

    setBusy(true);
    try {
      const client = makeClient(pk);
      await createPact(client, addr, { commitment, periods: days, misses, startUnix }, stakeAtto);
      setOk(`Pact created — open the Pacts tab to see it.`);
    } catch (e) {
      setMsgErr(String(e).slice(0, 400));
    } finally {
      setBusy(false);
    }
  }

  function setMsgErr(s: string) {
    setMsg(s);
  }

  return (
    <div className="panel">
      <h2>Create a pact</h2>
      <label>Commitment (public, judged daily by the AI jury)</label>
      <textarea value={commitment} onChange={(e) => setCommitment(e.target.value)} maxLength={400} />
      <div className="row">
        <div>
          <label>Days ({days})</label>
          <input type="number" min={3} max={90} value={days}
            onChange={(e) => {
              const v = Math.max(3, Math.min(90, parseInt(e.target.value || "3", 10)));
              setDays(v);
              if (misses > Math.floor(v / 3)) setMisses(Math.floor(v / 3));
            }} />
        </div>
        <div>
          <label>Allowed misses (≤ {maxMisses})</label>
          <input type="number" min={0} max={maxMisses} value={misses}
            onChange={(e) => setMisses(Math.max(0, parseInt(e.target.value || "0", 10)))} />
        </div>
        <div>
          <label>Your stake (GEN)</label>
          <input type="number" step="0.001" min="0.001" value={stake} onChange={(e) => setStake(e.target.value)} />
        </div>
      </div>
      <label>First check-in window opens at</label>
      <input type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} />
      <div className="note" style={{ marginTop: 8 }}>
        Each day you get one window of exactly 24h to submit a note or an evidence URL. Validators fetch it
        on-chain and consensus decides KEPT or MISSED. Finish with ≤ allowed misses to take both stakes.
      </div>
      <button className="primary" disabled={busy} onClick={submit}>
        {busy ? "Creating…" : "Create pact"}
      </button>
      {msg && <div className="status err">{msg}</div>}
      {ok && <div className="status ok">{ok}</div>}
    </div>
  );
}
