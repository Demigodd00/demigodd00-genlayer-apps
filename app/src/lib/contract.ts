import { createAccount, chains, createClient } from "genlayer-js";

export { generatePrivateKey } from "genlayer-js";

type GLClient = ReturnType<typeof createClient>;

export const DEFAULT_CONTRACT =
  "0xA81e4f3f0465B02261d5aF6dd7d2F16221e230c7";

const PK_KEY = "sp_private_key";
const ADDR_KEY = "sp_contract_addr";

export function loadKey(): string {
  return typeof window === "undefined" ? "" : localStorage.getItem(PK_KEY) ?? "";
}

export function saveKey(pk: string) {
  localStorage.setItem(PK_KEY, pk);
}

export function loadAddress(): string {
  return typeof window === "undefined"
    ? ""
    : localStorage.getItem(ADDR_KEY) ?? DEFAULT_CONTRACT;
}

export function saveAddress(addr: string) {
  localStorage.setItem(ADDR_KEY, addr);
}

export function makeClient(privateKey: string): GLClient {
  const account = privateKey ? createAccount(privateKey as `0x${string}`) : undefined;
  return createClient({ chain: chains.studionet, account });
}

export interface PactView {
  id: string;
  maker: string;
  taker: string;
  commitment: string;
  periods_total: string;
  allowed_misses: string;
  stake_atto: string;
  pot_atto: string;
  start_unix: string;
  end_unix: string;
  created_at_iso: string;
  status: string;
  kept_count: string;
  miss_count: string;
  next_period: string;
  next_window_open: string;
  next_window_close: string;
  window_open_now: string;
  settleable: string;
}

export interface CheckinView {
  period: string;
  verdict: string;
  method: string;
  note: string;
  evidence_url: string;
  content_digest: string;
  reason: string;
  judged_at_iso: string;
}

function norm<T>(v: unknown): T {
  return v as T;
}

export async function getPact(
  client: GLClient,
  addr: string,
  pid: string,
): Promise<PactView> {
  return norm(await client.readContract({ address: addr as `0x${string}`, functionName: "get_pact", args: [pid] }));
}

export async function listPacts(
  client: GLClient,
  addr: string,
): Promise<{ total: string; items: Array<Record<string, string>> }> {
  return norm(
    await client.readContract({ address: addr as `0x${string}`, functionName: "list_pacts", args: [0, 100] }),
  );
}

export async function listCheckins(
  client: GLClient,
  addr: string,
  pid: string,
): Promise<{ total: string; items: CheckinView[] }> {
  return norm(
    await client.readContract({ address: addr as `0x${string}`, functionName: "list_checkins", args: [pid, 0, 200] }),
  );
}

async function wait(client: GLClient, hash: unknown) {
  try {
    const receipt = await client.waitForTransactionReceipt({
      hash: hash as never,
      retries: 90,
    });
    return receipt;
  } catch {
    return null;
  }
}

export async function createPact(
  client: GLClient,
  addr: string,
  p: { commitment: string; periods: number; misses: number; startUnix: number },
  stakeAtto: bigint,
): Promise<string> {
  const hash = await client.writeContract({
    address: addr as `0x${string}`,
    functionName: "create_pact",
    args: [p.commitment, p.periods, p.misses, p.startUnix],
    value: stakeAtto,
  });
  await wait(client, hash);
  return String(hash);
}

export async function joinPact(
  client: GLClient,
  addr: string,
  pid: string,
  stakeAtto: bigint,
): Promise<void> {
  const hash = await client.writeContract({
    address: addr as `0x${string}`,
    functionName: "join_pact",
    args: [pid],
    value: stakeAtto,
  });
  await wait(client, hash);
}

export async function cancelPact(client: GLClient, addr: string, pid: string): Promise<void> {
  const hash = await client.writeContract({
    address: addr as `0x${string}`,
    functionName: "cancel_pact",
    args: [pid],
    value: 0n,
  });
  await wait(client, hash);
}

export async function checkIn(
  client: GLClient,
  addr: string,
  pid: string,
  note: string,
  url: string,
): Promise<void> {
  const hash = await client.writeContract({
    address: addr as `0x${string}`,
    functionName: "check_in",
    args: [pid, note, url],
    value: 0n,
  });
  await wait(client, hash);
}

export async function recordMiss(client: GLClient, addr: string, pid: string): Promise<void> {
  const hash = await client.writeContract({
    address: addr as `0x${string}`,
    functionName: "record_miss",
    args: [pid],
    value: 0n,
  });
  await wait(client, hash);
}

export async function forceSettle(client: GLClient, addr: string, pid: string): Promise<void> {
  const hash = await client.writeContract({
    address: addr as `0x${string}`,
    functionName: "force_settle",
    args: [pid],
    value: 0n,
  });
  await wait(client, hash);
}

export async function claim(client: GLClient, addr: string, pid: string): Promise<void> {
  const hash = await client.writeContract({
    address: addr as `0x${string}`,
    functionName: "claim",
    args: [pid],
    value: 0n,
  });
  await wait(client, hash);
}

export async function deployStreakPact(
  client: GLClient,
  code: string,
  feeBps: number,
  periodSecs: number,
): Promise<string> {
  const address = await client.deployContract({ code, args: [feeBps, periodSecs] });
  return String(address);
}
