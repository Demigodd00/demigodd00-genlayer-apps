import { chains, createClient } from "genlayer-js";
import { TransactionHashVariant, TransactionStatus, type Hash } from "genlayer-js/types";
import { assertSuccessfulExecution } from "./receipt";
import { connectStudioWallet, type EthereumProvider, type WalletOption } from "./wallet";
import { PendingJournal, DefinitiveFailure, type PendingWrite } from "./pending";
export type { PendingWrite } from "./pending";

export type { EthereumProvider, WalletOption } from "./wallet";
export type Address = `0x${string}`;

export interface WalletSession {
  address: Address;
  client: ReturnType<typeof createClient>;
  provider: EthereumProvider;
  walletName: string;
}

export interface Coverage {
  id: string;
  registration_ref: string;
  service_name: string;
  service_url: string;
  operator_status_url: string;
  region: string;
  provider: string;
  beneficiary: string;
  min_outage_secs: string;
  tolerance_secs: string;
  payout_atto: string;
  available_atto: string;
  reserved_atto: string;
  max_claims: string;
  claims_submitted: string;
  pending_claims: string;
  eligible_claims: string;
  paid_claims: string;
  created_at_unix: string;
  ends_at_unix: string;
  closed: boolean;
  can_submit: boolean;
  can_close: boolean;
}

export interface EvidenceReading {
  url: string;
  readable: boolean;
  outage_confirmed: boolean;
  service_match: boolean;
  region_match: boolean;
  start_unix: number;
  end_unix: number;
  confidence_bucket: number;
  source_verdict: string;
}

export interface Attestation {
  outcome: "ELIGIBLE" | "INELIGIBLE" | "UNVERIFIABLE";
  reason: string;
  intervals_agree: boolean;
  operator: EvidenceReading;
  monitor: EvidenceReading;
}

export interface IncidentClaim {
  id: string;
  coverage_id: string;
  claimant: string;
  day_start_unix: string;
  incident_start_unix: string;
  incident_end_unix: string;
  operator_report_url: string;
  monitor_report_url: string;
  submitted_at_unix: string;
  status: string;
  attestation_attempts: string;
  attested_at_unix: string;
  payout_atto: string;
  payout_expires_at_unix: string;
  attestation: Partial<Attestation>;
  can_attest: boolean;
  can_claim_payout: boolean;
  can_expire_payout: boolean;
  can_expire_claim: boolean;
  attestation_deadline_unix: string;
  resolution_reason: string;
}

export interface ProtocolStats {
  version: string;
  network_scope: string;
  admin_controls: boolean;
  fee_bps: string;
  source_policy: string;
  max_source_bytes: string;
  max_claims_per_coverage: string;
  claim_grace_secs: string;
  payout_claim_secs: string;
  attestation_window_secs: string;
  total_coverages: string;
  total_claims: string;
  total_eligible: string;
  total_ineligible: string;
  total_unverifiable: string;
  total_paid_atto: string;
  total_refunded_atto: string;
}

export interface CreateCoverageInput {
  serviceName: string;
  registrationRef: string;
  serviceUrl: string;
  operatorStatusUrl: string;
  region: string;
  beneficiary: Address;
  minOutageSecs: number;
  toleranceSecs: number;
  payoutAtto: bigint;
  maxClaims: number;
  coverageSecs: number;
}

export interface TxProgress {
  state: "awaiting-signature" | "submitted" | "finalizing" | "confirmed" | "failed" | "unknown";
  label: string;
  hash?: string;
}

export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_OUTAGEBOND_ADDRESS ?? "";
export const NETWORK_NAME = process.env.NEXT_PUBLIC_NETWORK_NAME ?? "StudioNet";
export const CONTRACT_READY = /^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS)
  && !/^0x0{40}$/i.test(CONTRACT_ADDRESS);
export const EXPLORER_URL = CONTRACT_READY
  ? `https://explorer-studio.genlayer.com/address/${CONTRACT_ADDRESS}`
  : "https://explorer-studio.genlayer.com";

const readClient = createClient({ chain: chains.studionet });
const RETRIES = 120;
const readWaits = [350, 1000] as const;
const activeWalletTransactions = new Set<string>();

function journalKey(session: WalletSession): string {
  return `outagebond:pending:${chains.studionet.id}:${CONTRACT_ADDRESS.toLowerCase()}:${session.address.toLowerCase()}`;
}

function journal(session: WalletSession): PendingJournal {
  if (typeof window === "undefined") throw new Error("Connect a browser wallet to submit transactions.");
  return new PendingJournal(window.localStorage, journalKey(session));
}

