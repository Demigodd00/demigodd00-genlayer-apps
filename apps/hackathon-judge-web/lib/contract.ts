import { chains, createClient } from "genlayer-js";
import { ExecutionResult, TransactionHashVariant, TransactionStatus } from "genlayer-js/types";
import type {
  Address, BuilderProfile, CreateHackathonInput, Evidence, Hackathon,
  HackathonSummary, Page, ProtocolStats, Submission,
} from "./protocol";
import { friendlyError, isAddress, sameAddress } from "./protocol";

type WalletListener = (...args: unknown[]) => void;
export interface EthereumProvider {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
  on?(event: string, listener: WalletListener): void;
  removeListener?(event: string, listener: WalletListener): void;
}
declare global { interface Window { ethereum?: EthereumProvider } }

export type WalletSession = { address: Address; client: ReturnType<typeof createClient>; provider: EthereumProvider };
export type TxProgress = { state: "idle" | "checking" | "signing" | "submitted" | "finalizing" | "confirmed" | "failed"; label: string; hash?: string };

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_HACKATHON_JUDGE_ADDRESS ?? "0x788432Aa8D55c81c3bd2ef0FbB29A4Bc7E6e4cC6") as Address;
export const EXPLORER_URL = `https://explorer-studio.genlayer.com/address/${CONTRACT_ADDRESS}`;
const readClient = createClient({ chain: chains.studionet });

async function read<T>(functionName: string, args: unknown[] = []): Promise<T> {
  let lastError: unknown;
  for (const delay of [0, 800, 2_000]) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      return await readClient.readContract({ address: CONTRACT_ADDRESS, functionName, args: args as never[], transactionHashVariant: TransactionHashVariant.LATEST_FINAL }) as unknown as T;
    } catch (error) { lastError = error; }
  }
  throw lastError;
}

function validPage<T>(value: Page<T>): Page<T> {
  if (!value || !Array.isArray(value.items) || !/^\d+$/.test(String(value.total))) throw new Error("The contract returned an invalid list.");
  return value;
}

export const listHackathons = async (offset = 0) => validPage(await read<Page<HackathonSummary>>("list_hackathons", [offset, 25]));
export const getHackathon = (id: string) => read<Hackathon>("get_hackathon", [id]);
export const listSubmissions = async (id: string) => validPage(await read<Page<Submission>>("list_submissions", [id, 0, 25]));
export const getEvidence = (id: string, index: string) => read<Evidence>("get_submission_evidence", [id, Number(index)]);
export const getStats = () => read<ProtocolStats>("get_stats");
export const getBuilderProfile = (address: Address) => read<BuilderProfile>("get_builder_profile", [address]);

function onStudioNet(chainId: unknown): boolean {
  try { return (typeof chainId === "string" || typeof chainId === "number") && BigInt(chainId) === BigInt(chains.studionet.id); }
  catch { return false; }
}

async function assertWallet(session: WalletSession): Promise<void> {
  const [accounts, chainId] = await Promise.all([
    session.provider.request({ method: "eth_accounts" }),
    session.provider.request({ method: "eth_chainId" }),
  ]);
  const current = Array.isArray(accounts) ? accounts[0] : undefined;
  if (typeof current !== "string" || !sameAddress(current, session.address)) throw new Error("Wallet account changed. Reconnect to continue.");
  if (!onStudioNet(chainId)) throw new Error("Switch your wallet to GenLayer StudioNet and reconnect.");
}

export async function connectWallet(): Promise<WalletSession> {
  const provider = window.ethereum;
  if (!provider) throw new Error("Install MetaMask or another injected wallet first.");
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const first = Array.isArray(accounts) ? accounts[0] : undefined;
  if (typeof first !== "string" || !isAddress(first)) throw new Error("The wallet returned an invalid account.");
  const client = createClient({ chain: chains.studionet, account: first, provider: provider as never });
  await client.connect("studionet");
  const session = { address: first, client, provider };
  await assertWallet(session);
  return session;
}

