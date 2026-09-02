"use client";

import { useState } from "react";
import EvidenceFilePicker from "./EvidenceFilePicker";

export default function HowItWorks() {
  const [preparedDigest, setPreparedDigest] = useState("");
  const [preparedUrl, setPreparedUrl] = useState("");

  return (
    <section className="protocol-section">
      <div className="protocol-heading"><p className="eyebrow">How it works</p><h1>Commit. Submit. Repeat.</h1></div>
      <div className="protocol-flow">
        <article><span>01</span><h3>Set your pact</h3><p>Choose a goal, rules, and test stake. Go solo or invite a challenger.</p></article>
        <article><span>02</span><h3>Sign evidence</h3><p>The chosen wallet attests to the activity and exact public file.</p></article>
        <article><span>03</span><h3>Review and claim</h3><p>Validators judge it. Appeals keep both decisions onchain.</p></article>
      </div>
      <div className="protocol-evidence-lab">
        <div><p className="eyebrow">Try it</p><h3>Prepare evidence.</h3><p>No wallet needed. This won’t submit a check-in.</p></div>
        <div>
          <EvidenceFilePicker
            idPrefix="protocol-lab"
            onDigest={(nextDigest) => { setPreparedDigest(nextDigest); setPreparedUrl(""); }}
            onPublished={(published) => { setPreparedDigest(published.digest); setPreparedUrl(published.url); }}
          />
          {preparedDigest ? (
            <details className="evidence-details">
              <summary>Evidence details</summary>
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
