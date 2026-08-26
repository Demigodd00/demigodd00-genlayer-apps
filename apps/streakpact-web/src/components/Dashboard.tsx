"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CONTRACT_READY,
  appealPeriod,
  cancelPact,
  claimPayout,
  finalizeSettlement,
  formatGen,
  friendlyError,
  getPact,
  isEvidenceUrl,
  isSha256,
  joinPact,
  listCheckins,
  listUserPacts,
  proposeSettlement,
  shortenAddress,
  submitCheckin,
  syncPact,
  type CheckinView,
  type PactSummary,
  type PactView,
  type TxProgress,
  type WalletSession,
} from "@/lib/contract";
import EvidenceFilePicker from "./EvidenceFilePicker";
import TxNotice from "./TxNotice";

const demoPact: PactView = {
  id: "sp2-preview",
  mode: "SELF",
  status: "LIVE",
  title: "Read for 30 focused minutes",
  success_criteria: "Provide an immutable reading record showing at least 30 minutes during every pact period.",
  maker: "0x8a7F943b8C9B22D9aA8D3c05F44A2221090Be710",
  taker: "",
  failure_recipient: "0x4B17A8A66eE160B7a7354429e62DE8b98C7eD210",
  periods_total: "7",
  allowed_misses: "1",
  kept_count: "3",
  miss_count: "0",
  stake_atto: "10000000000000000",
  pot_atto: "10000000000000000",
  start_unix: String(Math.floor(Date.now() / 1000) - 3 * 86400),
  end_unix: String(Math.floor(Date.now() / 1000) + 4 * 86400),
  created_at_iso: new Date(Date.now() - 4 * 86400_000).toISOString(),
  next_period: "3",
  next_window_open: String(Math.floor(Date.now() / 1000) - 1800),
  next_window_close: String(Math.floor(Date.now() / 1000) + 84600),
  window_open_now: true,
  settleable: false,
  appeal_deadline_unix: "0",
  appeal_open: false,
};

const demoCheckins: CheckinView[] = [0, 1, 2].map((period) => ({
  period: String(period),
  verdict: "KEPT",
  method: "CONTENT_ADDRESSED_EVIDENCE",
  content_digest: `94b${period}7d8f7c1119c35e1d93b7a42ca4f8f8d6b2b451b6592bded9ac39b72b`,
  confidence_bucket: "90",
  reason: "The immutable activity record satisfies the period criteria.",
  appealed: false,
}));

function statusLabel(status: string): string {
  return status.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
}

