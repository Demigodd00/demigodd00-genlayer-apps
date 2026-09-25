"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { connectWallet, friendlyError, type WalletSession } from "@/lib/contract";
import { discoverWallets, type WalletOption } from "@/lib/wallet";

interface WalletContextValue {
  session: WalletSession | null;
  connecting: boolean;
  choices: WalletOption[];
  error: string;
  beginConnect(): Promise<void>;
  chooseWallet(choice: WalletOption): Promise<void>;
  closeWalletPicker(): void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<WalletSession | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [choices, setChoices] = useState<WalletOption[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const provider = session?.provider;
    if (!session || !provider?.on) return;
    const reset = () => { setSession(null); setError("Wallet changed or disconnected. Reconnect before continuing."); };
    const accountsChanged = (...args: unknown[]) => {
      const accounts = args[0];
      if (!Array.isArray(accounts) || String(accounts[0] ?? "").toLowerCase() !== session.address.toLowerCase()) reset();
    };
    provider.on("accountsChanged", accountsChanged);
    provider.on("chainChanged", reset);
    provider.on("disconnect", reset);
    return () => {
      provider.removeListener?.("accountsChanged", accountsChanged);
      provider.removeListener?.("chainChanged", reset);
      provider.removeListener?.("disconnect", reset);
    };
  }, [session]);

  async function activate(choice: WalletOption) {
    setConnecting(true);
    setChoices([]);
    setError("");
    try { setSession(await connectWallet(choice)); }
    catch (reason) { setError(friendlyError(reason)); }
    finally { setConnecting(false); }
  }

  async function beginConnect() {
    setConnecting(true);
    setChoices([]);
    setError("");
    try {
      const wallets = discoverWallets(window);
      if (!wallets.length) throw new Error("No compatible browser wallet was found. Install or enable a wallet extension, then retry.");
      if (wallets.length === 1) setSession(await connectWallet(wallets[0]));
      else setChoices(wallets);
    } catch (reason) { setError(friendlyError(reason)); }
    finally { setConnecting(false); }
  }

  return <WalletContext.Provider value={{
    session, connecting, choices, error, beginConnect, chooseWallet: activate,
    closeWalletPicker: () => setChoices([]),
  }}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used within WalletProvider.");
  return value;
}
