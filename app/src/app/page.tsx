"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_CONTRACT,
  loadAddress,
  loadKey,
  makeClient,
  saveAddress,
  saveKey,
  generatePrivateKey,
} from "@/lib/contract";
import PactWizard from "@/components/PactWizard";
import DeployWizard from "@/components/DeployWizard";
import PactBrowser from "@/components/PactBrowser";
import Verifier from "@/components/Verifier";

type Tab = "pacts" | "new" | "deploy" | "verifier";

export default function Home() {
  const [tab, setTab] = useState<Tab>("pacts");
  const [pk, setPk] = useState("");
  const [addr, setAddr] = useState(DEFAULT_CONTRACT);
  const [addrInput, setAddrInput] = useState(DEFAULT_CONTRACT);
  const [account, setAccount] = useState("");
  const [keyErr, setKeyErr] = useState("");
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    const k = loadKey();
    const a = loadAddress();
    setPk(k);
    if (a) {
      setAddr(a);
      setAddrInput(a);
    }
  }, []);

  const applyKey = useCallback((k: string) => {
    setKeyErr("");
    try {
      const client = makeClient(k);
      const acct = (client as unknown as { account?: { address: string } }).account;
      setAccount(acct?.address ?? "");
    } catch {
      setKeyErr("invalid private key");
      setAccount("");
    }
  }, []);

  useEffect(() => {
    applyKey(pk);
  }, [pk, applyKey]);

  const onKeyChange = (k: string) => {
    setPk(k);
    saveKey(k);
  };

  const onGenerate = () => {
    const k = generatePrivateKey();
    onKeyChange(k);
  };

  const onAddrSave = () => {
    setAddr(addrInput.trim());
    saveAddress(addrInput.trim());
  };

  return (
    <div className="container">
      <h1>
        Streak<span className="accent">Pact</span>
      </h1>
      <div className="tagline">
        Staked accountability pacts — validators fetch your evidence, an AI jury votes KEPT or MISSED, the chain settles.
      </div>

      <div className="panel">
        <div className="row">
          <div>
            <label>Your private key (stays in your browser)</label>
            <input
              type="password"
              placeholder="0x… — paste or generate"
              value={pk}
              onChange={(e) => onKeyChange(e.target.value)}
            />
          </div>
          <div style={{ maxWidth: 140 }}>
            <label>&nbsp;</label>
            <button className="secondary" onClick={onGenerate} style={{ width: "100%" }}>
              Generate
            </button>
          </div>
        </div>
        {account && (
          <div className="note mono" style={{ marginTop: 8 }}>
            acting as {account}
          </div>
        )}
        {keyErr && <div className="status err">{keyErr}</div>}
        <label>Contract address</label>
        <div className="row">
          <input className="mono" value={addrInput} onChange={(e) => setAddrInput(e.target.value)} />
          <div style={{ maxWidth: 90 }}>
            <button className="secondary" onClick={onAddrSave} style={{ width: "100%" }}>
              Use
            </button>
          </div>
        </div>
        <div className="note">studionet (gasless) · default {DEFAULT_CONTRACT}</div>
      </div>

      <div className="tabs">
        {(
          [
            ["pacts", "Pacts"],
            ["new", "New pact"],
            ["deploy", "Deploy"],
            ["verifier", "Evidence verifier"],
          ] as Array<[Tab, string]>
        ).map(([id, label]) => (
          <button key={id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "pacts" && <PactBrowser pk={pk} addr={addr} />}
      {tab === "new" && <PactWizard pk={pk} addr={addr} />}
      {tab === "deploy" && <DeployWizard pk={pk} onDeployed={(a) => { setAddr(a); setAddrInput(a); saveAddress(a); }} />}
      {tab === "verifier" && <Verifier />}
    </div>
  );
}
