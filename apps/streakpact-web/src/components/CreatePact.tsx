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

const templates = [
  {
    name: "Strength training",
    kicker: "Fitness",
    title: "Three strength sessions each week",
    criteria:
      "Complete one documented strength workout lasting at least 30 minutes during every pact period.",
    periods: 4,
    misses: 1,
  },
  {
    name: "Daily reading",
    kicker: "Learning",
    title: "Read for 30 focused minutes",
    criteria:
      "Provide an immutable reading record showing at least 30 minutes of focused reading during every pact period.",
    periods: 7,
    misses: 1,
  },
  {
    name: "Consistent shipping",
    kicker: "Building",
    title: "Ship one meaningful code change",
    criteria:
      "Provide an immutable repository activity record showing one meaningful authored code change during every pact period.",
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

  const stakeAtto = useMemo(() => {
    try {
      return parseGen(stake);
    } catch {
      return 0n;
    }
  }, [stake]);

  function applyTemplate(index: number) {
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
    if (stakeAtto < 10n ** 15n) return "The minimum stake is 0.001 GEN.";
    if (stakeAtto > 100n * 10n ** 18n) return "The maximum stake is 100 GEN.";
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
    if (!session) {
      setError("Connect your wallet before creating a pact.");
      return;
    }
    if (!CONTRACT_READY) {
      setError("This environment is in product-preview mode. Configure the V2 contract to transact.");
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
        <h2>Your commitment is live.</h2>
        <p>We’ll surface each evidence window, provisional verdict, and appeal deadline in your dashboard.</p>
        <button className="button button-primary" onClick={() => { setCreated(false); setReviewing(false); }}>
          Create another pact
        </button>
      </section>
    );
  }

  return (
    <section className="create-layout">
      <aside className="template-column">
        <p className="eyebrow">Start with a proven shape</p>
        <h2>Choose a pact template</h2>
        <p className="muted">Templates keep evidence rules specific enough for independent validators to judge.</p>
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
            <p className="eyebrow">{reviewing ? "Final review" : "Design your pact"}</p>
            <h2>{reviewing ? "Know exactly what you’re signing" : "Turn intention into a clear agreement"}</h2>
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
              <div><dt>Schedule</dt><dd>{periods} periods</dd></div>
              <div><dt>Grace</dt><dd>{misses} misses</dd></div>
              <div><dt>Your test stake</dt><dd>{formatGen(stakeAtto)} GEN</dd></div>
              <div><dt>Starts</dt><dd>{new Date(start).toLocaleString()}</dd></div>
              <div className="review-wide"><dt>Evidence</dt><dd>Immutable IPFS or Arweave artifact + SHA-256 digest</dd></div>
              {mode === "SELF" ? <div className="review-wide"><dt>If you miss</dt><dd className="mono">{failureRecipient}</dd></div> : null}
            </dl>
            <div className="notice-box">
              <strong>Settlement safeguard</strong>
              <p>Every elapsed period is counted. Payouts remain locked through the appeal window.</p>
            </div>
            <div className="form-actions">
              <button className="button button-secondary" onClick={() => setReviewing(false)}>Back to edit</button>
              <button className="button button-primary" onClick={submit} disabled={progress?.state === "finalizing"}>
                {CONTRACT_READY ? "Confirm with StudioNet test GEN" : "Preview mode — deployment required"}
              </button>
            </div>
          </div>
        ) : (
          <div className="form-stack">
            <fieldset>
              <legend>Pact style</legend>
              <div className="segmented">
                <button className={mode === "SELF" ? "active" : ""} onClick={() => setMode("SELF")} type="button">
                  <strong>Self-stake</strong><span>Put your own commitment on the line</span>
                </button>
                <button className={mode === "CHALLENGE" ? "active" : ""} onClick={() => setMode("CHALLENGE")} type="button">
                  <strong>Challenge</strong><span>Invite someone to match your stake</span>
                </button>
              </div>
            </fieldset>
            <label>
              <span>Pact title</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} />
            </label>
            <label>
              <span>Exact success criteria</span>
              <textarea value={criteria} onChange={(event) => setCriteria(event.target.value)} maxLength={600} rows={4} />
              <small>Describe one period, the minimum result, and what the evidence must show.</small>
            </label>
            <div className="field-row">
              <label><span>Periods</span><input type="number" min={3} max={60} value={periods} onChange={(event) => setPeriods(Number(event.target.value))} /></label>
              <label><span>Allowed misses</span><input type="number" min={0} max={Math.floor(periods / 3)} value={misses} onChange={(event) => setMisses(Number(event.target.value))} /></label>
            </div>
            <div className="field-row">
              <label><span>Test stake in GEN</span><input inputMode="decimal" value={stake} onChange={(event) => setStake(event.target.value)} /></label>
              <label><span>Start in your timezone</span><input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} /></label>
            </div>
            {mode === "SELF" ? (
              <label>
                <span>Failure recipient</span>
                <input className="mono" placeholder="0x… charity, friend, or accountability pool" value={failureRecipient} onChange={(event) => setFailureRecipient(event.target.value)} />
                <small>This address receives the stake only if the final result is lost.</small>
              </label>
            ) : (
              <div className="notice-box"><strong>Invite after creation</strong><p>Your pact stays unfunded by the challenger until they open the share link and match your stake.</p></div>
            )}
            <button className="button button-primary button-wide" onClick={openReview}>Review pact terms</button>
          </div>
        )}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <TxNotice progress={progress} />
      </div>
    </section>
  );
}
