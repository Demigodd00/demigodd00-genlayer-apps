import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "../src/app/page";
import CreatePact from "../src/components/CreatePact";
import JoinPact from "../src/components/JoinPact";
import EvidenceFilePicker from "../src/components/EvidenceFilePicker";
import TxNotice from "../src/components/TxNotice";

test("the home screen identifies the demo, creator, and illustrative pact", () => {
  const html = renderToStaticMarkup(createElement(Home));
  assert.match(html, /by demigodd00/);
  assert.match(html, /Test GEN has no monetary value/);
  assert.match(html, /EXAMPLE PACT/);
  assert.doesNotMatch(html, /LIVE PACT|18h 42m/);
});

test("the shorter create form preserves stake and failure-recipient disclosures", () => {
  const html = renderToStaticMarkup(createElement(CreatePact, {
    session: null,
    onCreated: () => {},
  }));
  assert.match(html, /Test stake in GEN/);
  assert.match(html, /Receives your test stake if you lose\./);
  assert.match(html, /Success criteria/);
  assert.match(html, /Allowed misses/);
});

test("the invitation still discloses the matched test stake and fixed rules", () => {
  const html = renderToStaticMarkup(createElement(JoinPact, {
    session: null,
    onJoined: () => {},
  }));
  assert.match(html, /Match the test stake\. The rules are fixed\./);
});

test("the upload privacy warning stays visible before file selection", () => {
  const html = renderToStaticMarkup(createElement(EvidenceFilePicker, {
    idPrefix: "test",
    onDigest: () => {},
    onPublished: () => {},
  }));
  assert.match(html, /100 KB max/);
  assert.match(html, /Proof is public—don’t upload private information\./);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Publish proof<\/button>/);
  assert.doesNotMatch(html, /<details/);
});

test("transaction status remains visible while the hash is collapsed", () => {
  const hash = `0x${"a".repeat(64)}`;
  const html = renderToStaticMarkup(createElement(TxNotice, {
    progress: { state: "confirmed", label: "Confirmed", hash },
  }));
  assert.match(html, /role="status"/);
  assert.match(html, /<strong>Confirmed<\/strong>/);
  assert.match(html, /<summary>Transaction hash<\/summary>/);
  assert.ok(html.includes(hash));
  assert.doesNotMatch(html, /<details[^>]*\bopen/);
});
