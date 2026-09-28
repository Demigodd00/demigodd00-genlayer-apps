"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CONTRACT_READY,
  EXPLORER_URL,
  formatGen,
  getClaim,
  getCredit,
  getPendingTransaction,
  getStats,
  listClaims,
  parseGen,
  reconcilePendingTransaction,
  shortenAddress,
  writeContract,
  type Address,
  type ClaimRecord,
  type ClaimSummary,
  type ProtocolStats,
  type Provider,
  type PendingTransaction,
  type WalletSession,
} from "@/lib/attest";

declare global {
  interface Window {
    ethereum?: Provider;
  }
}

type Draft = {
  title: string;
  statement: string;
  rule: string;
  urls: string[];
  bond: string;
  windowSecs: number;
};

type Notice = {
  tone: "success" | "error" | "pending";
  text: string;
  hash?: string;
};

const DEMO_CLAIMS: ClaimSummary[] = [
  {
    id: "AT-021",
    title: "Northstar reports 100% reserve backing",
    statement: "Northstar states every outstanding unit is backed by an equivalent reserve.",
    author: "0x39c8…a21f",
    bond_atto: "12000000000000000000",
    challenge_bond_atto: "1200000000000000000",
    created_at: "1790250000",
    challenge_deadline: "1791130000",
    status: "CHALLENGED",
    outcome: "",
    terms_digest: "b7310e5b7f0cb726d4c415c0",
    challenged: true,
  },
  {
    id: "AT-020",
    title: "Every public endpoint meets the 99.9% target",
    statement: "The status report says all listed public endpoints maintained 99.9% availability this month.",
    author: "0xe2a1…8c10",
    bond_atto: "5000000000000000000",
    challenge_bond_atto: "500000000000000000",
    created_at: "1790150000",
    challenge_deadline: "1791700000",
    status: "OPEN",
    outcome: "",
    terms_digest: "ad8e4c11aa5a2ca7ce60b9f4",
    challenged: false,
  },
  {
    id: "AT-019",
    title: "The October grant reached all 400 recipients",
    statement: "The published distribution record accounts for 400 grant recipients.",
    author: "0xb104…602c",
    bond_atto: "8000000000000000000",
    challenge_bond_atto: "800000000000000000",
    created_at: "1789550000",
    challenge_deadline: "1790200000",
    status: "RESOLVED",
    outcome: "SUPPORTED",
    terms_digest: "5d909bb8576dcdd45c4b92c2",
    challenged: true,
  },
];

const DEMO_DETAILS: Record<string, ClaimRecord> = {
  "AT-021": {
    ...DEMO_CLAIMS[0],
    verification_rule:
      "Supported only if a dated reserve report shows assets at least equal to liabilities for the same reporting period. An unexplained shortfall disproves the claim.",
    source_urls: ["https://northstar.example/reserves"],
    review_window_secs: 86400,
    challenge: {
      challenger: "0x45a7…14d8",
      argument: "The cited attestation covers a different reporting date from the liability statement.",
      source_urls: ["https://audit.example/report"],
      bond_atto: "1200000000000000000",
      created_at: 1790340000,
    },
    author_argument: "",
    response_argument: "The report was updated after the challenge was raised.",
    response_urls: ["https://northstar.example/updated-reserves"],
    reason: "",
    citations: [],
    evidence_snapshot: [],
    resolved_at: 0,
  },
  "AT-020": {
    ...DEMO_CLAIMS[1],
    verification_rule:
      "The uptime report must cover the same calendar month and include every endpoint in the public endpoint list.",
    source_urls: ["https://status.example/monthly"],
    review_window_secs: 86400,
    challenge: null,
    author_argument: "",
    response_argument: "",
    response_urls: [],
    reason: "",
    citations: [],
    evidence_snapshot: [],
    resolved_at: 0,
  },
  "AT-019": {
    ...DEMO_CLAIMS[2],
    verification_rule:
      "The public distribution record must list 400 unique recipient addresses and a non-zero transfer for each.",
    source_urls: ["https://grants.example/october"],
    review_window_secs: 3600,
    challenge: {
      challenger: "0xd095…ac31",
      argument: "I could only find 398 unique addresses in the distribution file.",
      source_urls: ["https://grants.example/recipient-audit"],
      bond_atto: "800000000000000000",
      created_at: 1789600000,
    },
    author_argument: "",
    response_argument: "",
    response_urls: [],
    reason: "The published distribution file lists 400 unique recipients.",
    citations: [
      {
        source_id: "S1",
        role: "CLAIM",
        url: "https://grants.example/october",
        digest: "ac6bd4",
        line: 12,
        excerpt: "Recipients: 400 unique addresses",
      },
    ],
    evidence_snapshot: [],
    resolved_at: 1790200000,
  },
};

const EMPTY_STATS: ProtocolStats = {
  total_created: "0",
  total_challenged: "0",
  total_supported: "0",
  total_disproven: "0",
  total_inconclusive: "0",
  total_timeout_refunded: "0",
  total_locked_atto: "0",
  total_settled_atto: "0",
};

