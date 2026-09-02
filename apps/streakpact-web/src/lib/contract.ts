import { chains, createClient } from "genlayer-js";
import { TransactionStatus } from "genlayer-js/types";
import { oneTransactionAtATime, readAllPages, readRecentPage } from "./ui-state";
import { assertSuccessfulExecution } from "./receipt";
import { connectStudioWallet, type EthereumProvider, type WalletOption } from "./wallet";

export type { EthereumProvider } from "./wallet";

export type Address = `0x${string}`;

export interface WalletSession {
  address: Address;
  client: ReturnType<typeof createClient>;
  provider: EthereumProvider;
  walletName: string;
}

export interface PactSummary {
  id: string;
  mode: "SELF" | "CHALLENGE";
  status: string;
  title: string;
  periods_total: string;
  kept_count: string;
  miss_count: string;
  stake_atto: string;
  start_unix: string;
  end_unix: string;
}

export interface PactView extends PactSummary {
  maker: string;
  taker: string;
  failure_recipient: string;
  evidence_attestor: string;
  provenance_policy: "SELF_ATTESTED" | "WALLET_VERIFIED";
  success_criteria: string;
  allowed_misses: string;
  pot_atto: string;
  created_at_iso: string;
  next_period: string;
  next_window_open: string;
  next_window_close: string;
  window_open_now: boolean;
  settleable: boolean;
  appeal_deadline_unix: string;
  appeal_open: boolean;
}

export interface AdjudicationRecord {
  verdict: "KEPT" | "MISSED";
  method: string;
  statement: string;
  evidence_url: string;
  content_digest: string;
  confidence_bucket: string;
  reason: string;
  judged_at_iso: string;
  attestor: string;
  observed_at_iso: string;
  attestation_id: string;
  provenance: string;
}

export interface CheckinView {
  period: string;
  verdict: "KEPT" | "MISSED";
  method: string;
  statement: string;
  evidence_url: string;
  content_digest: string;
  confidence_bucket: string;
  reason: string;
  judged_at_iso: string;
  subject: string;
  configured_attestor: string;
  attestor: string;
  observed_at_iso: string;
  attestation_id: string;
  attestation_schema: string;
  provenance: string;
  appealed: boolean;
  original_record: AdjudicationRecord;
  appeal_record: Partial<AdjudicationRecord>;
}

export interface TxProgress {
  state: "awaiting-signature" | "submitted" | "finalizing" | "confirmed" | "failed";
  label: string;
  hash?: string;
}

export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_STREAKPACT_V2_ADDRESS ?? "";
export const NETWORK_NAME = process.env.NEXT_PUBLIC_NETWORK_NAME ?? "StudioNet";
export const CONTRACT_READY = /^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS)
  && !/^0x0{40}$/i.test(CONTRACT_ADDRESS);
export const CONTRACT_EXPLORER_URL = CONTRACT_READY
  ? `https://explorer-studio.genlayer.com/address/${CONTRACT_ADDRESS}`
  : "https://explorer-studio.genlayer.com";

const EVIDENCE_PREFIXES = [
  "https://ipfs.io/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
  "https://arweave.net/",
] as const;
const MAX_EVIDENCE_BYTES = 100_000;

const readClient = createClient({ chain: chains.studionet });

function contractAddress(): Address {
  if (!CONTRACT_READY) {
    throw new Error("StreakPact V2 has not been configured for this environment.");
  }
  return CONTRACT_ADDRESS as Address;
}

export function isAddress(value: string): value is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

