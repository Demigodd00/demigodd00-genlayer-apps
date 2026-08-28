"use client";

import { useEffect, useState } from "react";
import CreatePact from "@/components/CreatePact";
import Dashboard from "@/components/Dashboard";
import EvidenceFilePicker from "@/components/EvidenceFilePicker";
import JoinPact from "@/components/JoinPact";
import StudioNetBanner from "@/components/StudioNetBanner";
import WalletButton from "@/components/WalletButton";
import { initialWorkspace, watchWalletSession } from "@/lib/ui-state";
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
    setView(initialWorkspace(window.location.search));
  }, []);

  useEffect(() => {
    return watchWalletSession(window.ethereum, session?.address, () => {
      setSession(null);
      setWalletError("Wallet changed or disconnected. Reconnect to continue.");
    });
  }, [session]);

  async function connect() {
    setConnecting(true);
    setWalletError("");
    try {
      setSession(await connectWallet());
      setWalletError("");
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
            <a href="/admin">App status</a>
          </div>
          <WalletButton session={session} connecting={connecting} onConnect={() => void connect()} />
        </nav>
        <StudioNetBanner />

        <header className="hero">
          <div className="hero-copy">
            <div className="hero-kicker"><span />Goals, backed by proof</div>
            <h1>Put conviction<br />behind your goals.</h1>
            <p>Make a pact. Share proof. Let GenLayer verify it.</p>
            <div className="hero-actions">
              <button className="button button-primary button-large" onClick={() => setView("create")}>Create a pact <span>→</span></button>
              <button className="button button-ghost button-large" onClick={() => setView("join")}>Open an invite</button>
            </div>
            {!CONTRACT_READY ? <p className="environment-note"><span />Preview — transactions unavailable.</p> : null}
            {walletError ? <p className="form-error wallet-error" role="alert">{walletError}</p> : null}
          </div>
          <div className="hero-visual" aria-label="Example pact illustration">
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <div className="commitment-card">
              <div className="commitment-top"><span className="live-dot" />EXAMPLE PACT <small>SP2</small></div>
              <p>READ FOR 30 FOCUSED MINUTES</p>
              <div className="hero-streak">{[1, 2, 3, 4, 5, 6, 7].map((day) => <span className={day <= 3 ? "done" : day === 4 ? "today" : ""} key={day}>{day <= 3 ? "✓" : day}</span>)}</div>
              <div className="commitment-meta"><div><small>TEST STAKE</small><strong>0.01 GEN</strong></div><div><small>PROGRESS</small><strong>3 / 7</strong></div></div>
            </div>
            <div className="validator-card validator-a"><span>✓</span><div><small>VALIDATOR VERDICT</small><strong>Evidence verified</strong></div></div>
            <div className="validator-card validator-b"><span>◎</span><div><small>SETTLEMENT</small><strong>Appeal protected</strong></div></div>
          </div>
        </header>

        <section className="trust-strip" aria-label="Protocol protections">
          <div><strong>Clear rules</strong></div>
          <div><strong>Verified proof</strong></div>
          <div><strong>Time to appeal</strong></div>
        </section>

        <section className="workspace">
          <div className="workspace-tabs" role="tablist" aria-label="StreakPact workspace">
            <button role="tab" aria-selected={view === "dashboard"} className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>My pacts</button>
            <button role="tab" aria-selected={view === "create"} className={view === "create" ? "active" : ""} onClick={() => setView("create")}>Create</button>
            <button role="tab" aria-selected={view === "join"} className={view === "join" ? "active" : ""} onClick={() => setView("join")}>Join a challenge</button>
            <button role="tab" aria-selected={view === "how"} className={view === "how" ? "active" : ""} onClick={() => setView("how")}>How it works</button>
          </div>

          {view === "dashboard" ? <Dashboard key={session?.address ?? "disconnected"} session={session} refreshToken={refreshToken} /> : null}
          {view === "create" ? <CreatePact session={session} onCreated={() => completedAction("dashboard")} /> : null}
          {view === "join" ? <JoinPact session={session} onJoined={() => completedAction("dashboard")} /> : null}
          {view === "how" ? <HowItWorks /> : null}
        </section>
      </div>

      <footer>
        <div className="site-shell footer-inner"><div className="brand"><span className="brand-mark">S</span><span>StreakPact<small>by demigodd00 · StudioNet</small></span></div><p>© 2026 demigodd00. All rights reserved.</p><a href="/admin">App status →</a></div>
      </footer>
    </main>
  );
}

function HowItWorks() {
  const [preparedDigest, setPreparedDigest] = useState("");
  const [preparedUrl, setPreparedUrl] = useState("");

  return (
    <section className="protocol-section">
      <div className="protocol-heading"><p className="eyebrow">How it works</p><h2>Commit. Prove. Repeat.</h2></div>
      <div className="protocol-flow">
        <article><span>01</span><h3>Set your pact</h3><p>Choose a goal, rules, and test stake. Go solo or invite a challenger.</p></article>
        <article><span>02</span><h3>Submit proof</h3><p>Share proof each period for GenLayer to verify. Skipped periods count as misses.</p></article>
        <article><span>03</span><h3>Review and claim</h3><p>Appeal a result if needed. Test tokens unlock after the appeal window closes.</p></article>
      </div>
      <div className="protocol-evidence-lab">
        <div>
          <p className="eyebrow">Try it</p>
          <h3>Prepare your proof.</h3>
          <p>No wallet needed. This won’t submit a check-in.</p>
        </div>
        <div>
          <EvidenceFilePicker
            idPrefix="protocol-lab"
            onDigest={(nextDigest) => {
              setPreparedDigest(nextDigest);
              setPreparedUrl("");
            }}
            onPublished={(published) => {
              setPreparedDigest(published.digest);
              setPreparedUrl(published.url);
            }}
          />
          {preparedDigest ? (
            <details className="evidence-details">
              <summary>Proof details</summary>
              <dl className="prepared-evidence">
                <div><dt>SHA-256</dt><dd>{preparedDigest}</dd></div>
                <div><dt>Public URL</dt><dd>{preparedUrl || "Not published yet"}</dd></div>
              </dl>
            </details>
          ) : null}
        </div>
      </div>
    </section>
  );
}
