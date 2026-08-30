"use client";

import { useEffect, useState } from "react";
import { CONTRACT_READY, connectWallet, friendlyError, type WalletSession } from "@/lib/contract";
import { watchWalletSession } from "@/lib/ui-state";
import CreateMarket from "./CreateMarket";
import MarketBoard from "./MarketBoard";
import WalletButton from "./WalletButton";

type View = "markets" | "create" | "how";

export default function MicroWagersApp() {
  const [view, setView] = useState<View>("markets");
  const [session, setSession] = useState<WalletSession | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [walletError, setWalletError] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("create") === "1") setView("create");
  }, []);

  useEffect(() => watchWalletSession(window.ethereum, session?.address, () => {
    setSession(null);
    setWalletError("Wallet changed or disconnected. Reconnect to continue.");
  }), [session]);

  async function connect() {
    setConnecting(true);
    setWalletError("");
    try { setSession(await connectWallet()); }
    catch (reason) { setWalletError(friendlyError(reason)); }
    finally { setConnecting(false); }
  }

  function created() {
    setRefreshToken((value) => value + 1);
    setView("markets");
  }

  return (
    <main>
      <div className="site-shell">
        <nav className="topbar" aria-label="Primary navigation">
          <button className="brand brand-button" onClick={() => setView("markets")}><span className="brand-mark">M</span><span>MicroWagers<small>by demigodd00</small></span></button>
          <div className="topbar-links"><button onClick={() => setView("how")}>How it works</button><a href="/status">App status</a></div>
          <WalletButton session={session} connecting={connecting} onConnect={() => void connect()} />
        </nav>

        <div className="network-banner" role="note"><strong>StudioNet lab</strong><span>Test GEN has no monetary value</span><span>· public sources · 5m appeals</span></div>

        <header className="hero">
          <div className="hero-copy">
            <div className="hero-kicker"><span />Source-bound peer predictions</div>
            <h1>Make a call.<br />Name the source.</h1>
            <p>Two sides stake test GEN. GenLayer validators read the chosen source and settle the result.</p>
            <div className="hero-actions"><button className="button button-primary button-large" onClick={() => setView("create")}>Post a wager <span>→</span></button><button className="button button-secondary button-large" onClick={() => setView("markets")}>Browse markets</button></div>
            {!CONTRACT_READY ? <p className="environment-note">Preview mode · transactions unavailable</p> : null}
            {walletError ? <p className="form-error wallet-error" role="alert">{walletError}</p> : null}
          </div>
          <div className="hero-visual" aria-label="Example resolved prediction">
            <div className="orb orb-a" /><div className="orb orb-b" />
            <div className="example-card">
              <div className="example-top"><span>EXAMPLE WAGER</span><small>W-12</small></div>
              <p>DOES THE SOURCE SUPPORT SIDE A?</p>
              <div className="example-sides"><div className="example-win"><span>A</span><strong>YES</strong><small>creator</small></div><div><span>B</span><strong>NO</strong><small>taker</small></div></div>
              <div className="example-bottom"><span>VALIDATOR RESULT</span><strong>90% · SIDE A</strong></div>
            </div>
            <div className="float-card source-float"><small>PUBLIC SOURCE</small><strong>example.com ↗</strong></div>
            <div className="float-card appeal-float"><small>SETTLEMENT</small><strong>Appeal protected</strong></div>
          </div>
        </header>

        <section className="trust-strip" aria-label="Product boundaries"><div><strong>Exact source</strong></div><div><strong>Two fixed sides</strong></div><div><strong>Time to appeal</strong></div></section>

        <section className="workspace">
          <div className="workspace-tabs" role="tablist" aria-label="MicroWagers workspace">
            <button role="tab" aria-selected={view === "markets"} className={view === "markets" ? "active" : ""} onClick={() => setView("markets")}>Markets</button>
            <button role="tab" aria-selected={view === "create"} className={view === "create" ? "active" : ""} onClick={() => setView("create")}>Post a wager</button>
            <button role="tab" aria-selected={view === "how"} className={view === "how" ? "active" : ""} onClick={() => setView("how")}>How it works</button>
          </div>
          {view === "markets" ? <MarketBoard key={`${session?.address ?? "disconnected"}:${refreshToken}`} session={session} /> : null}
          {view === "create" ? <CreateMarket session={session} onCreated={created} /> : null}
          {view === "how" ? <HowItWorks /> : null}
        </section>
      </div>
      <footer><div className="site-shell footer-inner"><div className="brand"><span className="brand-mark">M</span><span>MicroWagers<small>by demigodd00 · StudioNet</small></span></div><p>© 2026 demigodd00. All rights reserved.</p><a href="/status">App status →</a></div></footer>
    </main>
  );
}

function HowItWorks() {
  return (
    <section className="how-section">
      <div className="how-heading"><p className="eyebrow">How it works</p><h2>Post. Match. Resolve.</h2><p>MicroWagers is a zero-value StudioNet lab for testing source-based validator judgment.</p></div>
      <div className="how-grid">
        <article><span>01</span><h3>Fix the question</h3><p>Choose two clear sides, a public HTTPS source, a deadline, and a test stake.</p></article>
        <article><span>02</span><h3>Match the stake</h3><p>Another wallet takes the other side with the same amount of valueless test GEN.</p></article>
        <article><span>03</span><h3>Resolve and appeal</h3><p>Validators read the source after the deadline. The losing participant gets one bonded appeal.</p></article>
      </div>
      <div className="boundary-grid">
        <div><p className="eyebrow">GenLayer decides</p><h3>Which side the source supports.</h3><p>Independent validators fetch the chosen page and compare a narrow outcome plus confidence bucket.</p></div>
        <div><p className="eyebrow">MicroWagers does not decide</p><h3>Whether the source itself is truthful.</h3><p>Use stable, authoritative public pages. A blocked or ambiguous source can void the wager and refund both sides.</p></div>
      </div>
    </section>
  );
}
