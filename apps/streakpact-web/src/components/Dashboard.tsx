"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { formatCountdown, pactShareUrl, pactTiming, transactionPending } from "@/lib/ui-state";

const demoPact: PactView = {
  id: "sp2-preview",
  mode: "SELF",
  status: "LIVE",
  title: "Read one page",
  success_criteria: "Provide a public, timestamped reading log naming at least one page completed during each pact period.",
  maker: "0x8a7F943b8C9B22D9aA8D3c05F44A2221090Be710",
  taker: "",
  failure_recipient: "0x4B17A8A66eE160B7a7354429e62DE8b98C7eD210",
  periods_total: "7",
  allowed_misses: "1",
  kept_count: "3",
  miss_count: "0",
  stake_atto: "10000000000000000",
  pot_atto: "10000000000000000",
  start_unix: String(Math.floor(Date.now() / 1000) - 3 * 60),
  end_unix: String(Math.floor(Date.now() / 1000) + 4 * 60),
  created_at_iso: new Date(Date.now() - 4 * 60_000).toISOString(),
  next_period: "3",
  next_window_open: String(Math.floor(Date.now() / 1000) - 30),
  next_window_close: String(Math.floor(Date.now() / 1000) + 30),
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

export function pactStakePresentation(pact: PactView): { amountAtto: string; label: string } {
  if (pact.status === "VOIDED") return { amountAtto: pact.stake_atto, label: "refunded" };
  if (pact.mode === "SELF") return { amountAtto: pact.stake_atto, label: "self-stake" };
  if (pact.status === "OPEN") return { amountAtto: pact.stake_atto, label: "awaiting match" };
  return { amountAtto: pact.pot_atto, label: "matched pot" };
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
  const [lookupId, setLookupId] = useState("");
  const selectedId = useRef("");
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError("");
    if (!CONTRACT_READY) {
      setItems([demoPact]);
      setSelected(demoPact);
      setCheckins(demoCheckins);
      setLoading(false);
      return;
    }
    try {
      const nextItems = session ? await listUserPacts(session.address) : [];
      if (version !== requestVersion.current) return;
      setItems(nextItems);
      const params = new URLSearchParams(window.location.search);
      const sharedId = params.get("view") === "dashboard" ? params.get("pact") : null;
      const nextId = selectedId.current || sharedId || nextItems[0]?.id;
      if (nextId) {
        if (!/^sp2-\d+$/.test(nextId)) throw new Error("Enter a pact ID such as sp2-5.");
        const details = await getPact(nextId);
        const verdicts = await listCheckins(nextId);
        if (version !== requestVersion.current) return;
        selectedId.current = nextId;
        setLookupId(nextId);
        setSelected(details);
        setCheckins(verdicts);
      } else {
        setSelected(null);
        setCheckins([]);
      }
    } catch (loadError) {
      if (version === requestVersion.current) setError(friendlyError(loadError));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
    return () => { requestVersion.current += 1; };
  }, [load, refreshToken]);

  async function selectPact(pactId: string) {
    if (!CONTRACT_READY) return;
    pactId = pactId.trim();
    if (!/^sp2-\d+$/.test(pactId)) {
      setError("Enter a pact ID such as sp2-5.");
      return;
    }
    const version = ++requestVersion.current;
    setLoading(true);
    setError("");
    try {
      const details = await getPact(pactId);
      const verdicts = await listCheckins(pactId);
      if (version !== requestVersion.current) return;
      selectedId.current = pactId;
      setLookupId(pactId);
      setSelected(details);
      setCheckins(verdicts);
      window.history.replaceState(null, "", pactShareUrl(window.location.origin, pactId));
    } catch (selectError) {
      if (version === requestVersion.current) setError(friendlyError(selectError));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }

  const lookup = CONTRACT_READY ? (
    <form className="pact-lookup" onSubmit={(event) => { event.preventDefault(); void selectPact(lookupId); }}>
      <label><span>Open a pact</span><input value={lookupId} onChange={(event) => setLookupId(event.target.value)} placeholder="sp2-…" aria-label="Pact ID to open" /></label>
      <button className="button button-secondary" disabled={loading || !lookupId.trim()}>Open</button>
    </form>
  ) : null;

  if (loading && items.length === 0 && !selected) {
    return <div className="loading-panel" role="status"><span />Loading your pacts…</div>;
  }

  if (error && items.length === 0 && !selected) {
    return (
      <div className="empty-panel error-panel">
        <p className="eyebrow">Couldn’t load your pacts</p>
        <h2>Try loading your pacts again.</h2>
        <p>{error}</p>
        <button className="button button-secondary" onClick={() => void load()}>Try again</button>
        {lookup}
      </div>
    );
  }

  if (!session && CONTRACT_READY && !selected) {
    return (
      <div className="empty-panel">
        <span className="empty-orbit" aria-hidden="true" />
        <p className="eyebrow">Your dashboard</p>
        <h2>Connect your wallet to see your pacts.</h2>
        <p>Your keys stay in your wallet.</p>
        {lookup}
      </div>
    );
  }

  if (items.length === 0 && !selected) {
    return (
      <div className="empty-panel">
        <span className="empty-orbit" aria-hidden="true" />
        <p className="eyebrow">No pacts yet</p>
        <h2>Start your first pact.</h2>
        <p>Go solo or challenge a friend.</p>
        {lookup}
      </div>
    );
  }

  return (
    <section className="dashboard-grid">
      <aside className="pact-list" aria-label="Your pacts">
        <div className="list-heading">
          <div><p className="eyebrow">{items.length ? "Recent pacts" : "Shared pact"}</p><h2>{items.length ? `${items.length} pact${items.length === 1 ? "" : "s"}` : selected?.id}</h2></div>
          <button className="icon-button" aria-label="Refresh pacts" disabled={loading} onClick={() => void load()}>↻</button>
        </div>
        {lookup}
        {items.length === 25 ? <p className="account-note">Latest 25. Open an older pact by ID.</p> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
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
        <PactDetail key={`${session?.address ?? "preview"}:${selected.id}`} session={session} pact={selected} checkins={checkins} onRefresh={load} />
      ) : null}
    </section>
  );
}

