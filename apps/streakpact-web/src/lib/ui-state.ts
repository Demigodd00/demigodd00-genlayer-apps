import type { EthereumProvider, PactView, TxProgress } from "./contract";

export function transactionPending(progress: TxProgress | null): boolean {
  return progress !== null && ["awaiting-signature", "submitted", "finalizing"].includes(progress.state);
}

export function initialWorkspace(search: string): "dashboard" | "join" {
  const params = new URLSearchParams(search);
  if (params.get("view") === "dashboard") return "dashboard";
  return params.get("view") === "join" || params.has("pact") ? "join" : "dashboard";
}

export function pactShareUrl(origin: string, pactId: string, invite = false): string {
  const url = new URL("/", origin);
  url.searchParams.set("pact", pactId);
  url.searchParams.set("view", invite ? "join" : "dashboard");
  return url.toString();
}

type Page<T> = { total: string; items: T[] };

export async function readRecentPage<T>(read: (offset: number, count: number) => Promise<Page<T>>): Promise<T[]> {
  const first = await read(0, 25);
  const total = Number(first.total);
  const page = total > 25 ? await read(total - 25, 25) : first;
  return [...page.items].reverse();
}

export async function readAllPages<T>(read: (offset: number, count: number) => Promise<Page<T>>, maximum: number): Promise<T[]> {
  const items: T[] = [];
  while (items.length < maximum) {
    const page = await read(items.length, 25);
    const target = Math.min(Number(page.total), maximum);
    if (!Number.isSafeInteger(target) || target < 0) throw new Error("Invalid contract page count.");
    if (page.items.length === 0 && items.length < target) throw new Error("The contract returned an incomplete page. Refresh and try again.");
    items.push(...page.items);
    if (items.length >= target) return items.slice(0, target);
  }
  return items.slice(0, maximum);
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

export function pactTiming(pact: PactView, now: number) {
  const live = pact.status === "LIVE";
  const unjudged = Number(pact.next_period) < Number(pact.periods_total);
  return {
    window_open_now: live && unjudged && now >= Number(pact.next_window_open) && now < Number(pact.next_window_close),
    settleable: live && (!unjudged || now >= Number(pact.end_unix)),
    appeal_open: pact.status.startsWith("PROVISIONAL_") && now <= Number(pact.appeal_deadline_unix),
  };
}

export function formatCountdown(unix: string, now: number): string {
  const seconds = Math.max(0, Math.ceil(Number(unix) - now));
  if (seconds === 0) return "Now";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  return hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${hours}h ${Math.floor((seconds % 3600) / 60)}m`;
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