export function isEvidenceUrl(value: string): boolean {
  const trimmed = value.trim();
  return EVIDENCE_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

export function isSha256(value: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(value.trim());
}

export async function hashEvidenceFile(file: File): Promise<string> {
  if (file.size === 0) throw new Error("Choose a non-empty evidence file.");
  if (file.size > MAX_EVIDENCE_BYTES) {
    throw new Error("Evidence must be 100 KB or smaller so validators can fetch it safely.");
  }
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function formatDuration(totalSeconds: string | number): string {
  const seconds = Number(totalSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return "not configured";
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

export function shortenAddress(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

export function parseGen(value: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{0,18})?$/.test(trimmed)) {
    throw new Error("Enter a valid GEN amount with at most 18 decimal places.");
  }
  const [whole, fraction = ""] = trimmed.split(".");
  return BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0"));
}

export function formatGen(attoValue: string | bigint, precision = 4): string {
  const atto = typeof attoValue === "bigint" ? attoValue : BigInt(attoValue || "0");
  const whole = atto / 10n ** 18n;
  const fraction = (atto % 10n ** 18n).toString().padStart(18, "0").slice(0, precision);
  const cleaned = fraction.replace(/0+$/, "");
  return cleaned ? `${whole}.${cleaned}` : whole.toString();
}

export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const expected = message.match(/\[EXPECTED\]\s*([^"\n]+)/);
  if (expected?.[1]) return expected[1].trim();
  if (/rejected|denied|cancelled/i.test(message)) return "The wallet request was cancelled.";
  if (/wrong chain|configured for chain/i.test(message)) {
    return `Switch your wallet to ${NETWORK_NAME} and try again.`;
  }
  if (/failed to fetch|fetch failed|network error|econn|socket hang up|service unavailable|\b(?:502|503|504)\b/i.test(message)) {
    return "StudioNet is temporarily unreachable. If you just submitted a transaction, check your wallet activity before retrying, then refresh.";
  }
  if (/timeout|timed out/i.test(message)) {
    return "Confirmation is taking longer than expected. Check the transaction before retrying.";
  }
  return message.length > 220 ? `${message.slice(0, 217)}…` : message;
}

export function isTransientReadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch|fetch failed|network error|timeout|timed out|econn|socket hang up|service unavailable|\b(?:502|503|504)\b/i.test(message);
}

const readRetryDelays = [300, 900] as const;

export async function withReadRetry<T>(
  operation: () => Promise<T>,
  wait: (delayMs: number) => Promise<void> = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransientReadError(error) || attempt >= readRetryDelays.length) throw error;
      await wait(readRetryDelays[attempt]);
    }
  }
}

export async function connectWallet(wallet: WalletOption): Promise<WalletSession> {
  const address = await connectStudioWallet(wallet.provider);
  const client = createClient({
    chain: chains.studionet,
    account: address,
    provider: wallet.provider as never,
  });
  return { address, client, provider: wallet.provider, walletName: wallet.name };
}

async function waitForSuccess(
  hash: unknown,
  onProgress: (progress: TxProgress) => void,
): Promise<void> {
  const txHash = String(hash);
  onProgress({ state: "finalizing", label: "Validators are finalizing the transaction", hash: txHash });
  const receipt = await readClient.waitForTransactionReceipt({
    hash: hash as never,
    status: TransactionStatus.FINALIZED,
    retries: 120,
  });
  assertSuccessfulExecution(receipt);
  onProgress({ state: "confirmed", label: "Confirmed by GenLayer validators", hash: txHash });
}

async function write(
  session: WalletSession,
  functionName: string,
  args: unknown[],
  value: bigint,
  onProgress: (progress: TxProgress) => void,
): Promise<string> {
  return oneTransactionAtATime(session.address, async () => {
    let txHash: string | undefined;
    onProgress({ state: "awaiting-signature", label: "Confirm this transaction in your wallet" });
    try {
      const hash = await session.client.writeContract({
        address: contractAddress(),
        functionName,
        args: args as never[],
        value,
      });
      txHash = String(hash);
      onProgress({ state: "submitted", label: "Transaction submitted", hash: txHash });
      await waitForSuccess(hash, onProgress);
      return txHash;
    } catch (error) {
      onProgress({ state: "failed", label: friendlyError(error), hash: txHash });
      throw error;
    }
  });
}

export async function listUserPacts(user: Address): Promise<PactSummary[]> {
  return readRecentPage(async (offset, count) => (
    await withReadRetry(() => readClient.readContract({
      address: contractAddress(),
      functionName: "list_user_pacts",
      args: [user, offset, count],
    }))
  ) as unknown as { total: string; items: PactSummary[] });
}

export async function listPacts(): Promise<PactSummary[]> {
  const result = (await withReadRetry(() => readClient.readContract({
    address: contractAddress(),
    functionName: "list_pacts",
    args: [0, 25],
  }))) as unknown as { items: PactSummary[] };
  return result.items;
}

export async function getPact(pactId: string): Promise<PactView> {
  return (await withReadRetry(() => readClient.readContract({
    address: contractAddress(),
    functionName: "get_pact",
    args: [pactId],
  }))) as unknown as PactView;
}

export async function listCheckins(pactId: string): Promise<CheckinView[]> {
  return readAllPages(async (offset, count) => (
    await withReadRetry(() => readClient.readContract({
      address: contractAddress(),
      functionName: "list_checkins",
      args: [pactId, offset, count],
    }))
  ) as unknown as { total: string; items: CheckinView[] }, 60);
}

export async function getAdminData(): Promise<{
  config: Record<string, string>;
  stats: Record<string, string>;
}> {
  const [config, stats] = await Promise.all([
    withReadRetry(() => readClient.readContract({ address: contractAddress(), functionName: "get_config", args: [] })),
    withReadRetry(() => readClient.readContract({ address: contractAddress(), functionName: "get_stats", args: [] })),
  ]);
  return { config: config as Record<string, string>, stats: stats as Record<string, string> };
}

export function createPact(
  session: WalletSession,
  input: {
    mode: "SELF" | "CHALLENGE";
    title: string;
    criteria: string;
    periods: number;
    allowedMisses: number;
    startUnix: number;
    failureRecipient: Address;
    evidenceAttestor: Address;
    stakeAtto: bigint;
  },
  onProgress: (progress: TxProgress) => void,
): Promise<string> {
  return write(
    session,
    "create_pact",
    [
      input.mode,
      input.title,
      input.criteria,
      input.periods,
      input.allowedMisses,
      input.startUnix,
      input.failureRecipient,
      input.evidenceAttestor,
    ],
    input.stakeAtto,
    onProgress,
  );
}

export const joinPact = (
  session: WalletSession,
  pactId: string,
  stakeAtto: bigint,
  onProgress: (progress: TxProgress) => void,
) => write(session, "join_pact", [pactId], stakeAtto, onProgress);

export const cancelPact = (
  session: WalletSession,
  pactId: string,
  onProgress: (progress: TxProgress) => void,
) => write(session, "cancel_before_start", [pactId], 0n, onProgress);

export const syncPact = (
  session: WalletSession,
  pactId: string,
  onProgress: (progress: TxProgress) => void,
) => write(session, "record_elapsed_periods", [pactId], 0n, onProgress);

export const submitCheckin = (
  session: WalletSession,
  pactId: string,
  evidenceUrl: string,
  evidenceDigest: string,
  statement: string,
  observedAtUnix: number,
  onProgress: (progress: TxProgress) => void,
) => write(
  session,
  "submit_checkin",
  [pactId, evidenceUrl, evidenceDigest, statement, observedAtUnix],
  0n,
  onProgress,
);

export const proposeSettlement = (
  session: WalletSession,
  pactId: string,
  onProgress: (progress: TxProgress) => void,
) => write(session, "propose_settlement", [pactId], 0n, onProgress);

export const appealPeriod = (
  session: WalletSession,
  pactId: string,
  period: number,
  statement: string,
  evidenceUrl: string,
  evidenceDigest: string,
  observedAtUnix: number,
  onProgress: (progress: TxProgress) => void,
) => write(
  session,
  "appeal_period",
  [pactId, period, statement, evidenceUrl, evidenceDigest, observedAtUnix],
  0n,
  onProgress,
);

export const finalizeSettlement = (
  session: WalletSession,
  pactId: string,
  onProgress: (progress: TxProgress) => void,
) => write(session, "finalize_settlement", [pactId], 0n, onProgress);

export const claimPayout = (
  session: WalletSession,
  pactId: string,
  onProgress: (progress: TxProgress) => void,
) => write(session, "claim", [pactId], 0n, onProgress);
