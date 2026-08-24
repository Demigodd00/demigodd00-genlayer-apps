"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckinView,
  PactView,
  cancelPact,
  checkIn,
  claim,
  forceSettle,
  getPact,
  joinPact,
  listCheckins,
  listPacts,
  makeClient,
  recordMiss,
} from "@/lib/contract";

function fmtGen(atto: string) {
  const v = BigInt(atto || "0");
  return (Number(v) / 1e18).toFixed(4).replace(/\.?0+$/, "") + " GEN";
}

function Countdown({ toUnix }: { toUnix: number }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const left = toUnix - now;
  if (left <= 0) return <span className="countdown">expired</span>;
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  return (
    <span className="countdown">
      {h > 0 ? `${h}h ` : ""}
      {m}m {s}s left
    </span>
  );
}

export default function PactBrowser({ pk, addr }: { pk: string; addr: string }) {
  const [items, setItems] = useState<Array<Record<string, string>>>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [pact, setPact] = useState<PactView | null>(null);
  const [checkins, setCheckins] = useState<CheckinView[]>([]);
  const [note, setNote] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");

  const refreshList = useCallback(async () => {
    try {
      const client = makeClient("");
      const listing = await listPacts(client, addr);
      setItems(listing.items);
    } catch {
      /* rpc hiccup */
    }
  }, [addr]);

  const refreshPact = useCallback(async () => {
    if (!selected) return;
    try {
      const client = makeClient(pk);
      const [p, c] = await Promise.all([
        getPact(client, addr, selected),
        listCheckins(client, addr, selected),
      ]);
      setPact(p);
      setCheckins(c.items ?? []);
    } catch (e) {
      setMsg(String(e).slice(0, 300));
    }
  }, [pk, addr, selected]);

  useEffect(() => {
    refreshList();
    const t = setInterval(refreshList, 15000);
    return () => clearInterval(t);
  }, [refreshList]);

  useEffect(() => {
    refreshPact();
    const t = setInterval(refreshPact, 12000);
    return () => clearInterval(t);
  }, [refreshPact]);

  async function act(fn: () => Promise<void>, success: string) {
    setBusy(true);
    setMsg("");
    setOk("");
    try {
      await fn();
      setOk(success);
      await refreshPact();
    } catch (e) {
      setMsg(String(e).slice(0, 400));
    } finally {
      setBusy(false);
    }
  }

  const me = (() => {
    try {
      const client = makeClient(pk) as unknown as { account?: { address?: string } };
      return (client.account?.address ?? "").toLowerCase();
    } catch {
      return "";
    }
  })();

  const isMaker = pact ? pact.maker.toLowerCase() === me : false;
  const isTaker = pact ? pact.taker.toLowerCase() === me : false;
  const status = pact?.status ?? "";
  const judged = checkins.length;
  const totalDays = pact ? parseInt(pact.periods_total, 10) : 0;
  const nextPeriod = pact ? parseInt(pact.next_period, 10) : 0;
  const windowOpen = pact?.window_open_now === "True" || pact?.window_open_now === "true";
  const settleable = pact?.settleable === "True" || pact?.settleable === "true";

  function cellFor(day: number): { cls: string; label: string } {
    const c = checkins.find((x) => parseInt(x.period, 10) === day);
    if (c) {
      return c.verdict === "KEPT"
        ? { cls: "kept", label: "KEPT" }
        : { cls: "missed", label: c.method === "AUTO_MISS" ? "AUTO" : "MISSED" };
    }
    if (pact && day === nextPeriod && windowOpen) {
      return { cls: "open-now", label: "NOW" };
    }
    return { cls: "", label: "—" };
  }

  return (
    <>
      <div className="panel">
        <h2>Pacts</h2>
        <table>
          <thead>
            <tr>
              <th>Id</th>
              <th>Commitment</th>
              <th>Status</th>
              <th>Streak</th>
              <th>Stake</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={5} className="note">No pacts yet — create one.</td></tr>
            )}
            {items.map((it) => (
              <tr key={it.id} className="clickable" onClick={() => setSelected(it.id)}>
                <td className="mono">{it.id}</td>
                <td>{it.commitment}</td>
                <td><span className={`badge ${it.status}`}>{it.status}</span></td>
                <td>{it.kept_count}✓ / {it.miss_count}✗</td>
                <td>{fmtGen(it.stake_atto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pact && (
        <div className="panel">
          <h2>
            <span className="mono">{pact.id}</span>{" "}
            <span className={`badge ${status}`}>{status}</span>
          </h2>
          <div style={{ fontSize: 15, margin: "6px 0 2px" }}>{pact.commitment}</div>

          <div className="streak-grid">
            {Array.from({ length: totalDays }, (_, i) => {
              const c = cellFor(i);
              return (
                <div key={i} className={`cell ${c.cls}`} title={c.label}>
                  <div>{i + 1}</div>
                  <div>{c.label}</div>
                </div>
              );
            })}
          </div>

          <div className="kv">
            <div>maker</div><div className="mono">{pact.maker}</div>
            <div>taker</div><div className="mono">{pact.taker || "— open —"}</div>
            <div>pot</div><div>{fmtGen(pact.pot_atto)}</div>
            <div>progress</div>
            <div>
              day {Math.min(judged + 1, totalDays)} of {totalDays} · misses{" "}
              {pact.miss_count}/{pact.allowed_misses} allowed
            </div>
            {windowOpen && status === "LIVE" && (
              <>
                <div>window closes in</div>
                <div><Countdown toUnix={parseInt(pact.next_window_close, 10)} /></div>
              </>
            )}
          </div>

          {status === "LIVE" && isMaker && windowOpen && (
            <>
              <h3>Check in for day {nextPeriod + 1}</h3>
              <label>Evidence URL (fetched by validators on-chain)</label>
              <input placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
              <label>…or note ({url ? "" : "min 20 chars"})</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300}
                placeholder="What did you do today?" />
              <button className="primary" disabled={busy}
                onClick={() => act(async () => { await checkIn(makeClient(pk), addr, pact.id, note.trim(), url.trim()); }, "Check-in submitted — jury verdict incoming.")}>
                {busy ? "Submitting…" : "Submit check-in"}
              </button>
            </>
          )}

          {status === "LIVE" && !windowOpen && nextPeriod < totalDays && (
            <button className="secondary" disabled={busy}
              onClick={() => act(async () => { await recordMiss(makeClient(pk), addr, pact.id); }, "Miss recorded.")}>
              Record missed day {nextPeriod + 1}
            </button>
          )}

          {status === "LIVE" && settleable && (
            <button className="primary" disabled={busy}
              onClick={() => act(async () => { await forceSettle(makeClient(pk), addr, pact.id); }, "Pact settled.")}>
              Force settle
            </button>
          )}

          {status === "OPEN" && isMaker && (
            <button className="danger" disabled={busy}
              onClick={() => act(async () => { await cancelPact(makeClient(pk), addr, pact.id); }, "Pact cancelled and stake refunded.")}>
              Cancel pact
            </button>
          )}
          {status === "OPEN" && !isMaker && pk && (
            <button className="primary" disabled={busy}
              onClick={() => act(async () => { await joinPact(makeClient(pk), addr, pact.id, BigInt(pact.stake_atto)); }, "You are the taker. If they break the streak, you win the pot.")}>
              Join as counterparty · {fmtGen(pact.stake_atto)}
            </button>
          )}

          {(status === "WON" || status === "LOST") &&
            ((status === "WON" && isMaker) || (status === "LOST" && isTaker)) && (
              <button className="primary" disabled={busy}
                onClick={() => act(async () => { await claim(makeClient(pk), addr, pact.id); }, "Pot claimed.")}>
                Claim pot · {fmtGen(pact.pot_atto)}
              </button>
            )}

          <h3>Verdict log</h3>
          {checkins.length === 0 && <div className="note">No check-ins yet.</div>}
          {checkins.map((c) => (
            <div key={c.period} style={{ marginBottom: 10 }}>
              <span className="badge KEPT" style={{ display: "none" }} />
              <span className={`badge ${c.verdict}`}>
                D{parseInt(c.period, 10) + 1} {c.verdict}
                {c.method === "AUTO_MISS" ? " (auto)" : ""}
              </span>{" "}
              <span className="note">{c.reason}</span>
              {c.evidence_url && (
                <div className="note mono">
                  evidence: {c.evidence_url} · sha256 {c.content_digest.slice(0, 16)}…
                </div>
              )}
            </div>
          ))}

          <div className="row">
            <button className="secondary" disabled={busy} onClick={() => refreshPact().then(() => setOk("Refreshed."))}>
              Refresh
            </button>
          </div>
          {msg && <div className="status err">{msg}</div>}
          {ok && <div className="status ok">{ok}</div>}
        </div>
      )}
    </>
  );
}
