"use client";

import { useWallet } from "./WalletProvider";

function shortAddress(value: string): string { return `${value.slice(0, 6)}…${value.slice(-4)}`; }

export default function WalletButton() {
  const { session, connecting, choices, beginConnect, chooseWallet, closeWalletPicker } = useWallet();
  return <div className="wallet-control">
    <button className="wallet-button" type="button" onClick={() => void beginConnect()} disabled={connecting}>
      <span className={session ? "wallet-dot connected" : "wallet-dot"} />
      {connecting ? "Connecting…" : session ? `${session.walletName} · ${shortAddress(session.address)}` : "Connect wallet"}
    </button>
    {choices.length > 1 ? <div className="wallet-picker" role="dialog" aria-label="Choose a wallet">
      <div className="wallet-picker-heading"><strong>Choose wallet</strong><button type="button" onClick={closeWalletPicker} aria-label="Close">×</button></div>
      {choices.map((choice) => <button className="wallet-option" type="button" key={choice.id} onClick={() => void chooseWallet(choice)}>{choice.name}</button>)}
    </div> : null}
  </div>;
}
