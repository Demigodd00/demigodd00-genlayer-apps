import Link from "next/link";
import { CONTRACT_READY } from "@/lib/contract";

export default function StreakPactLanding() {
  return (
    <>
      <header className="hero">
        <div className="hero-copy">
          <div className="hero-kicker"><span />StreakPact by demigodd00 · wallet-attested evidence</div>
          <h1>Put conviction<br />behind your goals.</h1>
          <p>Make a pact. Sign public evidence. Let GenLayer validators judge it.</p>
          <div className="hero-actions">
            <Link className="button button-primary button-large" href="/pacts/new">Create a pact <span>→</span></Link>
            <Link className="button button-ghost button-large" href="/join">Open an invite</Link>
          </div>
          <p className="environment-note"><span />{CONTRACT_READY ? "StudioNet · Test GEN has no monetary value." : "Preview · Test GEN has no monetary value · transactions unavailable."}</p>
        </div>
        <div className="hero-visual" aria-label="Example pact illustration">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <div className="commitment-card">
            <div className="commitment-top"><span className="live-dot" />EXAMPLE PACT <small>SP2</small></div>
            <p>READ ONE PAGE</p>
            <div className="hero-streak">{[1, 2, 3, 4, 5, 6, 7].map((day) => <span className={day <= 3 ? "done" : day === 4 ? "today" : ""} key={day}>{day <= 3 ? "✓" : day}</span>)}</div>
            <div className="commitment-meta"><div><small>TEST STAKE</small><strong>0.01 GEN</strong></div><div><small>PROGRESS</small><strong>3 / 7</strong></div></div>
          </div>
          <div className="validator-card validator-a"><span>✓</span><div><small>VALIDATOR VERDICT</small><strong>Criteria met</strong></div></div>
          <div className="validator-card validator-b"><span>◎</span><div><small>SETTLEMENT</small><strong>Appeal protected</strong></div></div>
        </div>
      </header>
      <section className="trust-strip" aria-label="Protocol protections">
        <div><strong>Clear rules</strong></div>
        <div><strong>Signed evidence</strong></div>
        <div><strong>Appeal history</strong></div>
      </section>
    </>
  );
}