export function PactDetail({
  session,
  pact: storedPact,
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
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  // Update time-based actions locally without polling StudioNet every second.
  const pact = { ...storedPact, ...pactTiming(storedPact, now) };
  const stakePresentation = pactStakePresentation(pact);
  const busy = transactionPending(progress);

  const account = session?.address.toLowerCase() ?? "";
  const maker = pact.maker.toLowerCase();
  const taker = pact.taker.toLowerCase();
  const isMaker = account !== "" && account === maker;
  const isTaker = account !== "" && account === taker;
  const isPreview = !CONTRACT_READY;
  const canSync = pact.status === "LIVE" && now >= Number(pact.next_window_close) && Number(pact.next_period) < Number(pact.periods_total);
  const payoutRecipient = pact.status === "WON"
    ? maker
    : pact.mode === "SELF"
      ? pact.failure_recipient.toLowerCase()
      : taker;

  const appealable = useMemo(
    () => checkins.filter((item) => !item.appealed && ((isMaker && item.verdict === "MISSED") || (isTaker && item.verdict === "KEPT"))),
    [checkins, isMaker, isTaker],
  );

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setError("");
    if (!session || isPreview) {
      setError(isPreview ? "Transactions are disabled in preview mode." : "Connect your wallet to continue.");
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
    const url = pactShareUrl(window.location.origin, pact.id, pact.status === "OPEN");
    try {
      await navigator.clipboard.writeText(url);
      setProgress({ state: "confirmed", label: "Pact link copied" });
    } catch {
      setError(`Copy this pact link: ${url}`);
    }
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
        <button className="button button-secondary" disabled={busy} onClick={() => void copyInvite()}>{pact.status === "OPEN" ? "Copy invite" : "Copy pact link"}</button>
      </header>

      {pact.status === "VOIDED" ? (
        <div className="notice-box pact-history-note">
          <strong>Cancelled before start</strong>
          <p>The test stake was refunded. Original rules remain visible onchain for auditability.</p>
        </div>
      ) : null}

      <div className="metric-row">
        <div><span>Progress</span><strong>{pact.kept_count} kept</strong><small>{completion}% of total</small></div>
        <div><span>Misses used</span><strong>{pact.miss_count} / {pact.allowed_misses}</strong><small>allowed</small></div>
        <div><span>Test stake</span><strong>{formatGen(stakePresentation.amountAtto)} GEN</strong><small>{stakePresentation.label}</small></div>
        <div><span>Next window</span><strong>{pact.status === "LIVE" ? formatCountdown(now < Number(pact.next_window_open) ? pact.next_window_open : pact.next_window_close, now) : "—"}</strong><small>{pact.status === "LIVE" ? now < Number(pact.next_window_open) ? "until open" : "remaining" : "not active"}</small></div>
      </div>

      <section className="timeline-section">
        <div className="section-heading"><div><p className="eyebrow">Progress</p><h3>Your streak</h3></div><span>{checkins.length} / {pact.periods_total}</span></div>
        <div className="streak-grid" aria-label="Period verdicts">
          {Array.from({ length: Number(pact.periods_total) }, (_, index) => {
            const item = checkins.find((checkin) => Number(checkin.period) === index);
            return (
              <div className={`streak-cell ${item ? `cell-${item.verdict.toLowerCase()}` : "cell-upcoming"}`} key={index} title={item?.reason ?? (pact.status === "VOIDED" ? "Voided period" : "Upcoming period")}>
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
                <small>{item.confidence_bucket}% confidence</small>
              </div>
            ))}
          </div>
        ) : <p className="muted">No check-ins yet.</p>}
      </section>

      <section className="action-section">
        <div className="section-heading"><div><p className="eyebrow">Next step</p><h3>{actionHeading(pact, isMaker)}</h3></div></div>
        <fieldset className="action-controls" disabled={busy}>
        {pact.status === "LIVE" && pact.mode === "SELF" && isMaker && now < Number(pact.start_unix) && Number(pact.next_period) === 0 ? (
          <button className="button button-danger" onClick={() => void run(() => cancelPact(session!, pact.id, setProgress))}>Cancel and refund</button>
        ) : null}
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
            <EvidenceFilePicker
              idPrefix={`checkin-${pact.id}`}
              onDigest={(nextDigest) => {
                setDigest(nextDigest);
                setEvidenceUrl("");
              }}
              onPublished={(published) => {
                setEvidenceUrl(published.url);
                setDigest(published.digest);
              }}
            />
            <details className="evidence-details">
              <summary>Evidence link &amp; fingerprint</summary>
              <div className="form-stack compact-form">
                <label><span>IPFS or Arweave URL</span><input value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="https://arweave.net/…" /></label>
                <label><span>SHA-256 fingerprint</span><input className="mono" value={digest} onChange={(event) => setDigest(event.target.value)} maxLength={64} placeholder="64 hexadecimal characters" /></label>
              </div>
            </details>
            <label><span>Note <em>optional</em></span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={240} /></label>
            <button className="button button-primary" onClick={sendCheckin}>Submit evidence</button>
          </div>
        ) : null}

        {canSync ? <button className="button button-secondary" onClick={() => void run(() => syncPact(session!, pact.id, setProgress))}>Update missed periods</button> : null}
        {pact.settleable ? <button className="button button-primary" onClick={() => void run(() => proposeSettlement(session!, pact.id, setProgress))}>Request result</button> : null}

        {(pact.status === "PROVISIONAL_WON" || pact.status === "PROVISIONAL_LOST") ? (
          <div className="appeal-panel">
            <div className="notice-box"><strong>Payout is locked</strong><p>Appeals close {new Date(Number(pact.appeal_deadline_unix) * 1000).toLocaleString()}.</p></div>
            {pact.appeal_open && appealable.length > 0 ? (
              <div className="form-stack compact-form">
                <label><span>Period to appeal</span><select value={appealPeriodNumber} onChange={(event) => setAppealPeriodNumber(event.target.value)}><option value="">Choose a period</option>{appealable.map((item) => <option value={item.period} key={item.period}>Period {Number(item.period) + 1} · {item.verdict}</option>)}</select></label>
                <label><span>Reason for appeal</span><textarea value={appealStatement} onChange={(event) => setAppealStatement(event.target.value)} rows={3} /></label>
                <EvidenceFilePicker
                  idPrefix={`appeal-${pact.id}`}
                  onDigest={(nextDigest) => {
                    setAppealDigest(nextDigest);
                    setAppealUrl("");
                  }}
                  onPublished={(published) => {
                    setAppealUrl(published.url);
                    setAppealDigest(published.digest);
                  }}
                />
                <details className="evidence-details">
                  <summary>Evidence link &amp; fingerprint</summary>
                  <div className="form-stack compact-form">
                    <label><span>New IPFS or Arweave URL</span><input value={appealUrl} onChange={(event) => setAppealUrl(event.target.value)} /></label>
                    <label><span>SHA-256 fingerprint</span><input className="mono" value={appealDigest} onChange={(event) => setAppealDigest(event.target.value)} maxLength={64} /></label>
                  </div>
                </details>
                <button className="button button-secondary" disabled={appealPeriodNumber === ""} onClick={sendAppeal}>Submit one-time appeal</button>
              </div>
            ) : null}
            {!pact.appeal_open ? <button className="button button-primary" onClick={() => void run(() => finalizeSettlement(session!, pact.id, setProgress))}>Finalize settlement</button> : null}
          </div>
        ) : null}

        {(pact.status === "WON" || pact.status === "LOST") && account === payoutRecipient ? (
          <button className="button button-primary" onClick={() => void run(() => claimPayout(session!, pact.id, setProgress))}>Claim {formatGen(pact.pot_atto)} test GEN</button>
        ) : null}
        </fieldset>

        {!isPreview && session ? <p className="account-note">Acting as {shortenAddress(session.address)}</p> : null}
        {isPreview ? <p className="preview-note">Preview only. Transactions are disabled.</p> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <TxNotice progress={progress} />
      </section>
    </article>
  );
}

function actionHeading(pact: PactView, isMaker: boolean): string {
  if (pact.status === "OPEN") return isMaker ? "Invite a challenger" : "Review and join";
  if (pact.status === "LIVE" && isMaker && pact.window_open_now) return `Submit evidence for period ${Number(pact.next_period) + 1}`;
  if (pact.status === "LIVE" && pact.settleable) return "Ready for a result";
  if (pact.status === "LIVE") return "Awaiting the next check-in";
  if (pact.status.startsWith("PROVISIONAL")) return "Review the result";
  if (pact.status === "WON" || pact.status === "LOST") return "Test tokens ready to claim";
  if (pact.status === "SETTLED") return "Pact complete";
  return statusLabel(pact.status);
}
