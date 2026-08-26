import { chains, createClient } from "genlayer-js";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";

export type Address = `0x${string}`;
export type ProgressState = "awaiting-signature" | "submitted" | "finalizing" | "confirmed" | "failed";
export type TxProgress = { state: ProgressState; label: string; hash?: string };
export type ProgressHandler = (progress: TxProgress) => void;

export interface EthereumProvider {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
}

declare global { interface Window { ethereum?: EthereumProvider; } }

export interface WalletSession { address: Address; client: ReturnType<typeof createClient>; }

export interface BountySummary {
  id: string; title: string; owner_repo: string; issue_number: string; issue_url: string;
  acceptance_criteria?: string;
  pot_atto: string; payout_preview_atto: string; deadline_unix: string; status: string;
  claim_count: string; accepting_claims: boolean; has_accepted_claim: boolean;
  has_open_appeal: boolean; challenge_open: boolean; finalizable: boolean; payable: boolean;
}

export interface BountyView extends BountySummary {
  sponsor: string; acceptance_criteria: string; created_at_iso: string; claims_remaining: string;
  fee_atto: string; awarded_at_unix: string; challenge_deadline_unix: string;
  challenged: boolean; open_appeal_claim_index: string; cancellable: boolean; expirable: boolean;
}

export interface ClaimView {
  index: string; bounty_id: string; hunter: string; pr_url: string; pr_number: string;
  pr_head_sha: string; github_login: string; source_digest: string; status: string;
  verdict: string; confidence_bucket: string; reason: string; stake_atto: string;
  created_at_iso: string; rejection_deadline_unix: string; stake_released: boolean; appeal_count: string;
}

export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_BOUNTYFORGE_ADDRESS ?? "";
export const NETWORK_NAME = process.env.NEXT_PUBLIC_NETWORK_NAME ?? "StudioNet";
export const CONTRACT_READY = /^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS) && !/^0x0+$/.test(CONTRACT_ADDRESS);
const readClient = createClient({ chain: chains.studionet });
const STAKE_ATTO = 1_000_000_000_000_000n;

function contractAddress(): Address {
  if (!CONTRACT_READY) throw new Error("BountyForge has not been configured for this environment yet.");
  return CONTRACT_ADDRESS as Address;
}

function record(value: unknown): Record<string, unknown> { return value as Record<string, unknown>; }

export function isAddress(value: string): value is Address { return /^0x[0-9a-fA-F]{40}$/.test(value); }
export function isGithubIssueUrl(value: string): boolean { return /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/issues\/\d+$/.test(value.trim()); }
export function isGithubPrUrl(value: string): boolean { return /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+$/.test(value.trim()); }
export function isCommitSha(value: string): boolean { return /^[0-9a-fA-F]{40}$/.test(value.trim()); }
export function shorten(value: string): string { return value.length > 14 ? `${value.slice(0, 7)}…${value.slice(-5)}` : value; }

export function parseGen(value: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{0,18})?$/.test(trimmed)) throw new Error("Enter a valid GEN amount with at most 18 decimal places.");
  const [whole, fraction = ""] = trimmed.split(".");
  return BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0"));
}

export function formatGen(value: string | bigint, precision = 4): string {
  const atto = typeof value === "bigint" ? value : BigInt(value || "0");
  const whole = atto / 10n ** 18n;
  const fraction = (atto % 10n ** 18n).toString().padStart(18, "0").slice(0, precision).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function formatDuration(seconds: string | number): string {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value % 86400 === 0) return `${value / 86400}d`;
  if (value % 3600 === 0) return `${value / 3600}h`;
  if (value % 60 === 0) return `${value / 60}m`;
  return `${value}s`;
}

