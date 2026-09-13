import { chains, createClient } from "genlayer-js";
import { TransactionHashVariant, type Hash } from "genlayer-js/types";
import { ADDRESS, friendly, same } from "./protocol";
import { assertSuccessfulExecution, receiptState } from "./receipt";
import {
  connectStudioWallet,
  type EthereumProvider,
  type WalletOption,
} from "./wallet";

export type Session = {
  address: `0x${string}`;
  provider: EthereumProvider;
  name: string;
  client: ReturnType<typeof createClient>;
};
export type Progress = {
  state: "signature" | "pending" | "confirmed" | "uncertain" | "failed";
  message: string;
  hash?: string;
};
const client = createClient({ chain: chains.studionet });
export const pendingKey = `lacuna:pending:${ADDRESS.toLowerCase()}`;
let writing = false;

export async function connect(choice: WalletOption): Promise<Session> {
  const address = await connectStudioWallet(choice.provider);
  return {
    address,
    provider: choice.provider,
    name: choice.name,
    client: createClient({
      chain: chains.studionet,
      account: address,
      provider: choice.provider as never,
    }),
  };
}
export async function read<T>(
  functionName: string,
  args: unknown[] = [],
): Promise<T> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(ADDRESS) || /^0x0{40}$/i.test(ADDRESS))
    throw new Error("Lacuna contract is not configured.");
  return (await client.readContract({
    address: ADDRESS as `0x${string}`,
    functionName,
    args: args as never[],
    transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
  })) as T;
}
export async function confirm(
  hash: string,
  progress: (p: Progress) => void,
): Promise<void> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash))
    throw new Error("Invalid transaction hash.");
  progress({
    state: "pending",
    message: "Waiting for GenLayer finality…",
    hash,
  });
  let receipt: unknown;
  for (let i = 0; i < 100; i++) {
    receipt = await client.getTransaction({ hash: hash as Hash });
    if (receiptState(receipt) === "finalized") break;
    if (receiptState(receipt) === "cancelled") {
      localStorage.removeItem(pendingKey);
      progress({
        state: "failed",
        message:
          "GenLayer did not commit this transaction. Refresh the on-chain record before starting a new action.",
        hash,
      });
      throw new Error(
        "GenLayer cancelled or could not determine this transaction. No accepted result.",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 6000));
  }
  if (receiptState(receipt) !== "finalized")
    throw new Error("Confirmation timed out; resume the same transaction.");
  try {
    assertSuccessfulExecution(receipt);
  } catch (error) {
    localStorage.removeItem(pendingKey);
    progress({ state: "failed", message: friendly(error), hash });
    throw error;
  }
  localStorage.removeItem(pendingKey);
  progress({
    state: "confirmed",
    message:
      "Transaction finalized successfully. Any queued evaluation continues separately.",
    hash,
  });
}
export async function write(
  session: Session,
  method: string,
  args: unknown[],
  value: bigint,
  progress: (p: Progress) => void,
): Promise<void> {
  if (writing || localStorage.getItem(pendingKey))
    throw new Error("Resolve the pending transaction before sending another.");
  writing = true;
  let hash: string | undefined;
  try {
    const active = await connectStudioWallet(session.provider);
    if (!same(active, session.address))
      throw new Error("Wallet account changed. Reconnect before submitting.");
    progress({ state: "signature", message: "Confirm in your wallet." });
    hash = String(
      await session.client.writeContract({
        address: ADDRESS as `0x${string}`,
        functionName: method,
        args: args as never[],
        value,
      }),
    );
    localStorage.setItem(
      pendingKey,
      JSON.stringify({ hash, method, wallet: session.address }),
    );
    await confirm(hash, progress);
  } catch (error) {
    progress({
      state: hash && localStorage.getItem(pendingKey) ? "uncertain" : "failed",
      message: friendly(error),
      hash,
    });
    throw error;
  } finally {
    writing = false;
  }
}