export function pendingTransaction(session: WalletSession): PendingWrite | null { return journal(session).read(); }

export function acknowledgeTransaction(session: WalletSession, hash: string): void {
  const record = journal(session).read();
  if (!record) return; // Another tab may have reconciled the same completed write.
  if (record.hash !== hash) throw new Error("Saved transaction does not match this receipt.");
  journal(session).acknowledge(record.id);
}

function address(): Address {
  if (!CONTRACT_READY) throw new Error("OutageBond is not configured for StudioNet yet.");
  return CONTRACT_ADDRESS as Address;
}

export function formatGen(attoValue: string | bigint, precision = 4): string {
  const atto = typeof attoValue === "bigint" ? attoValue : BigInt(attoValue || "0");
  const whole = atto / 10n ** 18n;
  const fraction = (atto % 10n ** 18n).toString().padStart(18, "0").slice(0, precision).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function parseGen(value: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{0,18})?$/.test(trimmed)) throw new Error("Enter a GEN amount with up to 18 decimal places.");
  const [whole, fraction = ""] = trimmed.split(".");
  return BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0"));
}

export function isAddress(value: string): value is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/i.test(value);
}

export function isPublicHttpsUrl(value: string): boolean {
  const source = value.trim();
  if (source.length < 12 || source.length > 360 || /\s|\0/.test(source)) return false;
  if (!/^https:\/\/[^/]+(?:\/.*)?$/.test(source)) return false;
  const authority = source.slice(8).split("/", 1)[0];
  if (!authority || /@|\[|\]/.test(authority)) return false;
  const [rawHost, port] = authority.split(":", 2);
  if (port !== undefined && (!/^\d{1,5}$/.test(port) || Number(port) > 65535)) return false;
  const host = rawHost.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".") || host === "localhost" || host.endsWith(".local")) return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false;
  return /^[a-z0-9.-]+$/.test(host) && !host.includes("..");
}

export function samePublicHost(left: string, right: string): boolean {
  const host = (value: string) => new URL(value).hostname.toLowerCase().replace(/\.$/, "");
  try { return host(left) === host(right); } catch { return true; }
}

export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const expected = message.match(/\[EXPECTED\]\s*([^"\n]+)/);
  if (expected?.[1]) return expected[1].trim();
  if (/rejected|denied|cancelled/i.test(message)) return "The wallet request was cancelled.";
  if (/wrong chain|configured for chain/i.test(message)) return "Switch your wallet to GenLayer StudioNet and reconnect.";
  if (/failed to fetch|fetch failed|network error|econn|socket hang up|service unavailable|\b(?:502|503|504)\b/i.test(message)) {
    return "StudioNet or an evidence source is temporarily unreachable. Check the claim before retrying.";
  }
  if (/timeout|timed out/i.test(message)) return "Confirmation is taking longer than expected. Check this transaction before retrying.";
  return message.length > 240 ? `${message.slice(0, 237)}…` : message;
}

export async function connectWallet(wallet: WalletOption): Promise<WalletSession> {
  const walletAddress = await connectStudioWallet(wallet.provider);
  return {
    address: walletAddress,
    client: createClient({ chain: chains.studionet, account: walletAddress, provider: wallet.provider as never }),
    provider: wallet.provider,
    walletName: wallet.name,
  };
}

async function read<T>(functionName: string, args: unknown[]): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await readClient.readContract({
        address: address(),
        transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
        functionName,
        args: args as never[],
      }) as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const transient = /failed to fetch|fetch failed|network error|timeout|timed out|econn|socket hang up|\b(?:502|503|504)\b/i.test(message);
      if (!transient || attempt >= readWaits.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, readWaits[attempt]));
    }
  }
}