export function watchWallet(session: WalletSession, invalidate: (message: string) => void): () => void {
  const accountChanged: WalletListener = (accounts) => {
    const account = Array.isArray(accounts) ? accounts[0] : undefined;
    if (typeof account !== "string" || !sameAddress(account, session.address)) invalidate("Wallet account changed. Reconnect to continue.");
  };
  const chainChanged: WalletListener = (chainId) => { if (!onStudioNet(chainId)) invalidate("Network changed. Reconnect on StudioNet."); };
  session.provider.on?.("accountsChanged", accountChanged);
  session.provider.on?.("chainChanged", chainChanged);
  return () => {
    session.provider.removeListener?.("accountsChanged", accountChanged);
    session.provider.removeListener?.("chainChanged", chainChanged);
  };
}

async function write(session: WalletSession, functionName: string, args: unknown[], value: bigint, progress: (value: TxProgress) => void): Promise<string> {
  let hash = "";
  try {
    progress({ state: "checking", label: "Checking wallet and StudioNet" });
    await assertWallet(session);
    progress({ state: "signing", label: "Confirm this action in your wallet" });
    hash = String(await session.client.writeContract({ address: CONTRACT_ADDRESS, functionName, args: args as never[], value }));
    progress({ state: "submitted", label: "Submitted to StudioNet", hash });
    progress({ state: "finalizing", label: "Validators are finalizing the result", hash });
    const receipt = await readClient.waitForTransactionReceipt({ hash: hash as never, status: TransactionStatus.FINALIZED, retries: 120 });
    if (receipt.statusName !== TransactionStatus.FINALIZED) throw new Error("Transaction is still finalizing. Keep the hash and refresh shortly.");
    if (receipt.txExecutionResultName === ExecutionResult.FINISHED_WITH_ERROR) {
      const failure = receipt as unknown as Record<string, unknown>;
      const detail = typeof failure.error === "string" ? failure.error : "The contract rejected this action.";
      throw new Error(detail);
    }
    if (receipt.txExecutionResultName !== ExecutionResult.FINISHED_WITH_RETURN) throw new Error("Final execution result is unavailable.");
    progress({ state: "confirmed", label: "Finalized on StudioNet", hash });
    return hash;
  } catch (error) {
    progress({ state: "failed", label: friendlyError(error), hash: hash || undefined });
    throw error;
  }
}

export const deposit = (s: WalletSession, amount: bigint, p: (value: TxProgress) => void) => write(s, "deposit", [], amount, p);
export const withdraw = (s: WalletSession, p: (value: TxProgress) => void) => write(s, "withdraw_credit", [], 0n, p);
export const createHackathon = (s: WalletSession, input: CreateHackathonInput, p: (value: TxProgress) => void) => write(s, "create_hackathon", [input.name.trim(), input.awardTitle.trim(), input.rulebook.trim(), input.rubric.trim(), input.deadlineUnix, input.maxSubmissions, input.minWinningScore, input.appealWindowSecs, input.prizeAtto], 0n, p);
export const cancelHackathon = (s: WalletSession, id: string, p: (value: TxProgress) => void) => write(s, "cancel_hackathon", [id], 0n, p);
export const submitProject = (s: WalletSession, id: string, name: string, url: string, summary: string, p: (value: TxProgress) => void) => write(s, "submit_project", [id, name.trim(), url.trim(), summary.trim()], 0n, p);
export const evaluateSubmission = (s: WalletSession, id: string, index: string, p: (value: TxProgress) => void) => write(s, "evaluate_submission", [id, Number(index)], 0n, p);
export const appealSubmission = (s: WalletSession, id: string, index: string, statement: string, url: string, p: (value: TxProgress) => void) => write(s, "appeal_submission", [id, Number(index), statement.trim(), url.trim()], 0n, p);
export const resolveAppeal = (s: WalletSession, id: string, index: string, p: (value: TxProgress) => void) => write(s, "resolve_appeal", [id, Number(index)], 0n, p);
export const expireUnresolvedSubmission = (s: WalletSession, id: string, index: string, p: (value: TxProgress) => void) => write(s, "expire_unresolved_submission", [id, Number(index)], 0n, p);
export const finalizeHackathon = (s: WalletSession, id: string, p: (value: TxProgress) => void) => write(s, "finalize_hackathon", [id], 0n, p);
