"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  appealClaim, BountySummary, BountyView, cancelBounty, challengeClaim, claimPayout, connectWallet,
  CONTRACT_READY, createBounty, expireBounty, finalizeBounty, formatGen, getBounty,
  parseGen, getBounty as loadBounty, isCommitSha,
  isGithubIssueUrl, isGithubPrUrl, listBounties, listClaims, listHunterClaims, listSponsorBounties,
  ClaimView, friendlyError, releaseRejectedStake, resolveClaim, shorten, submitClaim, TxProgress,
  WalletSession,
} from "@/lib/contract";

const emptyProgress: TxProgress = { state: "confirmed", label: "" };

function dateLabel(unix: string): string {
  const date = new Date(Number(unix) * 1000);
  return Number.isNaN(date.getTime()) ? "Unknown deadline" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function statusClass(status: string): string { return `status status-${status.toLowerCase().replaceAll("_", "-")}`; }

function StatusPill({ status }: { status: string }) { return <span className={statusClass(status)}>{status.replaceAll("_", " ")}</span>; }

function WalletButton({ session, onConnect }: { session: WalletSession | null; onConnect: () => void }) {
  return <button className="wallet-button" onClick={onConnect}>{session ? <><span className="wallet-dot" />{shorten(session.address)}</> : "Connect wallet"}</button>;
}

export default function BountyForgeApp() {
  const [session, setSession] = useState<WalletSession | null>(null);
  const [bounties, setBounties] = useState<BountySummary[]>([]);
  const [selected, setSelected] = useState<BountyView | null>(null);
  const [claims, setClaims] = useState<ClaimView[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [progress, setProgress] = useState<TxProgress>(emptyProgress);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [showChallenge, setShowChallenge] = useState(false);
  const [title, setTitle] = useState("");
  const [criteria, setCriteria] = useState("");
  const [issueUrl, setIssueUrl] = useState("");
  const [pot, setPot] = useState("1");
  const [deadline, setDeadline] = useState("14");
  const [prUrl, setPrUrl] = useState("");
  const [headSha, setHeadSha] = useState("");
  const [githubLogin, setGithubLogin] = useState("");
  const [challengeStatement, setChallengeStatement] = useState("");
  const [filter, setFilter] = useState("ALL");

  const refresh = async (id = selectedId) => {
    if (!CONTRACT_READY) return;
    setLoading(true); setError("");
    try {
      const items = await listBounties();
      setBounties(items);
      if (id) { setSelected(await loadBounty(id)); setClaims(await listClaims(id)); }
    } catch (e) { setError(friendlyError(e)); } finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, []);

  const visible = useMemo(() => filter === "ALL" ? bounties : bounties.filter((b) => b.status === filter), [bounties, filter]);

  async function connect() {
    try { setError(""); setSession(await connectWallet()); } catch (e) { setError(friendlyError(e)); }
  }

  async function selectBounty(id: string) {
    setSelectedId(id); setError("");
    try { setSelected(await getBounty(id)); setClaims(await listClaims(id)); window.scrollTo({ top: 0, behavior: "smooth" }); }
    catch (e) { setError(friendlyError(e)); }
  }

  async function run(action: () => Promise<string>) {
    setError("");
    try { await action(); await refresh(selectedId); }
    catch (e) { setError(friendlyError(e)); }
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!session) return setError("Connect a wallet before creating a bounty.");
    try {
      const amount = parseGen(pot);
      const unix = Math.floor(Date.now() / 1000) + Number(deadline) * 86400;
      await run(() => createBounty(session, { title, criteria, issueUrl, deadlineUnix: unix, potAtto: amount }, setProgress));
      setShowCreate(false); setTitle(""); setCriteria(""); setIssueUrl("");
    } catch (e) { setError(friendlyError(e)); }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session || !selected) return setError("Connect your hunter wallet first.");
    if (!isGithubPrUrl(prUrl) || !isCommitSha(headSha) || !githubLogin.trim()) return setError("Enter a valid GitHub PR URL, 40-character head SHA, and login.");
    await run(() => submitClaim(session, selected.id, prUrl, headSha, githubLogin, setProgress));
    setShowSubmit(false); setPrUrl(""); setHeadSha(""); setGithubLogin("");
  }

  const canOperate = Boolean(session && selected);
    return <main>
    <nav className="nav shell"><a href="#top" className="brand"><span className="brand-mark">BF</span><span>Bounty<span className="accent">Forge</span></span></a><div className="nav-links"><a href="#explore">Explore</a><a href="#how">How it works</a><a href="/admin">Protocol</a></div><WalletButton session={session} onConnect={connect} /></nav>

    <section className="hero shell" id="top"><div className="hero-copy"><p className="eyebrow"><span className="pulse" />OPEN-SOURCE WORK, SETTLED ON GENLAYER</p><h1>Ship code.<br /><em>Earn trust.</em></h1><p className="lede">BountyForge turns GitHub issues into credible, permissionless opportunities. Sponsors fund the work. Hunters ship the fix. GenLayer validators resolve the outcome.</p><div className="hero-actions"><a className="button primary" href="#explore">Find a bounty <span>↘</span></a><button className="button ghost" onClick={() => { if (!session) void connect(); setShowCreate(true); }}>Post a bounty <span>＋</span></button></div><div className="hero-trust"><span>Built for public repos</span><span>·</span><span>Comparative consensus</span><span>·</span><span>Non-custodial</span></div></div><div className="hero-card"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="hero-card-inner"><div className="card-top"><span>LIVE PROTOCOL</span><span className="live"><span className="pulse" />STUDIONET</span></div><div className="signal"><div className="signal-ring">✦</div><div><strong>Work with proof.</strong><p>Every claim is tied to a PR, commit, and wallet.</p></div></div><div className="mini-stats"><div><b>8</b><span>claims / bounty</span></div><div><b>0.001</b><span>GEN stake</span></div><div><b>24h</b><span>appeal window</span></div></div></div></div></section>

    {error && <div className="alert shell"><span>!</span>{error}<button onClick={() => setError("")}>×</button></div>}
    {progress.state !== "confirmed" && progress.label && <div className="progress shell"><span className="spinner" />{progress.label}{progress.hash && <small>{shorten(progress.hash)}</small>}</div>}

    <section className="workspace shell" id="explore"><div className="section-heading"><div><p className="eyebrow">THE MARKETPLACE</p><h2>Find work worth doing.</h2></div><button className="button primary small" onClick={() => { if (!session) void connect(); setShowCreate(true); }}>+ Post a bounty</button></div><div className="toolbar"><div className="filters">{["ALL", "OPEN", "AWARDED", "FINALIZED", "SETTLED"].map((item) => <button className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)}>{item === "ALL" ? "All bounties" : item.replaceAll("_", " ")}</button>)}</div><span className="muted">{loading ? "Refreshing…" : `${visible.length} opportunities`}</span></div><div className="bounty-grid">{!CONTRACT_READY ? <div className="empty-state"><div className="empty-icon">◌</div><h3>Protocol address required</h3><p>Configure <code>NEXT_PUBLIC_BOUNTYFORGE_ADDRESS</code> with the recorded StudioNet deployment to load live bounties.</p></div> : visible.length === 0 ? <div className="empty-state"><div className="empty-icon">✦</div><h3>No bounties here yet</h3><p>Be the first sponsor to turn a GitHub issue into an opportunity.</p></div> : visible.map((bounty) => <button className={`bounty-card ${selectedId === bounty.id ? "selected" : ""}`} key={bounty.id} onClick={() => void selectBounty(bounty.id)}><div className="card-line"><StatusPill status={bounty.status} /><span>{bounty.owner_repo} · #{bounty.issue_number}</span></div><h3>{bounty.title}</h3><p>{bounty.acceptance_criteria ?? "Acceptance criteria recorded onchain."}</p><div className="card-bottom"><span className="reward"><b>{formatGen(bounty.pot_atto)}</b> GEN <small>reward</small></span><span className="deadline">Due {dateLabel(bounty.deadline_unix)} <span>→</span></span></div></button>)}</div></section>

    {selected && <section className="detail shell"><div className="detail-main"><div className="detail-kicker"><button className="back" onClick={() => { setSelected(null); setSelectedId(""); }}>← All bounties</button><StatusPill status={selected.status} /></div><h2>{selected.title}</h2><p className="detail-repo"><a href={selected.issue_url} target="_blank" rel="noreferrer">github.com/{selected.owner_repo} #{selected.issue_number} ↗</a></p><div className="criteria"><p className="eyebrow">ACCEPTANCE CRITERIA</p><p>{selected.acceptance_criteria}</p></div><div className="claims-heading"><h3>Claims <span>{claims.length}</span></h3>{selected.accepting_claims && <button className="button primary small" onClick={() => { if (!session) void connect(); setShowSubmit(true); }}>Submit a claim</button>}</div><div className="claims-list">{claims.length === 0 ? <p className="muted">No claims yet. Be the first to ship.</p> : claims.map((claim) => <ClaimRow key={claim.index} claim={claim} selected={selected} session={session} run={run} onRefresh={() => void refresh(selected.id)} />)}</div></div><aside className="detail-side"><div className="reward-panel"><p className="eyebrow">BOUNTY REWARD</p><strong>{formatGen(selected.pot_atto)} <small>GEN</small></strong><p>{formatGen(selected.payout_preview_atto)} GEN after protocol fee</p><div className="side-rule" /><div className="side-row"><span>Deadline</span><b>{dateLabel(selected.deadline_unix)}</b></div><div className="side-row"><span>Claims left</span><b>{selected.claims_remaining} / 8</b></div><div className="side-row"><span>Appeal window</span><b>24h</b></div></div>{selected.sponsor === session?.address && <div className="owner-panel"><p className="eyebrow">SPONSOR CONTROLS</p>{selected.cancellable && <button className="text-button" onClick={() => void run(() => cancelBounty(session, selected.id, setProgress))}>Cancel and refund ↗</button>}{selected.expirable && <button className="text-button" onClick={() => void run(() => expireBounty(session, selected.id, setProgress))}>Expire and refund ↗</button>}{selected.finalizable && <button className="text-button" onClick={() => void run(() => finalizeBounty(session, selected.id, setProgress))}>Finalize award ↗</button>}{selected.payable && <button className="text-button" onClick={() => void run(() => claimPayout(session, selected.id, setProgress))}>Pay winning hunter ↗</button>}{selected.challenge_open && <button className="text-button danger" onClick={() => setShowChallenge(true)}>Challenge this award ↗</button>}</div>}</aside></section>}

    <section className="how shell" id="how"><div><p className="eyebrow">A BETTER WAY TO COLLABORATE</p><h2>Proof over promises.</h2><p className="lede">BountyForge makes the path from issue to incentive visible, verifiable, and fair to both sides.</p></div><div className="steps"><Step number="01" title="Sponsor" text="Attach a GitHub issue and fund the reward. The acceptance criteria become the onchain source of truth." /><Step number="02" title="Ship" text="Submit your PR, exact commit SHA, GitHub identity, and wallet marker with a 0.001 GEN stake." /><Step number="03" title="Resolve" text="Anyone can trigger validation. Comparative consensus decides the outcome, with appeals and challenge windows built in." /></div></section>

    {showCreate && <Modal title="Post a bounty" onClose={() => setShowCreate(false)}><form onSubmit={onCreate}><Field label="Bounty title"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fix the dark mode regression" required minLength={3} maxLength={120} /></Field><Field label="GitHub issue URL"><input value={issueUrl} onChange={(e) => setIssueUrl(e.target.value)} placeholder="https://github.com/org/repo/issues/42" required /><small className={issueUrl && !isGithubIssueUrl(issueUrl) ? "field-error" : "hint"}>Use a public GitHub issue URL.</small></Field><Field label="Acceptance criteria"><textarea value={criteria} onChange={(e) => setCriteria(e.target.value)} placeholder="Describe exactly what a valid fix must demonstrate…" required minLength={20} maxLength={2000} /></Field><div className="form-row"><Field label="Reward (GEN)"><input value={pot} onChange={(e) => setPot(e.target.value)} inputMode="decimal" required /></Field><Field label="Deadline (days)"><input value={deadline} onChange={(e) => setDeadline(e.target.value)} type="number" min="1" max="30" required /></Field></div><p className="form-note">Your reward is held by the contract until the winning hunter claims it. You will review the issue before signing.</p><button className="button primary full" type="submit">Fund bounty <span>→</span></button></form></Modal>}
    {showSubmit && selected && <Modal title="Submit your claim" onClose={() => setShowSubmit(false)}><form onSubmit={onSubmit}><div className="callout"><b>Before you submit</b><p>Add this exact line to your PR description, replacing the address with your connected wallet:</p><code>BountyForge-Wallet: {session?.address ?? "your wallet address"}</code></div><Field label="Pull request URL"><input value={prUrl} onChange={(e) => setPrUrl(e.target.value)} placeholder="https://github.com/org/repo/pull/123" required /><small className="hint">Must be in {selected.owner_repo}.</small></Field><Field label="PR head commit SHA"><input value={headSha} onChange={(e) => setHeadSha(e.target.value)} placeholder="40-character commit SHA" required /></Field><Field label="GitHub login"><input value={githubLogin} onChange={(e) => setGithubLogin(e.target.value)} placeholder="your-github-handle" required /></Field><p className="form-note">A 0.001 GEN anti-spam stake is refunded if accepted, overturned, or inconclusive. Rejected claims remain appealable for 24 hours.</p><button className="button primary full" type="submit">Stake 0.001 GEN and submit <span>→</span></button></form></Modal>}
    {showChallenge && selected && <Modal title="Challenge the award" onClose={() => setShowChallenge(false)}><form onSubmit={async (e) => { e.preventDefault(); if (session) await run(() => challengeClaim(session, selected.id, challengeStatement, setProgress)); setShowChallenge(false); }}><p className="modal-lede">This reruns the evidence review. If the award is upheld, your 0.001 GEN bond is returned. If overturned, the hunter is refunded and the bounty reopens.</p><Field label="Why is this award incorrect?"><textarea value={challengeStatement} onChange={(e) => setChallengeStatement(e.target.value)} minLength={10} maxLength={1000} placeholder="Point to a concrete gap in the submitted diff…" required /></Field><button className="button danger-button full" type="submit">Stake 0.001 GEN and challenge</button></form></Modal>}
    <footer className="footer shell"><div className="brand"><span className="brand-mark">BF</span><span>Bounty<span className="accent">Forge</span></span></div><span>Open-source work, with credible incentives.</span><a href="/admin">Protocol status ↗</a></footer>
  </main>;
}

function ClaimRow({ claim, selected, session, run, onRefresh }: { claim: ClaimView; selected: BountyView; session: WalletSession | null; run: (action: () => Promise<string>) => Promise<void>; onRefresh: () => void }) {
  const hunter = session?.address?.toLowerCase() === claim.hunter.toLowerCase();
  const sponsor = session?.address?.toLowerCase() === selected.sponsor.toLowerCase();
  return <div className="claim-row"><div className="claim-id"><div className="avatar">{claim.github_login.slice(0, 1).toUpperCase() || "?"}</div><div><b>{claim.github_login || shorten(claim.hunter)}</b><span><a href={claim.pr_url} target="_blank" rel="noreferrer">PR #{claim.pr_number} ↗</a> · {shorten(claim.pr_head_sha)}</span></div></div><div className="claim-outcome"><StatusPill status={claim.status} />{claim.reason && <p>{claim.reason}</p>}</div><div className="claim-actions">{claim.status === "PENDING" && <button className="text-button" onClick={() => void run(() => resolveClaim(session!, selected.id, claim.index, () => { }))}>Resolve ↗</button>}{hunter && claim.status === "REJECTED_PENDING_APPEAL" && <button className="text-button" onClick={() => void run(() => appealClaim(session!, selected.id, claim.index, () => { }))}>Appeal ↗</button>}{claim.status === "REJECTED_PENDING_APPEAL" && <button className="text-button" onClick={() => void run(() => releaseRejectedStake(session!, selected.id, claim.index, () => { }))}>Close appeal ↗</button>}{sponsor && selected.challenge_open && claim.status === "ACCEPTED" && <button className="text-button danger" onClick={() => void run(() => challengeClaim(session!, selected.id, "The awarded PR does not satisfy the bounty criteria.", () => { }))}>Challenge ↗</button>}{claim.status === "REJECTED_PENDING_APPEAL" && <button className="icon-button" onClick={onRefresh} aria-label="Refresh claim">↻</button>}</div></div>;
}

function Step({ number, title, text }: { number: string; title: string; text: string }) { return <div className="step"><span>{number}</span><div><h3>{title}</h3><p>{text}</p></div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div className="modal"><div className="modal-header"><h2>{title}</h2><button onClick={onClose} aria-label="Close">×</button></div>{children}</div></div>; }