function BrandMark() {
  return (
    <span className="brand-seal" aria-hidden="true">
      <svg viewBox="0 0 38 38" fill="none">
        <circle cx="19" cy="19" r="16.5" stroke="currentColor" />
        <circle cx="19" cy="19" r="11.5" stroke="currentColor" strokeDasharray="1 2.3" />
        <path d="m12.8 19.4 4.1 4.1 8.6-9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function formatDate(value: string | number): string {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "—";
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function timeLeft(value: string | number, now: number): string {
  if (now <= 0) return "Checking deadline";
  const seconds = Number(value) - now;
  if (seconds <= 0) return "Review window closed";
  if (seconds < 3600) return "Closes in " + Math.max(1, Math.ceil(seconds / 60)) + " min";
  if (seconds < 86400) return "Closes in " + Math.ceil(seconds / 3600) + " hr";
  return "Closes in " + Math.ceil(seconds / 86400) + " days";
}

function statusLabel(claim: ClaimSummary): string {
  if (claim.status === "OPEN") return "Open for challenge";
  if (claim.status === "CHALLENGED") return "Evidence in review";
  if (claim.outcome === "UNCONTESTED") return "Unchallenged";
  if (claim.outcome === "TIMEOUT_REFUND") return "Timed out · refunded";
  return claim.outcome || "Resolved";
}

function statusTone(claim: ClaimSummary): string {
  if (claim.status === "OPEN") return "open";
  if (claim.status === "CHALLENGED") return "challenged";
  if (claim.outcome === "DISPROVEN") return "disproven";
  if (claim.outcome === "INCONCLUSIVE") return "inconclusive";
  if (claim.outcome === "TIMEOUT_REFUND") return "inconclusive";
  return "supported";
}

function readUrls(input: string): string[] {
  return input.split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
}

function ClaimCard({
  claim,
  onOpen,
  now,
}: {
  claim: ClaimSummary;
  onOpen: (claim: ClaimSummary) => void;
  now: number;
}) {
  return (
    <button className="claim-card" type="button" onClick={() => onOpen(claim)}>
      <div className="claim-card-top">
        <span className="claim-id">{claim.id}</span>
        <span className={"status-tag " + statusTone(claim)}><i />{statusLabel(claim)}</span>
      </div>
      <h3>{claim.title}</h3>
      <p>{claim.statement}</p>
      <div className="claim-card-bottom">
        <span><small>Bond</small><strong>{formatGen(claim.bond_atto)} <i>GEN</i></strong></span>
        <span><small>{claim.status === "OPEN" ? "Challenge window" : claim.status === "CHALLENGED" ? "Review closes" : "Posted"}</small>
          <strong className="card-date">{claim.status === "RESOLVED" ? formatDate(claim.created_at) : timeLeft(claim.challenge_deadline, now)}</strong>
        </span>
        <span className="card-arrow" aria-hidden="true">↗</span>
      </div>
    </button>
  );
}

function CreateDialog({
  onClose,
  onSubmit,
  onDeposit,
  credit,
  busy,
  live,
}: {
  onClose: () => void;
  onSubmit: (draft: Draft) => Promise<void>;
  onDeposit: (amount: bigint) => Promise<void>;
  credit: string;
  busy: boolean;
  live: boolean;
}) {
  const [title, setTitle] = useState("");
  const [statement, setStatement] = useState("");
  const [rule, setRule] = useState("");
  const [urlsText, setUrlsText] = useState("");
  const [bond, setBond] = useState("1");
  const [windowSecs, setWindowSecs] = useState(86400);
  const [error, setError] = useState("");
  let shortfall = 0n;
  try {
    const required = parseGen(bond);
    const available = BigInt(credit || "0");
    shortfall = required > available ? required - available : 0n;
  } catch {
    // The form displays the amount error when the user submits.
  }

  async function addCredit() {
    setError("");
    try {
      const required = parseGen(bond);
      if (required < 4n * 10n ** 15n || required > 1000n * 10n ** 18n) {
        throw new Error("Choose a claim bond between 0.004 and 1,000 GEN first.");
      }
      if (shortfall > 0n) await onDeposit(shortfall);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add GEN credit.");
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const urls = readUrls(urlsText);
    if (urls.length < 1 || urls.length > 2) {
      setError("Add one or two public source URLs, one per line.");
      return;
    }
    try {
      await onSubmit({ title, statement, rule, urls, bond, windowSecs });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The claim could not be submitted.");
    }
  }

  return (
    <div className="overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="dialog create-dialog" role="dialog" aria-modal="true" aria-labelledby="create-title">
        <div className="dialog-head">
          <div><span className="kicker">New docket entry</span><h2 id="create-title">Put a bond behind it.</h2></div>
          <button className="close-button" type="button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p className="dialog-intro">Make one clear, checkable claim. Your terms and bond are locked when you publish. Source URLs lock too; page contents are fetched later at adjudication.</p>
        <form onSubmit={(event) => void submit(event)}>
          <label className="field">
            <span>Claim title</span>
            <input required minLength={5} maxLength={96} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What are you willing to stand behind?" />
          </label>
          <label className="field">
            <span>Public claim</span>
            <textarea required minLength={20} maxLength={1600} rows={3} value={statement} onChange={(event) => setStatement(event.target.value)} placeholder="State the factual claim and its relevant timeframe." />
          </label>
          <label className="field">
            <span>Verification rule <small>Be explicit about what counts as support or contradiction.</small></span>
            <textarea required minLength={25} maxLength={1400} rows={3} value={rule} onChange={(event) => setRule(event.target.value)} placeholder="Supported when… Disproved when… Otherwise inconclusive." />
          </label>
          <label className="field">
            <span>Starting evidence <small>One or two stable public HTTPS URLs, one per line; each page should fit within 6,000 text characters.</small></span>
            <textarea required rows={2} value={urlsText} onChange={(event) => setUrlsText(event.target.value)} placeholder="https://your-domain.org/report.txt" />
          </label>
          <div className="form-split">
            <label className="field">
              <span>Claim bond <small>0.004–1,000 GEN</small></span>
              <div className="money-input"><input required inputMode="decimal" value={bond} onChange={(event) => setBond(event.target.value)} /><b>GEN</b></div>
            </label>
            <label className="field">
              <span>Challenge window</span>
              <select value={windowSecs} onChange={(event) => setWindowSecs(Number(event.target.value))}>
                <option value={86400}>24 hours</option>
                <option value={604800}>7 days</option>
                <option value={2592000}>30 days</option>
              </select>
            </label>
          </div>
          <div className="bond-explainer"><span className="tiny-seal">01</span><p>Available credit: {formatGen(credit)} GEN. {shortfall > 0n ? "Add " + formatGen(shortfall) + " GEN before publishing; unused credit stays withdrawable." : "Your available credit can cover this bond."}</p></div>
          {live && shortfall > 0n ? <button className="button button-quiet funding-button" type="button" disabled={busy} onClick={() => void addCredit()}>{busy ? "Waiting…" : "Step 1 · Add " + formatGen(shortfall) + " GEN credit"} <span>↗</span></button> : null}
          <div className="bond-explainer"><span className="tiny-seal">↔</span><p>A successful challenge can claim your bond. If the claim stands, your bond returns and the challenge bond is forfeited. If evidence is inconclusive, both bonds return.</p></div>
          {!live ? <p className="preview-note">Preview mode: publishing will be available after an ATTEST contract is deployed.</p> : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="dialog-actions">
            <button className="button button-quiet" type="button" onClick={onClose}>Cancel</button>
            <button className="button button-primary" type="submit" disabled={busy || !live || shortfall > 0n}>{busy ? "Waiting for confirmation…" : "Step 2 · Publish claim"}<span>↗</span></button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ClaimDialog({
  claim,
  now,
  connectedAddress,
  credit,
  live,
  loading,
  busy,
  onClose,
  onChallenge,
  onDeposit,
  onRespond,
  onFinalize,
  onResolve,
  onExpire,
}: {
  claim: ClaimRecord | ClaimSummary | null;
  now: number;
  connectedAddress: string;
  credit: string;
  live: boolean;
  loading: boolean;
  busy: boolean;
  onClose: () => void;
  onChallenge: (claim: ClaimRecord, argument: string, urls: string[]) => Promise<void>;
  onDeposit: (amount: bigint) => Promise<void>;
  onRespond: (claim: ClaimRecord, argument: string, urls: string[]) => Promise<void>;
  onFinalize: (claim: ClaimSummary) => Promise<void>;
  onResolve: (claim: ClaimSummary) => Promise<void>;
  onExpire: (claim: ClaimSummary) => Promise<void>;
}) {
  const [challengeArgument, setChallengeArgument] = useState("");
  const [challengeUrls, setChallengeUrls] = useState("");
  const [responseArgument, setResponseArgument] = useState("");
  const [responseUrls, setResponseUrls] = useState("");
  const [error, setError] = useState("");

  if (!claim) return null;
  const detailed = "verification_rule" in claim;
  const deadline = Number(claim.challenge_deadline);
  const adjudicationDeadline = deadline + 7 * 86400;
  const reviewClosed = now > 0 && now >= deadline;
  const isAuthor = connectedAddress.toLowerCase() === claim.author.toLowerCase();
  const challenged = claim.status === "CHALLENGED";
  const details = detailed ? (claim as ClaimRecord) : null;
  const canRespond = details !== null && challenged && isAuthor && !reviewClosed && details.response_urls.length === 0;
  const canChallenge = claim.status === "OPEN" && !isAuthor && !reviewClosed;
  const challengeShortfall = BigInt(claim.challenge_bond_atto) > BigInt(credit || "0")
    ? BigInt(claim.challenge_bond_atto) - BigInt(credit || "0") : 0n;
  const canFinalize = claim.status === "OPEN" && reviewClosed;
  const canResolve = claim.status === "CHALLENGED" && reviewClosed && now < adjudicationDeadline;
  const canExpire = claim.status === "CHALLENGED" && now >= adjudicationDeadline;
  async function submitChallenge(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const urls = readUrls(challengeUrls);
    if (!details || urls.length < 1 || urls.length > 2) {
      setError("Add one or two public source URLs to support the challenge.");
      return;
    }
    try {
      await onChallenge(details, challengeArgument, urls);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The challenge could not be submitted.");
    }
  }

  async function addChallengeCredit() {
    setError("");
    try {
      if (challengeShortfall > 0n) await onDeposit(challengeShortfall);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add GEN credit.");
    }
  }

  async function submitResponse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const urls = readUrls(responseUrls);
    if (!details || urls.length < 1 || urls.length > 2) {
      setError("Add one or two public source URLs to support the response.");
      return;
    }
    try {
      await onRespond(details, responseArgument, urls);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The response could not be submitted.");
    }
  }

  return (
    <div className="overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="dialog detail-dialog" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <div className="dialog-head">
          <div><span className="kicker">{claim.id} · Claim file</span><span className={"status-tag " + statusTone(claim)}><i />{statusLabel(claim)}</span></div>
          <button className="close-button" type="button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <h2 id="detail-title">{claim.title}</h2>
        <p className="detail-statement">{claim.statement}</p>
        {loading ? <div className="detail-loading"><span className="spinner" />Loading the full claim record…</div> : null}
        {details ? (
          <>
            <div className="detail-two-up">
              <div className="detail-box"><span>Verification rule</span><p>{details.verification_rule}</p></div>
              <div className="detail-box"><span>Terms digest</span><code>{details.terms_digest}</code><small>Claim wording, rule, bond and deadline were locked at publication.</small></div>
            </div>
            <div className="evidence-block">
              <div className="subheading"><span className="kicker">Evidence on file</span><small>{details.source_urls.length + (details.challenge?.source_urls.length ?? 0) + details.response_urls.length} source(s)</small></div>
              <p className="evidence-note">The source URLs are fixed on-chain. External page contents are captured when a challenged claim is adjudicated.</p>
              {details.source_urls.map((url, index) => <EvidenceLink key={"claim-" + url} url={url} role={"Claim · source " + (index + 1)} />)}
              {details.challenge ? details.challenge.source_urls.map((url, index) => <EvidenceLink key={"challenge-" + url} url={url} role={"Challenge · source " + (index + 1)} />) : null}
              {details.response_urls.map((url, index) => <EvidenceLink key={"response-" + url} url={url} role={"Author reply · source " + (index + 1)} />)}
              {details.challenge ? (
                <div className="argument-card challenge-argument"><span>CHALLENGER’S CASE</span><p>{details.challenge.argument}</p><small>Counter-bond · {formatGen(details.challenge.bond_atto)} GEN · {shortenAddress(details.challenge.challenger)}</small></div>
              ) : null}
              {details.response_argument ? <div className="argument-card"><span>AUTHOR’S REPLY</span><p>{details.response_argument}</p></div> : null}
            </div>
            {claim.status === "RESOLVED" ? (
              <div className="resolution-box">
                <div><span className={"outcome-stamp " + statusTone(claim)}>{claim.outcome === "SUPPORTED" ? "✓" : claim.outcome === "DISPROVEN" ? "×" : "?"}</span><div><span className="kicker">{claim.outcome === "UNCONTESTED" || claim.outcome === "TIMEOUT_REFUND" ? "Resolution record" : "Final determination"}</span><strong>{claim.outcome}</strong></div></div>
                {details.reason ? <p>{details.reason}</p> : null}
                {details.citations.length ? <div className="citation-list">{details.citations.map((citation, index) => <div className="citation" key={citation.source_id + citation.line + index}><span>{citation.source_id} · line {citation.line}</span><p>“{citation.excerpt}”</p><a href={citation.url} target="_blank" rel="noreferrer">{citation.url} ↗</a></div>)}</div> : null}
                {details.evidence_snapshot.length ? <details className="snapshot-details"><summary>View evidence snapshots and hashes</summary>{details.evidence_snapshot.map((source) => <div key={source.id + source.url}><span>{source.id} · {source.role} · {source.status}</span><code>{source.digest || "No readable snapshot"}</code><a href={source.url} target="_blank" rel="noreferrer">{source.url}</a>{source.text ? <pre className="snapshot-text">{source.text}</pre> : null}</div>)}</details> : null}
              </div>
            ) : (
              <div className="review-box">
                <div className="review-meta">
                  <span><small>Claim bond</small><strong>{formatGen(claim.bond_atto)} GEN</strong></span>
                  <span><small>Challenge bond</small><strong>{formatGen(claim.challenge_bond_atto)} GEN</strong></span>
                  <span><small>Review closes</small><strong>{timeLeft(claim.challenge_deadline, now)}</strong></span>
                </div>
                {canChallenge ? (
                  live ? (
                    <form className="action-form" onSubmit={(event) => void submitChallenge(event)}>
                      <h3>Challenge this claim</h3>
                      <p>Post a concise counter-argument and public evidence. Source URLs lock now; page contents are fetched at adjudication. Add recoverable GEN credit first.</p>
                      <label className="field"><span>Your counter-argument</span><textarea required minLength={12} maxLength={1200} rows={2} value={challengeArgument} onChange={(event) => setChallengeArgument(event.target.value)} placeholder="What specific part of the claim does the evidence contradict?" /></label>
                      <label className="field"><span>Counter-evidence URLs <small>One or two stable public HTTPS links, each under 6,000 text characters.</small></span><textarea required rows={2} value={challengeUrls} onChange={(event) => setChallengeUrls(event.target.value)} placeholder="https://your-source.org/audit.txt" /></label>
                      <p className="credit-hint">Available credit: {formatGen(credit)} GEN · required: {formatGen(claim.challenge_bond_atto)} GEN</p>
                      {challengeShortfall > 0n ? <button className="button button-quiet funding-button" type="button" disabled={busy} onClick={() => void addChallengeCredit()}>{busy ? "Waiting…" : "Step 1 · Add " + formatGen(challengeShortfall) + " GEN credit"} <span>↗</span></button> : null}
                      <button className="button button-dark" type="submit" disabled={busy || challengeShortfall > 0n}>Step 2 · Post challenge <span>↗</span></button>
                    </form>
                  ) : <p className="preview-note">Preview only: challenges require a deployed ATTEST contract.</p>
                ) : null}
                {canRespond ? (
                  <form className="action-form response-form" onSubmit={(event) => void submitResponse(event)}>
                    <h3>Reply with evidence</h3>
                    <p>Add one public response before the review window closes.</p>
                    <label className="field"><span>Your reply</span><textarea required minLength={12} maxLength={1200} rows={2} value={responseArgument} onChange={(event) => setResponseArgument(event.target.value)} placeholder="Address the challenge with specific context." /></label>
                    <label className="field"><span>Response URLs <small>One or two stable public HTTPS links, each under 6,000 text characters.</small></span><textarea required rows={2} value={responseUrls} onChange={(event) => setResponseUrls(event.target.value)} placeholder="https://your-domain.org/response.txt" /></label>
                    <button className="button button-primary" type="submit" disabled={busy}>Add response evidence <span>↗</span></button>
                  </form>
                ) : null}
                {(canFinalize || canResolve || canExpire) ? (
                  <div className="settle-action">
                    <div><span className="kicker">Permissionless next step</span><p>{canResolve ? "Ask GenLayer validators to compare the claim, rule and submitted evidence." : canExpire ? "Adjudication did not finalize within seven days. Return each party’s bond." : "The challenge window ended without a challenge; return the author’s bond."}</p></div>
                    {live ? <button className="button button-dark" type="button" disabled={busy} onClick={() => void (canResolve ? onResolve(claim) : canExpire ? onExpire(claim) : onFinalize(claim))}>{busy ? "Waiting…" : canResolve ? "Resolve with GenLayer" : canExpire ? "Refund both bonds" : "Finalize claim"} <span>↗</span></button> : <span className="preview-only">Contract not deployed</span>}
                  </div>
                ) : null}
              </div>
            )}
            {error ? <p className="form-error" role="alert">{error}</p> : null}
          </>
        ) : !loading ? <div className="detail-placeholder">This sample record is for interface preview.</div> : null}
      </section>
    </div>
  );
}

function EvidenceLink({ url, role }: { url: string; role: string }) {
  return <a className="evidence-link" href={url} target="_blank" rel="noreferrer"><span><i />{role}</span><strong>{new URL(url).hostname}</strong><b>↗</b></a>;
}

export default function AttestApp() {
  const [claims, setClaims] = useState<ClaimSummary[]>(CONTRACT_READY ? [] : DEMO_CLAIMS);
  const [totalClaims, setTotalClaims] = useState(CONTRACT_READY ? 0 : DEMO_CLAIMS.length);
  const [stats, setStats] = useState<ProtocolStats>(EMPTY_STATS);
  const [session, setSession] = useState<WalletSession | null>(null);
  const [pending, setPending] = useState<PendingTransaction | null>(null);
  const [credit, setCredit] = useState("0");
  const [activeTab, setActiveTab] = useState("All claims");
  const [lookupId, setLookupId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [claimDetail, setClaimDetail] = useState<ClaimRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(CONTRACT_READY);
  const [detailLoading, setDetailLoading] = useState(false);
  const [now, setNow] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!session) return;
    const clearSession = () => setSession(null);
    session.provider.on?.("accountsChanged", clearSession);
    session.provider.on?.("chainChanged", clearSession);
    return () => {
      session.provider.removeListener?.("accountsChanged", clearSession);
      session.provider.removeListener?.("chainChanged", clearSession);
    };
  }, [session]);

  useEffect(() => {
    if (!CONTRACT_READY) return;
    const requested = new URLSearchParams(window.location.search).get("claim");
    if (!requested || !/^att-\d+$/.test(requested)) return;
    setSelectedId(requested);
    setDetailLoading(true);
    getClaim(requested).then(setClaimDetail).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Could not load the linked claim.");
      setSelectedId("");
    }).finally(() => setDetailLoading(false));
  }, []);

  useEffect(() => {
    if (!CONTRACT_READY) return;
    let mounted = true;
    setLoading(true);
    Promise.all([listClaims(), getStats()])
      .then(([page, nextStats]) => {
        if (!mounted) return;
        setClaims(page.items);
        setTotalClaims(page.total);
        setStats(nextStats);
        setError("");
      })
      .catch((reason: unknown) => {
        if (mounted) {
          setClaims([]);
          setError(reason instanceof Error ? reason.message : "Could not read the ATTEST contract.");
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!session || !CONTRACT_READY) {
      setCredit("0");
      setPending(null);
      return;
    }
    getCredit(session.address as Address).then(setCredit).catch(() => setCredit("0"));
    try { setPending(getPendingTransaction(session.address)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not read the saved transaction."); }
  }, [session]);

  const selectedSummary = useMemo(() => claims.find((claim) => claim.id === selectedId) ?? null, [claims, selectedId]);
  const selectedClaim = claimDetail?.id === selectedId ? claimDetail : selectedSummary;
  const filteredClaims = claims.filter((claim) => {
    if (activeTab === "All claims") return true;
    if (activeTab === "Open") return claim.status === "OPEN";
    if (activeTab === "Challenged") return claim.status === "CHALLENGED";
    return claim.status === "RESOLVED";
  });
  const totalLocked = CONTRACT_READY ? formatGen(stats.total_locked_atto) : "—";

  async function connect() {
    setError("");
    if (!window.ethereum) {
      setError("No browser wallet found. Install MetaMask or another EVM wallet.");
      return;
    }
    try {
      const { connectWallet } = await import("@/lib/attest");
      const next = await connectWallet(window.ethereum);
      setSession(next);
      setNotice({ tone: "success", text: "Wallet connected to StudioNet." });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Wallet connection failed.");
    }
  }

  async function refreshContract() {
    if (!CONTRACT_READY) return;
    const [page, nextStats] = await Promise.all([listClaims(), getStats()]);
    setClaims(page.items);
    setTotalClaims(page.total);
    setStats(nextStats);
    if (session) setCredit(await getCredit(session.address as Address));
  }

  async function loadMore() {
    if (!CONTRACT_READY || loading || claims.length >= totalClaims) return;
    setLoading(true);
    try {
      const page = await listClaims(claims.length);
      setClaims((current) => [...current, ...page.items.filter((item) => !current.some((row) => row.id === item.id))]);
      setTotalClaims(page.total);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load more claims.");
    } finally {
      setLoading(false);
    }
  }

  async function lookupClaim(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = lookupId.trim().toLowerCase();
    if (!/^att-\d+$/.test(id)) {
      setError("Enter a claim ID such as att-1.");
      return;
    }
    setError("");
    setDetailLoading(true);
    try {
      const detail = await getClaim(id);
      setClaimDetail(detail);
      setSelectedId(id);
      window.history.replaceState(null, "", "?claim=" + encodeURIComponent(id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Claim not found.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function checkPending() {
    if (!session) return;
    setBusy(true);
    try {
      const result = await reconcilePendingTransaction(session);
      setPending(getPendingTransaction(session.address));
      setNotice({ tone: result.successful ? "success" : result.done ? "error" : "pending", text: result.message, hash: result.hash });
      if (result.done) await refreshContract();
    } catch (reason) {
      setNotice({ tone: "pending", text: reason instanceof Error ? reason.message : "Could not check finality. The saved transaction remains blocked." });
    } finally {
      setBusy(false);
    }
  }

  async function transaction(label: string, method: string, args: unknown[], value = 0n) {
    if (!session) throw new Error("Connect a wallet to continue.");
    if (!CONTRACT_READY) throw new Error("The ATTEST contract has not been deployed for this preview.");
    setBusy(true);
    setNotice({ tone: "pending", text: label + " · confirm in your wallet" });
    try {
      const hash = await writeContract(session, method, args, value, (submittedHash) => {
        setPending(getPendingTransaction(session.address));
        setNotice({ tone: "pending", text: label + " · submitted, waiting for finality", hash: submittedHash });
      });
      setPending(null);
      setNotice({ tone: "success", text: label + " confirmed by GenLayer validators.", hash });
      try {
        await refreshContract();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The transaction succeeded, but the app could not refresh its view.");
      }
      return hash;
    } catch (reason) {
      const saved = getPendingTransaction(session.address);
      setPending(saved);
      setNotice({ tone: saved ? "pending" : "error", text: saved ? "Transaction outcome is still unknown. Check the saved transaction before sending another." : reason instanceof Error ? reason.message : "Transaction failed.", hash: saved?.hash });
      throw reason;
    } finally {
      setBusy(false);
    }
  }

  async function createClaim(draft: Draft) {
    if (!session) throw new Error("Connect your wallet before publishing.");
    const bondAtto = parseGen(draft.bond);
    if (bondAtto < 4n * 10n ** 15n || bondAtto > 1000n * 10n ** 18n) {
      throw new Error("The claim bond must be between 0.004 and 1,000 GEN.");
    }
    if (BigInt(await getCredit(session.address)) < bondAtto) {
      throw new Error("Add enough recoverable GEN credit before publishing.");
    }
    const hash = await transaction(
      "Publishing claim",
      "create_claim",
      [draft.title, draft.statement, draft.rule, JSON.stringify(draft.urls), draft.windowSecs, bondAtto],
    );
    setCreateOpen(false);
    setNotice({ tone: "success", text: "Claim published and its terms are now locked.", hash });
  }

  async function challengeClaim(claim: ClaimRecord, argument: string, urls: string[]) {
    if (!session) throw new Error("Connect your wallet before challenging.");
    if (session.address.toLowerCase() === claim.author.toLowerCase()) {
      throw new Error("The claim author cannot challenge their own claim.");
    }
    const amount = BigInt(claim.challenge_bond_atto);
    if (BigInt(await getCredit(session.address)) < amount) {
      throw new Error("Add enough recoverable GEN credit before challenging.");
    }
    await transaction("Posting challenge", "challenge", [claim.id, argument, JSON.stringify(urls)]);
    setClaimDetail(await getClaim(claim.id));
  }

  async function depositCredit(amount: bigint) {
    if (!session) throw new Error("Connect your wallet before adding GEN credit.");
    if (amount <= 0n) throw new Error("Enter an amount greater than zero.");
    await transaction("Adding recoverable GEN credit", "deposit", [], amount);
    setCredit(await getCredit(session.address));
  }

  async function respondToClaim(claim: ClaimRecord, argument: string, urls: string[]) {
    await transaction("Adding author response", "respond", [claim.id, argument, JSON.stringify(urls)]);
    setClaimDetail(await getClaim(claim.id));
  }

  async function finalizeClaim(claim: ClaimSummary) {
    await transaction("Finalizing unchallenged claim", "finalize_uncontested", [claim.id]);
    setClaimDetail(await getClaim(claim.id));
  }

  async function resolveClaim(claim: ClaimSummary) {
    await transaction("Requesting independent adjudication", "resolve", [claim.id]);
    setClaimDetail(await getClaim(claim.id));
  }

  async function expireClaim(claim: ClaimSummary) {
    await transaction("Refunding unresolved dispute", "expire_challenged", [claim.id]);
    setClaimDetail(await getClaim(claim.id));
  }

  async function withdraw() {
    await transaction("Withdrawing available GEN credit", "withdraw_credit", []);
  }

  async function openClaim(claim: ClaimSummary) {
    setSelectedId(claim.id);
    if (CONTRACT_READY) window.history.replaceState(null, "", "?claim=" + encodeURIComponent(claim.id));
    setClaimDetail(null);
    if (!CONTRACT_READY) {
      setClaimDetail(DEMO_DETAILS[claim.id] ?? null);
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    try {
      setClaimDetail(await getClaim(claim.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load the claim record.");
    } finally {
      setDetailLoading(false);
    }
  }

  const tabs = ["All claims", "Open", "Challenged", "Resolved"];

  return (
    <main className="app">
      <div className="site-shell">
        <header className="topbar">
          <a className="brand" href="#" aria-label="ATTEST home">
            <BrandMark /><span>ATTEST<small>PUBLIC CLAIMS DOCKET</small></span>
          </a>
          <nav className="main-nav" aria-label="Main navigation">
            <a className="nav-active" href="#claims">Docket</a>
            <a href="#how-it-works">How it works</a>
            <a href="#protocol">Protocol</a>
          </nav>
          <div className="wallet-actions">
            {pending ? <button className="credit-button" type="button" onClick={() => void checkPending()} disabled={busy}>Check pending transaction ↗</button> : null}
            {session && CONTRACT_READY && BigInt(credit || "0") > 0n ? (
              <button className="credit-button" type="button" onClick={() => void withdraw()} disabled={busy}>
                {formatGen(credit)} GEN <span>Withdraw</span>
              </button>
            ) : null}
            <button className={"wallet-button " + (session ? "wallet-connected" : "")} type="button" onClick={() => void connect()}>
              <span className="wallet-indicator" />{session ? shortenAddress(session.address) : "Connect wallet"}
            </button>
          </div>
        </header>

        <div className={"network-strip " + (CONTRACT_READY ? "network-live" : "network-preview")}>
          <span className="network-light" />
          <strong>{CONTRACT_READY ? "StudioNet · ATTEST live" : "StudioNet · interface preview"}</strong>
          <span>Test GEN has no monetary value</span>
          {CONTRACT_READY ? <a href={EXPLORER_URL} target="_blank" rel="noreferrer">View contract ↗</a> : <span className="preview-chip">SAMPLE RECORDS</span>}
        </div>

        {error ? <div className="error-banner" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")}>Dismiss</button></div> : null}

        <section className="hero">
          <div className="hero-copy">
            <p className="overline"><span className="overline-line" />A CLAIM IS ONLY AS STRONG AS ITS PROOF</p>
            <h1>Put a bond<br />behind <em>what you</em><br /><em>claim.</em></h1>
            <p className="hero-summary">Make a public claim. Lock a bond behind it. If someone challenges the evidence, GenLayer independently weighs the record and settles the outcome.</p>
            <div className="hero-actions">
              <button className="button button-primary hero-button" type="button" onClick={() => setCreateOpen(true)}>Publish a claim <span>↗</span></button>
              <a className="text-link" href="#claims">Explore the docket <span>↓</span></a>
            </div>
            <div className="hero-footnote"><span className="tiny-lock">⌑</span> Terms lock on-chain · evidence stays public · settlement is permissionless</div>
          </div>
          <div className="hero-visual" aria-label="Example ATTEST claim file">
            <div className="file-card">
              <div className="file-top"><span><i className="status-pulse" />ILLUSTRATIVE FILE</span><span>SAMPLE</span></div>
              <div className="file-seal"><BrandMark /><span>PRODUCT<br />ILLUSTRATION</span></div>
              <p className="file-quote">“Northstar reports<br /><strong>100% reserve backing.</strong>”</p>
              <div className="file-rule"><span>VERIFICATION RULE</span><p>Reserve report must cover the same date as stated liabilities.</p></div>
              <div className="file-footer"><div><span>AUTHOR BOND</span><strong>12.00 <i>GEN</i></strong></div><div><span>COUNTER-BOND</span><strong>1.20 <i>GEN</i></strong></div></div>
              <div className="file-progress"><span /><span /><span className="active" /><span /><span /></div>
              <div className="file-progress-label"><span>CLAIM POSTED</span><b>UNDER REVIEW</b><span>SETTLEMENT</span></div>
            </div>
            <div className="float-note float-note-top"><span className="float-check">✓</span><div><small>SAMPLE TERMS DIGEST</small><strong>0xb731…5c0</strong></div></div>
            <div className="float-note float-note-bottom"><span className="float-dot" /><div><small>ILLUSTRATED REVIEW</small><strong>Validators · agreed outcome</strong></div></div>
            <div className="hero-index">01 / A BETTER KIND OF PROMISE</div>
          </div>
        </section>

        <section className="metric-strip" aria-label="Protocol overview">
          <div><span className="metric-label">{CONTRACT_READY ? "BONDS CURRENTLY LOCKED" : "LOCKED IN SAMPLE DOCKET"}</span><strong>{CONTRACT_READY ? totalLocked : "—"} <i>{CONTRACT_READY ? "GEN" : "PREVIEW"}</i></strong></div>
          <div><span className="metric-label">CLAIMS POSTED</span><strong>{CONTRACT_READY ? stats.total_created : "03"} <i>{CONTRACT_READY ? "ON-CHAIN" : "SAMPLE"}</i></strong></div>
          <div><span className="metric-label">DISPUTES RAISED</span><strong>{CONTRACT_READY ? stats.total_challenged : "02"} <i>{CONTRACT_READY ? "ON-CHAIN" : "SAMPLE"}</i></strong></div>
          <div><span className="metric-label">JUDGMENT ENGINE</span><strong className="metric-engine"><span className="engine-dot" />GENLAYER <i>CONSENSUS</i></strong></div>
        </section>

        <section className="docket-section" id="claims">
          <div className="section-intro">
            <div><p className="overline"><span className="overline-line" />OPEN RECORD</p><h2>Claims in the docket<span>.</span></h2></div>
            <p>Every claim starts with locked terms, a posted bond, and a public evidence trail.</p>
          </div>
          <div className="docket-toolbar">
            <div className="docket-tabs" role="tablist" aria-label="Filter claims">
              {tabs.map((tab) => <button type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? "active" : ""} key={tab} onClick={() => setActiveTab(tab)}>{tab}</button>)}
            </div>
            <span className="docket-count">{loading ? "SYNCING…" : String(filteredClaims.length).padStart(2, "0") + (CONTRACT_READY ? " SHOWN OF " + totalClaims : " SAMPLE FILES")}</span>
          </div>
          {CONTRACT_READY ? <form className="claim-lookup" onSubmit={(event) => void lookupClaim(event)}><label htmlFor="claim-lookup-id">Open a claim by ID</label><input id="claim-lookup-id" value={lookupId} onChange={(event) => setLookupId(event.target.value)} placeholder="att-1" /><button type="submit">Open record ↗</button></form> : null}
          {!CONTRACT_READY ? <div className="sample-banner"><span>i</span><p>These records demonstrate the interface. They are samples, not on-chain claims.</p><a href="#how-it-works">See how the protocol works</a></div> : null}
          {filteredClaims.length ? (
            <div className="claim-grid">
              {filteredClaims.map((claim) => <ClaimCard key={claim.id} claim={claim} onOpen={(next) => void openClaim(next)} now={now} />)}
            </div>
          ) : (
            <div className="empty-docket"><BrandMark /><h3>{CONTRACT_READY ? "No claims yet." : "No sample claims in this view."}</h3><p>Publish a claim to open the first file in this docket.</p><button className="button button-primary" type="button" onClick={() => setCreateOpen(true)}>Publish a claim <span>↗</span></button></div>
          )}
          {CONTRACT_READY && claims.length < totalClaims ? <button className="button button-quiet load-more" type="button" onClick={() => void loadMore()} disabled={loading}>{loading ? "Loading…" : "Load more claims"}</button> : null}
        </section>

        <section className="steps-section" id="how-it-works">
          <div className="section-intro">
            <div><p className="overline"><span className="overline-line" />THE PROCESS</p><h2>Make the claim.<br /><em>Show the proof.</em></h2></div>
            <p>ATTEST turns public statements into commitments with a clear path from evidence to settlement.</p>
          </div>
          <div className="steps-grid">
            <article className="step-card"><span>01</span><div className="step-icon">✳</div><h3>Lock the terms</h3><p>The author defines one factual claim, a concrete verification rule, source links, a deadline and a bond.</p><small>CLAIM + CRITERIA + BOND</small></article>
            <article className="step-card"><span>02</span><div className="step-icon">⌕</div><h3>Challenge with evidence</h3><p>Anyone can dispute the claim before the deadline by posting a counter-bond and linking public evidence.</p><small>PUBLIC SOURCES ONLY</small></article>
            <article className="step-card"><span>03</span><div className="step-icon">◉</div><h3>Settle on consensus</h3><p>GenLayer validators independently assess the same evidence. The contract routes both bonds by the agreed outcome.</p><small>SUPPORTED · DISPROVEN · UNCLEAR</small></article>
          </div>
        </section>

        <section className="protocol-section" id="protocol">
          <div className="protocol-copy">
            <p className="overline"><span className="overline-line" />BUILT FOR PUBLIC ACCOUNTABILITY</p>
            <h2>Evidence in.<br /><em>Judgment out.</em></h2>
            <p>ATTEST uses GenLayer where the answer depends on public evidence and interpretation. Each validator independently fetches the cited sources and judges them against the locked rule. The contract requires agreement on the final outcome before it changes who can withdraw the bond.</p>
            <a className="text-link" href={EXPLORER_URL} target="_blank" rel="noreferrer">Explore GenLayer <span>↗</span></a>
          </div>
          <div className="protocol-diagram">
            <div className="diagram-row"><span className="diagram-node node-doc">01</span><div><b>LOCKED CLAIM</b><small>Rule · deadline · source URLs</small></div><span className="diagram-arrow">→</span></div>
            <div className="diagram-line" />
            <div className="diagram-row"><span className="diagram-node node-web">02</span><div><b>PUBLIC EVIDENCE</b><small>Independent source snapshots</small></div><span className="diagram-arrow">→</span></div>
            <div className="diagram-line" />
            <div className="diagram-row"><span className="diagram-node node-judge">03</span><div><b>GENLAYER CONSENSUS</b><small>Validators compare decision fields</small></div><span className="diagram-arrow">→</span></div>
            <div className="diagram-line" />
            <div className="diagram-row"><span className="diagram-node node-settle">04</span><div><b>BOND SETTLEMENT</b><small>Pull credit follows final outcome</small></div><span className="diagram-done">✓</span></div>
            <div className="diagram-foot"><span>ATTEST PROTOCOL · VERSION 0.1</span><span>NO ADMIN OVERRIDE</span></div>
          </div>
        </section>

        <footer className="footer">
          <a className="brand footer-brand" href="#"><BrandMark /><span>ATTEST<small>PUBLIC CLAIMS DOCKET</small></span></a>
          <p>Claims with something at stake.</p>
          <div><a href="#claims">Docket</a><a href="#how-it-works">Method</a><span>GENLAYER · STUDIONET</span></div>
        </footer>
      </div>

      {notice ? <div className={"toast toast-" + notice.tone} role="status"><span className="toast-mark">{notice.tone === "success" ? "✓" : notice.tone === "error" ? "!" : "·"}</span><div><strong>{notice.text}</strong>{notice.hash ? <a href={"https://explorer-studio.genlayer.com/tx/" + notice.hash} target="_blank" rel="noreferrer">View transaction ↗</a> : null}</div><button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notice">×</button></div> : null}
      {createOpen ? <CreateDialog onClose={() => setCreateOpen(false)} onSubmit={createClaim} onDeposit={depositCredit} credit={credit} busy={busy} live={CONTRACT_READY} /> : null}
      {selectedId ? <ClaimDialog claim={selectedClaim} now={now} connectedAddress={session?.address ?? ""} credit={credit} live={CONTRACT_READY} loading={detailLoading} busy={busy} onClose={() => { setSelectedId(""); setClaimDetail(null); setDetailLoading(false); if (CONTRACT_READY) window.history.replaceState(null, "", window.location.pathname); }} onChallenge={challengeClaim} onDeposit={depositCredit} onRespond={respondToClaim} onFinalize={finalizeClaim} onResolve={resolveClaim} onExpire={expireClaim} /> : null}
    </main>
  );
}
