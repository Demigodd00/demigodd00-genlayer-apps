"use client";

import { useMemo, useState } from "react";
import {
  CONTRACT_READY,
  createPact,
  formatGen,
  friendlyError,
  isAddress,
  parseGen,
  type Address,
  type TxProgress,
  type WalletSession,
} from "@/lib/contract";
import TxNotice from "./TxNotice";
import { transactionPending } from "@/lib/ui-state";

const templates = [
  {
    name: "Strength training",
    kicker: "Fitness",
    title: "Complete 10 squats",
    criteria:
      "Provide a public, timestamped activity log stating that at least 10 squats were completed during each pact period.",
    periods: 4,
    misses: 1,
  },
  {
    name: "Focused reading",
    kicker: "Learning",
    title: "Read one page",
    criteria:
      "Provide a public, timestamped reading log naming at least one page completed during each pact period.",
    periods: 7,
    misses: 1,
  },
  {
    name: "Consistent shipping",
    kicker: "Building",
    title: "Record one coding step",
    criteria:
      "Provide a public, timestamped work log naming one specific coding step completed during each pact period.",
    periods: 7,
    misses: 1,
  },
];

function defaultStart(): string {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function CreatePact({
  session,
  onCreated,
}: {
  session: WalletSession | null;
  onCreated: () => void;
}) {
  const [mode, setMode] = useState<"SELF" | "CHALLENGE">("SELF");
  const [title, setTitle] = useState(templates[0].title);
  const [criteria, setCriteria] = useState(templates[0].criteria);
  const [periods, setPeriods] = useState(templates[0].periods);
  const [misses, setMisses] = useState(templates[0].misses);
  const [stake, setStake] = useState("0.01");
  const [start, setStart] = useState(defaultStart);
  const [failureRecipient, setFailureRecipient] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<TxProgress | null>(null);
  const [created, setCreated] = useState(false);
  const busy = transactionPending(progress);

  const stakeAtto = useMemo(() => {
    try {
      return parseGen(stake);
    } catch {
      return 0n;
    }
  }, [stake]);

  function applyTemplate(index: number) {
    if (busy) return;
    const template = templates[index];
    setTitle(template.title);
    setCriteria(template.criteria);
    setPeriods(template.periods);
    setMisses(template.misses);
    setReviewing(false);
  }

  function validate(): string {
    if (title.trim().length < 3) return "Give your pact a clear title.";
    if (criteria.trim().length < 20) return "Success criteria need at least 20 characters.";
    if (periods < 3 || periods > 60) return "Choose between 3 and 60 periods.";
    if (misses < 0 || misses > Math.floor(periods / 3)) return "Allowed misses cannot exceed one third of the periods.";
    if (stakeAtto < 10n ** 15n) return "The minimum stake is 0.001 test GEN.";
    if (stakeAtto > 100n * 10n ** 18n) return "The maximum stake is 100 test GEN.";
    if (new Date(start).getTime() < Date.now() + 60_000) return "Start at least one minute from now.";
    if (mode === "SELF") {
      if (!isAddress(failureRecipient)) return "Enter a valid failure-recipient address.";
      if (session && failureRecipient.toLowerCase() === session.address.toLowerCase()) {
        return "The failure recipient must be different from your wallet.";
      }
    }
    return "";
  }

  function openReview() {
    const validationError = validate();
    setError(validationError);
    if (!validationError) setReviewing(true);
  }

  async function submit() {
    if (busy) return;
    if (!session) {
      setError("Connect your wallet before creating a pact.");
      return;
    }
    if (!CONTRACT_READY) {
      setError("Transactions are unavailable in preview mode.");
      return;
    }
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setCreated(false);
    try {
      await createPact(
        session,
        {
          mode,
          title: title.trim(),
          criteria: criteria.trim(),
          periods,
          allowedMisses: misses,
          startUnix: Math.floor(new Date(start).getTime() / 1000),
          failureRecipient: (mode === "SELF" ? failureRecipient : session.address) as Address,
          stakeAtto,
        },
        setProgress,
      );
      setCreated(true);
      onCreated();
    } catch (submitError) {
      setError(friendlyError(submitError));
    }
  }

  if (created) {
    return (
      <section className="success-panel">
        <span className="success-mark" aria-hidden="true">✓</span>
        <p className="eyebrow">Pact confirmed</p>
        <h2>Your pact is ready.</h2>
        <p>Track your progress in My pacts.</p>
        <button className="button button-primary" onClick={() => { setCreated(false); setReviewing(false); }}>
          Create another pact
        </button>
      </section>
    );
  }

  return (
    <section className="create-layout">
      <aside className="template-column">
        <p className="eyebrow">Templates</p>
        <h2>Pick a starting point</h2>
        <div className="template-list">
          {templates.map((template, index) => (
            <button className="template-card" key={template.name} onClick={() => applyTemplate(index)}>
              <span>{template.kicker}</span>
              <strong>{template.name}</strong>
              <small>{template.periods} periods · {template.misses} miss allowed</small>
            </button>
          ))}
        </div>
      </aside>

      <div className="form-card">
        <div className="form-heading">
          <div>
            <p className="eyebrow">{reviewing ? "Review" : "New pact"}</p>
            <h2>{reviewing ? "Review your pact" : "Create your pact"}</h2>
          </div>
          <span className="step-pill">{reviewing ? "2 / 2" : "1 / 2"}</span>
        </div>

        {reviewing ? (
          <div className="review-stack">
            <div className="review-hero">
              <span className={`mode-chip mode-${mode.toLowerCase()}`}>{mode === "SELF" ? "Self-stake" : "Challenge"}</span>
              <h3>{title}</h3>
              <p>{criteria}</p>
            </div>
            <dl className="review-grid">
              <div><dt>Schedule</dt><dd>{periods} × 1 minute</dd></div>
              <div><dt>Allowed misses</dt><dd>{misses}</dd></div>
              <div><dt>Your test stake</dt><dd>{formatGen(stakeAtto)} GEN</dd></div>
              <div><dt>Starts</dt><dd>{new Date(start).toLocaleString()}</dd></div>
              <div className="review-wide"><dt>Evidence</dt><dd>Public file on IPFS or Arweave</dd></div>
              {mode === "SELF" ? <div className="review-wide"><dt>If you lose</dt><dd className="mono">{failureRecipient}</dd></div> : null}
            </dl>
            <div className="notice-box">
              <strong>Before you confirm</strong>
              <p>Skipped periods count as misses. Claims open after appeals close.</p>
            </div>
            <div className="form-actions">
              <button className="button button-secondary" onClick={() => setReviewing(false)} disabled={busy}>Edit</button>
              <button className="button button-primary" onClick={submit} disabled={busy}>
                {CONTRACT_READY ? "Confirm test stake" : "Preview only"}
              </button>
            </div>
          </div>
        ) : (
          <div className="form-stack">
            <fieldset>
              <legend>Pact style</legend>
              <div className="segmented">
                <button className={mode === "SELF" ? "active" : ""} onClick={() => setMode("SELF")} type="button">
                  <strong>Self-stake</strong><span>Your own goal</span>
                </button>
                <button className={mode === "CHALLENGE" ? "active" : ""} onClick={() => setMode("CHALLENGE")} type="button">
                  <strong>Challenge</strong><span>Invite a challenger</span>
                </button>
              </div>
            </fieldset>
            <label>
              <span>Pact title</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} />
            </label>
            <label>
              <span>Success criteria</span>
              <textarea value={criteria} onChange={(event) => setCriteria(event.target.value)} maxLength={600} rows={4} />
              <small>What must your evidence show each period?</small>
            </label>
            <div className="field-row">
              <label><span>Periods</span><input type="number" min={3} max={60} value={periods} onChange={(event) => setPeriods(Number(event.target.value))} /><small>One minute each on StudioNet.</small></label>
              <label><span>Allowed misses</span><input type="number" min={0} max={Math.floor(periods / 3)} value={misses} onChange={(event) => setMisses(Number(event.target.value))} /></label>
            </div>
            <div className="field-row">
              <label><span>Test stake in GEN</span><input inputMode="decimal" value={stake} onChange={(event) => setStake(event.target.value)} /></label>
              <label><span>Start in your timezone</span><input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} /></label>
            </div>
            {mode === "SELF" ? (
              <label>
                <span>Failure recipient</span>
                <input className="mono" placeholder="0x… recipient address" value={failureRecipient} onChange={(event) => setFailureRecipient(event.target.value)} />
                <small>Receives your test stake if you lose.</small>
              </label>
            ) : (
              <div className="notice-box"><strong>Invite after creation</strong><p>Share the invite. Your challenger matches the test stake.</p></div>
            )}
            <button className="button button-primary button-wide" onClick={openReview}>Review pact</button>
          </div>
        )}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <TxNotice progress={progress} />
      </div>
    </section>
  );
}