export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const expected = message.match(/\[EXPECTED\]\s*([^"\n]+)/);
  if (expected?.[1]) return expected[1].trim();
  if (/rejected|denied|cancelled/i.test(message)) return "The wallet request was cancelled.";
  if (/timeout|timed out/i.test(message)) return "Confirmation is taking longer than expected. Check the transaction before retrying.";
  return message.length > 240 ? `${message.slice(0, 237)}…` : message;
}

export async function connectWallet(): Promise<WalletSession> {
  const provider = window.ethereum;
  if (!provider) throw new Error("Install a compatible browser wallet to continue.");
  const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
  const address = accounts[0];
  if (!address || !isAddress(address)) throw new Error("The wallet returned an invalid account.");
  const client = createClient({ chain: chains.studionet, account: address, provider: provider as never });
  await client.connect("studionet");
  return { address, client };
}

async function waitForSuccess(hash: unknown, onProgress: ProgressHandler): Promise<void> {
  const txHash = String(hash);
  onProgress({ state: "finalizing", label: "GenLayer validators are finalizing this transaction", hash: txHash });
  const receipt = await readClient.waitForTransactionReceipt({ hash: hash as never, status: TransactionStatus.FINALIZED, retries: 120 });
  if (receipt.txExecutionResultName !== ExecutionResult.FINISHED_WITH_RETURN) {
    const data = record(receipt);
    throw new Error(String(data.error ?? data.txExecutionResultName ?? "Contract execution failed"));
  }
  onProgress({ state: "confirmed", label: "Confirmed by GenLayer validators", hash: txHash });
}

async function write(session: WalletSession, functionName: string, args: unknown[], value: bigint, onProgress: ProgressHandler): Promise<string> {
  onProgress({ state: "awaiting-signature", label: "Confirm this transaction in your wallet" });
  try {
    const hash = await session.client.writeContract({ address: contractAddress(), functionName, args: args as never[], value });
    const txHash = String(hash);
    onProgress({ state: "submitted", label: "Transaction submitted", hash: txHash });
    await waitForSuccess(hash, onProgress);
    return txHash;
  } catch (error) {
    onProgress({ state: "failed", label: friendlyError(error) });
    throw error;
  }
}

export async function listBounties(): Promise<BountySummary[]> {
  const result = await readClient.readContract({ address: contractAddress(), functionName: "list_bounties", args: [0, 25] }) as unknown as { items: BountySummary[] };
  return result.items;
}
export async function getBounty(id: string): Promise<BountyView> {
  return await readClient.readContract({ address: contractAddress(), functionName: "get_bounty", args: [id] }) as unknown as BountyView;
}
export async function listClaims(id: string): Promise<ClaimView[]> {
  const result = await readClient.readContract({ address: contractAddress(), functionName: "list_claims", args: [id, 0, 25] }) as unknown as { items: ClaimView[] };
  return result.items;
}
export async function listSponsorBounties(address: Address): Promise<BountySummary[]> {
  const result = await readClient.readContract({ address: contractAddress(), functionName: "list_sponsor_bounties", args: [address, 0, 25] }) as unknown as { items: BountySummary[] };
  return result.items;
}
export async function listHunterClaims(address: Address): Promise<ClaimView[]> {
  const result = await readClient.readContract({ address: contractAddress(), functionName: "list_hunter_claims", args: [address, 0, 25] }) as unknown as { items: ClaimView[] };
  return result.items;
}
export async function getAdminData(): Promise<{ config: Record<string, string>; stats: Record<string, string> }> {
  const [config, stats] = await Promise.all([
    readClient.readContract({ address: contractAddress(), functionName: "get_config", args: [] }),
    readClient.readContract({ address: contractAddress(), functionName: "get_stats", args: [] }),
  ]);
  return { config: config as Record<string, string>, stats: stats as Record<string, string> };
}

export const createBounty = (s: WalletSession, i: { title: string; criteria: string; issueUrl: string; deadlineUnix: number; potAtto: bigint }, p: ProgressHandler) => write(s, "create_bounty", [i.title, i.criteria, i.issueUrl, i.deadlineUnix], i.potAtto, p);
export const submitClaim = (s: WalletSession, id: string, prUrl: string, sha: string, login: string, p: ProgressHandler) => write(s, "submit_claim", [id, prUrl, sha, login], STAKE_ATTO, p);
export const resolveClaim = (s: WalletSession, id: string, index: string, p: ProgressHandler) => write(s, "resolve_claim", [id, Number(index)], 0n, p);
export const appealClaim = (s: WalletSession, id: string, index: string, p: ProgressHandler) => write(s, "appeal_claim", [id, Number(index)], 0n, p);
export const releaseRejectedStake = (s: WalletSession, id: string, index: string, p: ProgressHandler) => write(s, "release_rejected_stake", [id, Number(index)], 0n, p);
export const challengeClaim = (s: WalletSession, id: string, statement: string, p: ProgressHandler) => write(s, "challenge_claim", [id, statement], STAKE_ATTO, p);
export const finalizeBounty = (s: WalletSession, id: string, p: ProgressHandler) => write(s, "finalize_bounty", [id], 0n, p);
export const claimPayout = (s: WalletSession, id: string, p: ProgressHandler) => write(s, "claim_payout", [id], 0n, p);
export const cancelBounty = (s: WalletSession, id: string, p: ProgressHandler) => write(s, "cancel_bounty", [id], 0n, p);
export const expireBounty = (s: WalletSession, id: string, p: ProgressHandler) => write(s, "expire_bounty", [id], 0n, p);
