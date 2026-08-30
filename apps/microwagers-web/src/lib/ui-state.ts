import type { EthereumProvider } from "./wallet";
import type { TxProgress } from "./contract";

export function transactionPending(progress: TxProgress | null): boolean {
  return progress !== null && ["awaiting-signature", "submitted", "finalizing"].includes(progress.state);
}

export function marketShareUrl(origin: string, wagerId: string): string {
  const url = new URL("/", origin);
  url.searchParams.set("wager", wagerId);
  return url.toString();
}

export function formatCountdown(unix: string, now: number): string {
  const seconds = Math.max(0, Math.ceil(Number(unix) - now));
  if (seconds === 0) return "Now";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  return hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${hours}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function watchWalletSession(provider: EthereumProvider | undefined, address: string | undefined, reset: () => void): () => void {
  if (!provider?.on || !address) return () => {};
  const accountsChanged = (...args: unknown[]) => {
    const accounts = args[0];
    if (!Array.isArray(accounts) || typeof accounts[0] !== "string" || accounts[0].toLowerCase() !== address.toLowerCase()) reset();
  };
  provider.on("accountsChanged", accountsChanged);
  provider.on("chainChanged", reset);
  provider.on("disconnect", reset);
  return () => {
    provider.removeListener?.("accountsChanged", accountsChanged);
    provider.removeListener?.("chainChanged", reset);
    provider.removeListener?.("disconnect", reset);
  };
}

const activeTransactions = new Set<string>();

export async function oneTransactionAtATime<T>(account: string, action: () => Promise<T>): Promise<T> {
  const key = account.toLowerCase();
  if (activeTransactions.has(key)) throw new Error("A transaction is already in progress. Wait for confirmation.");
  activeTransactions.add(key);
  try {
    return await action();
  } finally {
    activeTransactions.delete(key);
  }
}