async function waitForSuccess(hash: unknown, onProgress: (progress: TxProgress) => void): Promise<void> {
  const transactionHash = String(hash);
  onProgress({ state: "finalizing", label: "GenLayer validators are finalizing this transaction", hash: transactionHash });
  for (let attempt = 0; ; attempt += 1) {
    const receipt = await readClient.getTransaction({ hash: transactionHash as Hash });
    const status = String(receipt?.statusName ?? receipt?.status ?? "").toUpperCase();
    if (["CANCELED", "CANCELLED", "UNDETERMINED"].includes(status)) throw new DefinitiveFailure(`Transaction ended with ${status}; no successful execution was confirmed.`);
    if (status === TransactionStatus.FINALIZED) {
      try { assertSuccessfulExecution(receipt); }
      catch (error) { throw new DefinitiveFailure(friendlyError(error)); }
      break;
    }
    if (attempt >= RETRIES) throw new Error("Confirmation timed out. The submitted transaction remains saved; reconcile it before sending another.");
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  onProgress({ state: "confirmed", label: "Finalized with successful execution", hash: transactionHash });
}

async function write(
  session: WalletSession,
  functionName: string,
  args: unknown[],
  value: bigint,
  onProgress: (progress: TxProgress) => void,
): Promise<string> {
  const key = session.address.toLowerCase();
  if (activeWalletTransactions.has(key)) throw new Error("A transaction is already being finalized for this wallet.");
  activeWalletTransactions.add(key);
  let transactionHash: string | undefined;
  onProgress({ state: "awaiting-signature", label: "Confirm this transaction in your wallet" });
  try {
    const send = async () => journal(session).execute({
      id: crypto.randomUUID(), method: functionName,
      args: args.map((arg) => typeof arg === "bigint" ? arg.toString() : arg) as Array<string | number>,
      value: value.toString(),
    }, async () => {
      const hash = await session.client.writeContract({ address: address(), functionName, args: args as never[], value });
      transactionHash = String(hash);
      onProgress({ state: "submitted", label: "Transaction submitted", hash: transactionHash });
      return transactionHash;
    }, (hash) => waitForSuccess(hash, onProgress));
    if (typeof navigator !== "undefined" && navigator.locks) {
      return await navigator.locks.request(journalKey(session), { ifAvailable: true }, async (lock) => {
        if (!lock) throw new Error("This wallet has a transaction open in another tab.");
        return send();
      });
    }
    throw new Error("Safe transaction submission requires browser Web Locks. Use an up-to-date browser on HTTPS.");
  } catch (error) {
    const pending = journal(session).read();
    onProgress({ state: pending ? "unknown" : "failed", label: friendlyError(error), hash: transactionHash ?? pending?.hash });
    throw error;
  } finally {
    activeWalletTransactions.delete(key);
  }
}

export async function listCoverages(): Promise<Coverage[]> {
  const first = await read<{ total: string; items: Coverage[] }>("list_coverages", [0, 25]);
  const total = Number(first.total);
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("The contract returned an invalid coverage count.");
  const page = total > 25 ? await read<{ items: Coverage[] }>("list_coverages", [total - 25, 25]) : first;
  return [...page.items].reverse();
}

export const getCoverage = (coverageId: string) => read<Coverage>("get_coverage", [coverageId]);
export const getCoverageByRef = (registrationRef: string) =>
  read<{ exists: boolean; coverage_id: string }>("get_coverage_by_ref", [registrationRef]);
export const getClaim = (claimId: string) => read<IncidentClaim>("get_claim", [claimId]);
export const getClaimForDay = (coverageId: string, dayStart: number) =>
  read<{ exists: boolean; claim_id: string }>("get_claim_for_day", [coverageId, dayStart]);
export const listClaims = async (coverageId: string) =>
  {
    const first = await read<{ total: string; items: IncidentClaim[] }>("list_claims", [coverageId, 0, 25]);
    const items = [...first.items];
    for (let offset = 25; offset < Number(first.total); offset += 25) items.push(...(await read<{ items: IncidentClaim[] }>("list_claims", [coverageId, offset, 25])).items);
    return items;
  };
export const getStats = () => read<ProtocolStats>("get_stats", []);

export const createCoverage = (session: WalletSession, input: CreateCoverageInput, onProgress: (progress: TxProgress) => void) =>
  write(session, "create_coverage", [
    input.serviceName,
    input.registrationRef,
    input.serviceUrl,
    input.operatorStatusUrl,
    input.region,
    input.beneficiary,
    input.minOutageSecs,
    input.toleranceSecs,
    input.payoutAtto,
    input.maxClaims,
    input.coverageSecs,
  ], input.payoutAtto * BigInt(input.maxClaims), onProgress);

export const submitClaim = (
  session: WalletSession,
  coverageId: string,
  startUnix: number,
  endUnix: number,
  operatorUrl: string,
  monitorUrl: string,
  onProgress: (progress: TxProgress) => void,
) => write(session, "submit_claim", [coverageId, startUnix, endUnix, operatorUrl, monitorUrl], 0n, onProgress);

export const attest = (session: WalletSession, claimId: string, onProgress: (progress: TxProgress) => void) =>
  write(session, "attest", [claimId], 0n, onProgress);
export const claimPayout = (session: WalletSession, claimId: string, onProgress: (progress: TxProgress) => void) =>
  write(session, "claim_payout", [claimId], 0n, onProgress);
export const expirePayout = (session: WalletSession, claimId: string, onProgress: (progress: TxProgress) => void) =>
  write(session, "expire_payout", [claimId], 0n, onProgress);
export const expireClaim = (session: WalletSession, claimId: string, onProgress: (progress: TxProgress) => void) =>
  write(session, "expire_claim", [claimId], 0n, onProgress);
export const closeCoverage = (session: WalletSession, coverageId: string, onProgress: (progress: TxProgress) => void) =>
  write(session, "close_coverage", [coverageId], 0n, onProgress);

export async function recoverTransaction(session: WalletSession): Promise<{ done: boolean; href?: string; message: string }> {
  if (activeWalletTransactions.has(session.address.toLowerCase())) return { done: false, message: "This tab is still processing the saved transaction. Wait for completion or a connection timeout." };
  if (!navigator.locks) throw new Error("Safe recovery requires an up-to-date browser on HTTPS.");
  return navigator.locks.request(journalKey(session), { ifAvailable: true }, async (lock) => {
    if (!lock) return { done: false, message: "Another tab is still processing this transaction." };
    return reconcileTransaction(session);
  });
}

async function reconcileTransaction(session: WalletSession): Promise<{ done: boolean; href?: string; message: string }> {
  const store = journal(session);
  const record = store.read();
  if (!record) return { done: true, message: "No pending transaction." };
  if (record.hash && record.state !== "confirmed") {
    const receipt = await readClient.getTransaction({ hash: record.hash as Hash });
    const status = String(receipt?.statusName ?? receipt?.status ?? "").toUpperCase();
    if (["CANCELED", "CANCELLED", "UNDETERMINED"].includes(status)) {
      window.localStorage.removeItem(journalKey(session));
      return { done: true, message: `Transaction ended with ${status}. You may submit a new request.` };
    }
    if (status !== TransactionStatus.FINALIZED) return { done: false, message: `Still awaiting finality (${status || "not yet indexed"}). No replacement transaction was sent.` };
    try { assertSuccessfulExecution(receipt); }
    catch (error) {
      window.localStorage.removeItem(journalKey(session));
      return { done: true, message: `Finalized with unsuccessful execution: ${friendlyError(error)}` };
    }
    record.state = "confirmed";
    store.save(record);
  }
  let href: string | undefined;
  if (record.method === "create_coverage") {
    const a = record.args;
    const ref = await getCoverageByRef(String(a[1]));
    if (!ref.exists) return { done: false, message: "Coverage is not finalized yet. Its original registration reference is retained." };
    const coverage = await getCoverage(ref.coverage_id);
    const actual = [coverage.service_name, coverage.registration_ref, coverage.service_url, coverage.operator_status_url, coverage.region, coverage.beneficiary.toLowerCase(), coverage.min_outage_secs, coverage.tolerance_secs, coverage.payout_atto, coverage.max_claims, Number(coverage.ends_at_unix)-Number(coverage.created_at_unix)].map(String);
    const expected = a.map((v, i) => i === 5 ? String(v).toLowerCase() : String(v));
    if (coverage.provider.toLowerCase() !== session.address.toLowerCase() || JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Saved terms do not match the finalized coverage. Keep this transaction for inspection.");
    href = `/coverage/${encodeURIComponent(coverage.id)}`;
  } else if (record.method === "submit_claim") {
    const [coverageId, start, end, operator, monitor] = record.args;
    const ref = await getClaimForDay(String(coverageId), Math.floor(Number(start)/86400)*86400);
    if (!ref.exists) return { done: false, message: "The submitted claim is not finalized yet; its incident window is retained." };
    const claim = await getClaim(ref.claim_id);
    if (claim.claimant.toLowerCase() !== session.address.toLowerCase() || claim.coverage_id !== coverageId || Number(claim.incident_start_unix) !== Number(start) || Number(claim.incident_end_unix) !== Number(end) || claim.operator_report_url !== operator || claim.monitor_report_url !== monitor) throw new Error("Saved claim details do not match the finalized record.");
    href = `/claims/${encodeURIComponent(claim.id)}`;
  } else {
    if (!record.hash || record.state !== "confirmed") return { done: false, message: "The wallet did not return a transaction hash. Keep this saved request and inspect wallet activity before attempting recovery." };
    href = record.method === "close_coverage" ? `/coverage/${record.args[0]}` : `/claims/${record.args[0]}`;
  }
  record.state = "confirmed";
  store.save(record);
  store.acknowledge(record.id);
  return { done: true, href, message: "Finalized execution and the saved request have been reconciled." };
}
