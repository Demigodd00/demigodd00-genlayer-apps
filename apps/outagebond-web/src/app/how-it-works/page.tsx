import Link from "next/link";

const steps = [
  ["01", "Provider commits coverage", "A provider registers a service, region, beneficiary, minimum outage duration, tolerance, payout, and claim capacity. The exact required collateral is locked in the contract."],
  ["02", "Beneficiary pins an incident", "The named beneficiary submits a completed outage of at most 24 hours and two reports on distinct public hosts. Each claim reserves every UTC day it touches. Both extracted intervals must also lie wholly inside coverage and span exactly those same days."],
  ["03", "Anyone calls attest()", "The leader and validators independently fetch both public pages and extract outage facts. A report over the byte limit, unavailable page, malformed extraction, wrong service, or wrong region cannot create an eligible result."],
  ["04", "Contract compares decisions", "The contract derives each source’s outcome from the extracted interval and minimum duration. Both sources must imply the same eligibility decision, and outage intervals must agree within the configured tolerance. Near-threshold disagreement is UNVERIFIABLE."],
  ["05", "Claimant collects", "An eligible claim reserves its payout for the beneficiary for 30 days. Ineligible or finally unverifiable claims release collateral immediately. Anyone can release an unresolved claim after its 24-hour attestation deadline, even if every consensus attempt failed. Deadline expiry is not proof of an outage."],
];

export default function HowItWorksPage() {
  return <section className="how-page"><p className="eyebrow">PROTOCOL GUIDE</p><h1>From incident report<br />to settled claim.</h1><p className="status-lede">The frontend submits exact terms and shows finalized contract state. GenLayer handles the evidence judgment and the resulting escrow transition.</p>
    <div className="how-steps">{steps.map(([number, title, copy]) => <article key={number}><span>{number}</span><div><h2>{title}</h2><p>{copy}</p></div></article>)}</div>
    <div className="terms-note"><strong>Evidence has limits</strong><span>Different report hosts help separate the sources, but do not prove common ownership or operational independence. Pages can change; OutageBond records their submitted URLs and consensus extraction, not a permanent archive of their original bytes. StudioNet GEN has no monetary value.</span></div>
    <Link className="button button-primary" href="/coverage/new">Create coverage ↗</Link>
  </section>;
}
