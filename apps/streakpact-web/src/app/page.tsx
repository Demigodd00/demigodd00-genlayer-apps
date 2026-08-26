"use client";

import { useEffect, useState } from "react";
import CreatePact from "@/components/CreatePact";
import Dashboard from "@/components/Dashboard";
import EvidenceFilePicker from "@/components/EvidenceFilePicker";
import JoinPact from "@/components/JoinPact";
import StudioNetBanner from "@/components/StudioNetBanner";
import WalletButton from "@/components/WalletButton";
import {
  CONTRACT_READY,
  connectWallet,
  friendlyError,
  type WalletSession,
} from "@/lib/contract";

type View = "dashboard" | "create" | "join" | "how";

export default function Home() {
  const [view, setView] = useState<View>("dashboard");
  const [session, setSession] = useState<WalletSession | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [walletError, setWalletError] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("view") === "join" || params.get("pact")) setView("join");
  }, []);

  useEffect(() => {
    const provider = window.ethereum;
    if (!provider?.on) return;
    const handleAccounts = (...args: unknown[]) => {
      const accounts = args[0] as string[] | undefined;
      if (!accounts?.[0] || accounts[0].toLowerCase() !== session?.address.toLowerCase()) {
        setSession(null);
      }
    };
    provider.on("accountsChanged", handleAccounts);
    return () => provider.removeListener?.("accountsChanged", handleAccounts);
  }, [session]);

  async function connect() {
    setConnecting(true);
    setWalletError("");
    try {
      setSession(await connectWallet());
    } catch (error) {
      setWalletError(friendlyError(error));
    } finally {
      setConnecting(false);
    }
  }

  function completedAction(nextView: View = "dashboard") {
    setRefreshToken((token) => token + 1);
    setView(nextView);
  }

  return (
    <main>
      <div className="site-shell">
        <nav className="topbar" aria-label="Primary navigation">
          <button className="brand brand-button" onClick={() => setView("dashboard")}>
            <span className="brand-mark">S</span>
            <span>StreakPact<small>by demigodd00</small></span>
          </button>
          <div className="topbar-links">
            <button className={view === "how" ? "active" : ""} onClick={() => setView("how")}>How it works</button>
            <a href="/admin">Operations</a>
          </div>
          <WalletButton session={session} connecting={connecting} onConnect={() => void connect()} />
        </nav>
        <StudioNetBanner />

        <header className="hero">
          <div className="hero-copy">
            <div className="hero-kicker"><span />Built for commitments that need real proof</div>
            <h1>Put conviction<br />behind your goals.</h1>
            <p>Stake on a clear commitment. Submit immutable evidence. Let independent GenLayer validators reach a transparent, appealable result.</p>
            <div className="hero-actions">
              <button className="button button-primary button-large" onClick={() => setView("create")}>Create a pact <span>→</span></button>
              <button className="button button-ghost button-large" onClick={() => setView("join")}>Open an invite</button>
            </div>
            {!CONTRACT_READY ? <p className="environment-note"><span />Safe preview mode — V2 deployment intentionally not configured</p> : null}
            {walletError ? <p className="form-error wallet-error" role="alert">{walletError}</p> : null}
          </div>
          <div className="hero-visual" aria-label="Illustration of a verified seven-period streak">
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <div className="commitment-card">
              <div className="commitment-top"><span className="live-dot" />LIVE PACT <small>SP2</small></div>
              <p>READ FOR 30 FOCUSED MINUTES</p>
              <div className="hero-streak">{[1, 2, 3, 4, 5, 6, 7].map((day) => <span className={day <= 3 ? "done" : day === 4 ? "today" : ""} key={day}>{day <= 3 ? "✓" : day}</span>)}</div>
              <div className="commitment-meta"><div><small>TEST ESCROW</small><strong>0.01 GEN</strong></div><div><small>NEXT WINDOW</small><strong>18h 42m</strong></div></div>
            </div>
            <div className="validator-card validator-a"><span>✓</span><div><small>VALIDATOR VERDICT</small><strong>Evidence verified</strong></div></div>
            <div className="validator-card validator-b"><span>◎</span><div><small>SETTLEMENT</small><strong>Appeal protected</strong></div></div>
          </div>
        </header>

        <section className="trust-strip" aria-label="Protocol protections">
          <div><strong>Every period counted</strong><span>Skipped windows become deterministic misses</span></div>
          <div><strong>Immutable evidence</strong><span>Digest verified by leader and validators</span></div>
          <div><strong>Payout lock</strong><span>Nothing moves before the appeal window closes</span></div>
        </section>

        <section className="workspace">
          <div className="workspace-tabs" role="tablist" aria-label="StreakPact workspace">
            <button role="tab" aria-selected={view === "dashboard"} className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>My pacts</button>
            <button role="tab" aria-selected={view === "create"} className={view === "create" ? "active" : ""} onClick={() => setView("create")}>Create</button>
            <button role="tab" aria-selected={view === "join"} className={view === "join" ? "active" : ""} onClick={() => setView("join")}>Join a challenge</button>
            <button role="tab" aria-selected={view === "how"} className={view === "how" ? "active" : ""} onClick={() => setView("how")}>Protocol</button>
          </div>

          {view === "dashboard" ? <Dashboard session={session} refreshToken={refreshToken} /> : null}
          {view === "create" ? <CreatePact session={session} onCreated={() => completedAction("dashboard")} /> : null}
          {view === "join" ? <JoinPact session={session} onJoined={() => completedAction("dashboard")} /> : null}
          {view === "how" ? <HowItWorks /> : null}
        </section>
      </div>

      <footer>
        <div className="site-shell footer-inner"><div className="brand"><span className="brand-mark">S</span><span>StreakPact<small>by demigodd00 · StudioNet V2</small></span></div><p>© 2026 demigodd00. All rights reserved.<br />GenLayer adjudicates evidence. Deterministic contract logic controls test-token settlement.</p><a href="/admin">Protocol operations →</a></div>
      </footer>
    </main>
  );
}

