"use client";

import { useState } from "react";
import { listCheckins, loadAddress, makeClient } from "@/lib/contract";

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(d))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function Verifier() {
  const [pactId, setPactId] = useState("p-1");
  const [period, setPeriod] = useState("0");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [match, setMatch] = useState<null | boolean>(null);

  async function verify() {
    setBusy(true);
    setResult("");
    setMatch(null);
    try {
      const client = makeClient("");
      const addr = loadAddress() as `0x${string}`;
      const listing = await listCheckins(client, addr, pactId.trim());
      const c = (listing.items ?? []).find(
        (x) => parseInt(x.period, 10) === parseInt(period, 10),
      );
      if (!c) throw new Error(`no check-in found for ${pactId} day ${period}`);
      if (!c.evidence_url) throw new Error("that check-in has no evidence URL (note-only or auto-miss)");
      if (!c.content_digest) throw new Error("no digest stored for that check-in");

      setResult(`fetching ${c.evidence_url} …`);
      const res = await fetch(`/api/fetch-url?url=${encodeURIComponent(c.evidence_url)}`);
      const body = await res.arrayBuffer();
      const live = await sha256Hex(body);
      const onchain = c.content_digest.toLowerCase();
      setMatch(live === onchain);
      setResult(
        `on-chain digest: ${onchain}\nlive fetch digest: ${live}`,
      );
    } catch (e) {
      setResult(String(e).slice(0, 500));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h2>Evidence verifier</h2>
      <div className="note" style={{ marginBottom: 10 }}>
        Re-fetches a check-in&apos;s evidence URL right now and compares its SHA-256 against the digest the
        validators snapshotted on-chain. Identical means the page you see today is byte-for-byte what the
        jury judged.
        <br />
        Note: dynamic pages (timestamps, rotating content) will legitimately differ.
      </div>
      <div className="row">
        <div>
          <label>Pact id</label>
          <input value={pactId} onChange={(e) => setPactId(e.target.value)} placeholder="p-1" />
        </div>
        <div style={{ maxWidth: 120 }}>
          <label>Day (period)</label>
          <input type="number" min={0} value={period} onChange={(e) => setPeriod(e.target.value)} />
        </div>
      </div>
      <button className="primary" disabled={busy || !pactId} onClick={verify}>
        {busy ? "Verifying…" : "Verify evidence"}
      </button>
      {result && (
        <div className={`status mono ${match === null ? "" : match ? "ok" : "err"}`}>{result}</div>
      )}
      {match !== null && (
        <div className={`status ${match ? "ok" : "err"}`}>
          {match ? "MATCH — evidence is exactly what validators judged." : "DIFFERS — live content changed since judging."}
        </div>
      )}
    </div>
  );
}