function countdown(unix: string): string {
  const delta = Number(unix) * 1000 - Date.now();
  if (delta <= 0) return "Now";
  const hours = Math.floor(delta / 3_600_000);
  const minutes = Math.floor((delta % 3_600_000) / 60_000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `${hours}h ${minutes}m`;
}

export default function Dashboard({
  session,
  refreshToken,
}: {
  session: WalletSession | null;
  refreshToken: number;
}) {
  const [items, setItems] = useState<PactSummary[]>([]);
  const [selected, setSelected] = useState<PactView | null>(null);
  const [checkins, setCheckins] = useState<CheckinView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    if (!CONTRACT_READY) {
      setItems([demoPact]);
      setSelected(demoPact);
      setCheckins(demoCheckins);
      setLoading(false);
      return;
    }
    if (!session) {
      setItems([]);
      setSelected(null);
      setCheckins([]);
      setLoading(false);
      return;
    }
    try {
      const nextItems = await listUserPacts(session.address);
      setItems(nextItems);
      if (nextItems.length > 0) {
        const details = await getPact(nextItems[0].id);
        setSelected(details);
        setCheckins(await listCheckins(details.id));
      } else {
        setSelected(null);
        setCheckins([]);
      }
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  async function selectPact(pactId: string) {
    if (!CONTRACT_READY) return;
    setLoading(true);
    setError("");
    try {
      const details = await getPact(pactId);
      setSelected(details);
      setCheckins(await listCheckins(pactId));
    } catch (selectError) {
      setError(friendlyError(selectError));
    } finally {
      setLoading(false);
    }
  }

  if (loading && items.length === 0) {
    return <div className="loading-panel" role="status"><span />Loading your pacts…</div>;
  }

  if (error && items.length === 0) {
    return (
      <div className="empty-panel error-panel">
        <p className="eyebrow">Couldn’t load your pacts</p>
        <h2>Your data is still safe.</h2>
        <p>{error}</p>
        <button className="button button-secondary" onClick={() => void load()}>Try again</button>
      </div>
    );
  }

  if (!session && CONTRACT_READY) {
    return (
      <div className="empty-panel">
        <span className="empty-orbit" aria-hidden="true" />
        <p className="eyebrow">Your dashboard</p>
        <h2>Connect to see the pacts tied to your wallet.</h2>
        <p>StreakPact never asks for or stores your private key.</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="empty-panel">
        <span className="empty-orbit" aria-hidden="true" />
        <p className="eyebrow">No pacts yet</p>
        <h2>Your next promise can be the first one you make visible.</h2>
        <p>Create a self-stake pact or open a challenge for a friend.</p>
      </div>
    );
  }

  return (
    <section className="dashboard-grid">
      <aside className="pact-list" aria-label="Your pacts">
        <div className="list-heading">
          <div><p className="eyebrow">My pacts</p><h2>{items.length} active record{items.length === 1 ? "" : "s"}</h2></div>
          <button className="icon-button" aria-label="Refresh pacts" onClick={() => void load()}>↻</button>
        </div>
        {!CONTRACT_READY ? <div className="preview-ribbon">Product preview</div> : null}
        {items.map((item) => {
          const done = Number(item.kept_count) + Number(item.miss_count);
          const progress = Math.min(100, (done / Number(item.periods_total)) * 100);
          return (
            <button className={`pact-list-item ${selected?.id === item.id ? "selected" : ""}`} key={item.id} onClick={() => void selectPact(item.id)}>
              <span className={`status-dot status-${item.status.toLowerCase()}`} />
              <span className="pact-list-copy">
                <strong>{item.title}</strong>
                <small>{item.mode === "SELF" ? "Self-stake" : "Challenge"} · {formatGen(item.stake_atto)} test GEN</small>
                <span className="progress-track"><span style={{ width: `${progress}%` }} /></span>
              </span>
              <span className="pact-score">{item.kept_count}/{item.periods_total}</span>
            </button>
          );
        })}
      </aside>
      {selected ? (
        <PactDetail session={session} pact={selected} checkins={checkins} onRefresh={load} />
      ) : null}
    </section>
  );
}

function PactDetail({
  session,
  pact,
  checkins,
  onRefresh,
}: {
  session: WalletSession | null;
  pact: PactView;
  checkins: CheckinView[];
  onRefresh: () => Promise<void>;
}) {
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [digest, setDigest] = useState("");
  const [note, setNote] = useState("");
  const [appealPeriodNumber, setAppealPeriodNumber] = useState("");
  const [appealStatement, setAppealStatement] = useState("");
  const [appealUrl, setAppealUrl] = useState("");
  const [appealDigest, setAppealDigest] = useState("");
  const [progress, setProgress] = useState<TxProgress | null>(null);
  const [error, setError] = useState("");

  const account = session?.address.toLowerCase() ?? "";
  const maker = pact.maker.toLowerCase();
  const taker = pact.taker.toLowerCase();
  const isMaker = account !== "" && account === maker;
  const isTaker = account !== "" && account === taker;
  const isPreview = !CONTRACT_READY;
  const now = Math.floor(Date.now() / 1000);
  const canSync = pact.status === "LIVE" && now >= Number(pact.next_window_close) && Number(pact.next_period) < Number(pact.periods_total);
  const payoutRecipient = pact.status === "WON"
    ? maker
    : pact.mode === "SELF"
      ? pact.failure_recipient.toLowerCase()
      : taker;

  const appealable = useMemo(
    () => checkins.filter((item) => (isMaker && item.verdict === "MISSED") || (isTaker && item.verdict === "KEPT")),
    [checkins, isMaker, isTaker],
  );

  async function run(action: () => Promise<unknown>) {
    setError("");
    if (!session || isPreview) {
      setError(isPreview ? "Actions are disabled in product-preview mode." : "Connect your wallet to continue.");
      return;
    }
    try {
      await action();
      await onRefresh();
    } catch (actionError) {
      setError(friendlyError(actionError));
    }
  }

  async function copyInvite() {
    const url = `${window.location.origin}/?pact=${encodeURIComponent(pact.id)}&view=join`;
    await navigator.clipboard.writeText(url);
    setProgress({ state: "confirmed", label: "Invite link copied" });
  }

  function evidenceValidation(url: string, evidenceDigest: string): string {
    if (!isEvidenceUrl(url)) {
      return "Use an approved ipfs.io, Pinata gateway, or arweave.net evidence URL.";
    }
    if (!isSha256(evidenceDigest)) {
      return "Enter the 64-character SHA-256 digest of the exact published file.";
    }
    return "";
  }

  function sendCheckin() {
    const validationError = evidenceValidation(evidenceUrl, digest);
    if (validationError) {
      setError(validationError);
      return;
    }
    void run(() => submitCheckin(
      session!,
      pact.id,
      evidenceUrl.trim(),
      digest.trim().toLowerCase(),
      note,
      setProgress,
    ));
  }

  function sendAppeal() {
    if (appealStatement.trim().length < 10) {
      setError("Explain the appeal in at least 10 characters.");
      return;
    }
    const validationError = evidenceValidation(appealUrl, appealDigest);
    if (validationError) {
      setError(validationError);
      return;
    }
    void run(() => appealPeriod(
      session!,
      pact.id,
      Number(appealPeriodNumber),
      appealStatement.trim(),
      appealUrl.trim(),
      appealDigest.trim().toLowerCase(),
      setProgress,
    ));
  }

  const completion = Math.round((Number(pact.kept_count) / Number(pact.periods_total)) * 100);

  return (
    <article className="pact-detail">
      <header className="pact-detail-header">
        <div>
          <div className="detail-chips">
            <span className={`mode-chip mode-${pact.mode.toLowerCase()}`}>{pact.mode === "SELF" ? "Self-stake" : "Challenge"}</span>
            <span className={`status-chip status-${pact.status.toLowerCase()}`}>{statusLabel(pact.status)}</span>
          </div>
          <h2>{pact.title}</h2>
          <p>{pact.success_criteria}</p>
        </div>
        {pact.status === "OPEN" ? <button className="button button-secondary" onClick={() => void copyInvite()}>Copy invite</button> : null}
      </header>

      <div className="metric-row">
        <div><span>Progress</span><strong>{pact.kept_count} kept</strong><small>{completion}% of total</small></div>
        <div><span>Grace used</span><strong>{pact.miss_count} / {pact.allowed_misses}</strong><small>misses</small></div>
        <div><span>Test escrow</span><strong>{formatGen(pact.pot_atto)} GEN</strong><small>{pact.mode === "SELF" ? "self-stake" : "matched pot"}</small></div>
        <div><span>Next window</span><strong>{pact.status === "LIVE" ? countdown(pact.next_window_close) : "—"}</strong><small>{pact.status === "LIVE" ? "remaining" : "not active"}</small></div>
      </div>

      <section className="timeline-section">
        <div className="section-heading"><div><p className="eyebrow">Evidence timeline</p><h3>Every period, accounted for</h3></div><span>{checkins.length} / {pact.periods_total}</span></div>
        <div className="streak-grid" aria-label="Period verdicts">
          {Array.from({ length: Number(pact.periods_total) }, (_, index) => {
            const item = checkins.find((checkin) => Number(checkin.period) === index);
            return (
              <div className={`streak-cell ${item ? `cell-${item.verdict.toLowerCase()}` : "cell-upcoming"}`} key={index} title={item?.reason ?? "Upcoming period"}>
                <span>{item?.verdict === "KEPT" ? "✓" : item?.verdict === "MISSED" ? "×" : index + 1}</span>
                <small>P{index + 1}</small>
              </div>
            );
          })}
        </div>
        {checkins.length > 0 ? (
          <div className="evidence-list">
            {checkins.slice().reverse().slice(0, 4).map((item) => (
              <div key={item.period}>
                <span className={`verdict-mark verdict-${item.verdict.toLowerCase()}`}>{item.verdict === "KEPT" ? "✓" : "×"}</span>
                <div><strong>Period {Number(item.period) + 1} · {item.verdict}</strong><p>{item.reason}</p></div>
                <small>{item.method.replaceAll("_", " ")} · {item.confidence_bucket}%</small>
              </div>
            ))}
          </div>
        ) : <p className="muted">No verdicts have been recorded yet.</p>}
      </section>

      <section className="action-section">
        <div className="section-heading"><div><p className="eyebrow">Recommended action</p><h3>{actionHeading(pact, isMaker)}</h3></div></div>

        {pact.status === "OPEN" && isMaker ? (
          <div className="inline-actions">
            <button className="button button-primary" onClick={() => void copyInvite()}>Copy challenger invite</button>
            <button className="button button-danger" onClick={() => void run(() => cancelPact(session!, pact.id, setProgress))}>Cancel and refund</button>
          </div>
        ) : null}

        {pact.status === "OPEN" && !isMaker ? (
          <button className="button button-primary" onClick={() => void run(() => joinPact(session!, pact.id, BigInt(pact.stake_atto), setProgress))}>
            Match {formatGen(pact.stake_atto)} test GEN and join
          </button>
        ) : null}

        {pact.status === "LIVE" && isMaker && pact.window_open_now ? (
          <div className="evidence-form">
            <div className="notice-box"><strong>Immutable, public evidence only</strong><p>Publish a small JSON or text record with no secrets. The app hashes the exact bytes before they reach GenLayer.</p></div>
            <EvidenceFilePicker
              idPrefix={`checkin-${pact.id}`}
              onDigest={setDigest}
              onPublished={(published) => {
                setEvidenceUrl(published.url);
                setDigest(published.digest);
              }}
            />
            <label><span>Evidence URL</span><input value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="https://arweave.net/…" /></label>
            <label><span>SHA-256 digest</span><input className="mono" value={digest} onChange={(event) => setDigest(event.target.value)} maxLength={64} placeholder="64 hexadecimal characters" /></label>
            <label><span>Context for validators <em>optional</em></span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={240} /></label>
            <button className="button button-primary" onClick={sendCheckin}>Submit evidence to GenLayer</button>
          </div>
        ) : null}

        {canSync ? <button className="button button-secondary" onClick={() => void run(() => syncPact(session!, pact.id, setProgress))}>Account for elapsed periods</button> : null}
        {pact.settleable ? <button className="button button-primary" onClick={() => void run(() => proposeSettlement(session!, pact.id, setProgress))}>Propose final result</button> : null}

        {(pact.status === "PROVISIONAL_WON" || pact.status === "PROVISIONAL_LOST") ? (
          <div className="appeal-panel">
            <div className="notice-box"><strong>Payout is locked</strong><p>Appeals close {new Date(Number(pact.appeal_deadline_unix) * 1000).toLocaleString()}.</p></div>
            {pact.appeal_open && appealable.length > 0 ? (
              <div className="form-stack compact-form">
                <label><span>Period to appeal</span><select value={appealPeriodNumber} onChange={(event) => setAppealPeriodNumber(event.target.value)}><option value="">Choose a period</option>{appealable.map((item) => <option value={item.period} key={item.period}>Period {Number(item.period) + 1} · {item.verdict}</option>)}</select></label>
                <label><span>Why the verdict should change</span><textarea value={appealStatement} onChange={(event) => setAppealStatement(event.target.value)} rows={3} /></label>
                <EvidenceFilePicker
                  idPrefix={`appeal-${pact.id}`}
                  onDigest={setAppealDigest}
                  onPublished={(published) => {
                    setAppealUrl(published.url);
                    setAppealDigest(published.digest);
                  }}
                />
                <label><span>New immutable evidence URL</span><input value={appealUrl} onChange={(event) => setAppealUrl(event.target.value)} /></label>
                <label><span>New SHA-256 digest</span><input className="mono" value={appealDigest} onChange={(event) => setAppealDigest(event.target.value)} /></label>
                <button className="button button-secondary" disabled={appealPeriodNumber === ""} onClick={sendAppeal}>Submit one-time appeal</button>
              </div>
            ) : null}
            {!pact.appeal_open ? <button className="button button-primary" onClick={() => void run(() => finalizeSettlement(session!, pact.id, setProgress))}>Finalize settlement</button> : null}
          </div>
        ) : null}

        {(pact.status === "WON" || pact.status === "LOST") && account === payoutRecipient ? (
          <button className="button button-primary" onClick={() => void run(() => claimPayout(session!, pact.id, setProgress))}>Claim {formatGen(pact.pot_atto)} test GEN</button>
        ) : null}

        {!isPreview && session ? <p className="account-note">Acting as {shortenAddress(session.address)}</p> : null}
        {isPreview ? <p className="preview-note">Preview data only. Transactions become available after a reviewed V2 deployment is configured.</p> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <TxNotice progress={progress} />
      </section>
    </article>
  );
}

function actionHeading(pact: PactView, isMaker: boolean): string {
  if (pact.status === "OPEN") return isMaker ? "Invite a challenger or cancel for a refund" : "Review the terms before matching the test stake";
  if (pact.status === "LIVE" && isMaker && pact.window_open_now) return `Submit evidence for period ${Number(pact.next_period) + 1}`;
  if (pact.status === "LIVE" && pact.settleable) return "All periods are ready for provisional settlement";
  if (pact.status === "LIVE") return "Your next evidence window is on schedule";
  if (pact.status.startsWith("PROVISIONAL")) return "Review the provisional verdict before payout";
  if (pact.status === "WON" || pact.status === "LOST") return "The result is final and ready to claim";
  if (pact.status === "SETTLED") return "This pact is complete";
  return statusLabel(pact.status);
}