function HowItWorks() {
  const [preparedDigest, setPreparedDigest] = useState("");
  const [preparedUrl, setPreparedUrl] = useState("");

  return (
    <section className="protocol-section">
      <div className="protocol-heading"><p className="eyebrow">The execution model</p><h2>AI judges the evidence.<br />Code controls settlement.</h2><p>The consensus surface stays narrow so the product remains understandable and auditable.</p></div>
      <div className="protocol-flow">
        <article><span>01</span><h3>Write exact rules</h3><p>Choose a template, schedule, allowed misses, evidence standard, and payout path.</p></article>
        <article><span>02</span><h3>Fund test escrow</h3><p>Use StudioNet test GEN for self-stake or invite a challenger to match the amount.</p></article>
        <article><span>03</span><h3>Prove each period</h3><p>Submit content-addressed evidence whose digest validators independently verify.</p></article>
        <article><span>04</span><h3>Reach consensus</h3><p>Validators agree on verdict, digest, and a bounded confidence bucket.</p></article>
        <article><span>05</span><h3>Review and appeal</h3><p>The result remains provisional while an adversely affected participant can challenge a period.</p></article>
        <article><span>06</span><h3>Settle transparently</h3><p>After the appeal deadline, deterministic logic finalizes the recipient and unlocks the claim.</p></article>
      </div>
      <div className="protocol-evidence-lab">
        <div>
          <p className="eyebrow">Try the evidence path</p>
          <h3>Prepare the exact file before a deadline.</h3>
          <p>Hash a non-sensitive JSON or text record locally. If the owner has enabled public IPFS publishing, one click fills the approved URL and matching digest.</p>
        </div>
        <div>
          <EvidenceFilePicker
            idPrefix="protocol-lab"
            onDigest={setPreparedDigest}
            onPublished={(published) => {
              setPreparedDigest(published.digest);
              setPreparedUrl(published.url);
            }}
          />
          {preparedDigest ? (
            <dl className="prepared-evidence">
              <div><dt>SHA-256</dt><dd>{preparedDigest}</dd></div>
              <div><dt>Public URL</dt><dd>{preparedUrl || "Hash ready — publish here or use an approved external IPFS/Arweave service."}</dd></div>
            </dl>
          ) : null}
        </div>
      </div>
      <div className="boundary-card"><div><p className="eyebrow">Frontend owns</p><p>Wallet connection, templates, reminders, indexing, transaction feedback, and evidence preparation.</p></div><div><p className="eyebrow">GenLayer owns</p><p>Evidence adjudication, validator comparison, period accounting, escrow states, appeals, and payouts.</p></div><div><p className="eyebrow">External sources own</p><p>Raw records. They are accepted only as immutable artifacts with a matching digest.</p></div></div>
    </section>
  );
}
