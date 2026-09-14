export const ADDRESS =
  process.env.NEXT_PUBLIC_LACUNA_ADDRESS ||
  "0x39AE6124194cEd74bBa0A772B9d4568b6cb29242";
export const EXPLORER = "https://explorer-studio.genlayer.com";
export const CHAIN_ID = "61999";
export const RULE =
  "Approve applicants only if both independent pilot reviews finished before June 15 of the same year.";
export const EXAMPLE = {
  document:
    "Both independent pilot reviews for the applicant finished in June of that year.",
  a: "Both reviews finished on June 10 of that same year.",
  b: "Both reviews finished on June 20 of that same year.",
};
export type RecordBase = {
  basis: string;
  recorded_at: string;
  provenance: string;
};
export type Target = RecordBase & { verdict: string };
export type Referee = RecordBase & {
  a_compatible: boolean;
  b_compatible: boolean;
  same_subject: boolean;
  policy_respected: boolean;
  a_outcome: string;
  b_outcome: string;
};
export interface Campaign {
  id: string;
  title: string;
  rule: string;
  rule_sha256: string;
  sponsor: string;
  profile: string;
  seeded_control: boolean;
  status: string;
  bounty_atto: string;
  stake_atto: string;
  remaining_bounty_atto: string;
  closes_at: string;
  active_attempt: string;
  attempt_ids: string[];
  rule_deadline: string;
  rule_review: (RecordBase & { admissible: boolean }) | null;
  can_commit: boolean;
  can_expire: boolean;
  abstention_promise: string;
}
export interface Attempt {
  id: string;
  campaign_id: string;
  challenger: string;
  status: string;
  commitment: string;
  document: string;
  document_sha256: string;
  completion_a: string;
  completion_b: string;
  target: Target | null;
  referee_one: Referee | null;
  referee_two: Referee | null;
  reveal_deadline: string;
  stage_deadline: string;
  settled_at: string;
  result_reason: string;
  allocation_recipient: string;
  allocation_atto: string;
  stake_atto: string;
  can_expire: boolean;
  seeded_control: boolean;
}
export interface Stats {
  version: string;
  total_campaigns: string;
  total_attempts: string;
  genuine_findings: string;
  control_findings: string;
  no_findings: string;
  invalid_attempts: string;
  inconclusive_attempts: string;
  accounting_balanced: boolean;
  campaign_escrow_atto: string;
  attempt_escrow_atto: string;
  claimable_atto: string;
}
export interface RevealBackup {
  version: 1;
  chain: string;
  contract: string;
  campaign: string;
  challenger: string;
  document: string;
  a: string;
  b: string;
  salt: string;
  commitment: string;
  attempt?: string;
}
export const activeStage = (status: string) =>
  ["TARGET_PENDING", "REFEREE_ONE_PENDING", "REFEREE_TWO_PENDING"].includes(
    status,
  );
export const label = (value: string) =>
  value.toLowerCase().split("_").join(" ");
export function campaignStatus(
  campaign: Pick<Campaign, "status" | "closes_at" | "active_attempt">,
  nowMs: number | null,
): { text: string; good: boolean } {
  if (campaign.status !== "OPEN")
    return { text: label(campaign.status), good: false };

  const deadlineMs = /^\d+$/.test(campaign.closes_at)
    ? Number(campaign.closes_at) * 1000
    : NaN;
  if (nowMs === null || !Number.isFinite(nowMs) || !Number.isFinite(deadlineMs))
    return { text: "Checking deadline", good: false };

  // OPEN is stored until a closing transaction; entry eligibility expires first.
  if (nowMs >= deadlineMs)
    return {
      text: campaign.active_attempt
        ? "Deadline passed — attempt in progress"
        : "Deadline passed — awaiting closure",
      good: false,
    };
  return { text: "open", good: true };
}
export const short = (value: string) =>
  value.length > 16 ? value.slice(0, 7) + "…" + value.slice(-5) : value;
export const date = (unix: string) =>
  new Date(Number(unix) * 1000).toLocaleString();
export const same = (a?: string, b?: string) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();
export function validRoute(path: string[]): boolean {
  return (
    path.length === 0 ||
    (path.length === 1 && ["new", "protocol"].includes(path[0])) ||
    (path.length === 2 &&
      ((path[0] === "campaign" && /^lc-[1-9]\d*$/.test(path[1])) ||
        (path[0] === "attempt" && /^la-[1-9]\d*$/.test(path[1]))))
  );
}

export function parseGen(text: string): bigint {
  if (!/^\d+(\.\d{1,18})?$/.test(text.trim()))
    throw new Error("Use a positive GEN amount with at most 18 decimals.");
  const [whole, fraction = ""] = text.trim().split(".");
  return BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0"));
}
export function gen(value: string | bigint): string {
  const amount = BigInt(value || "0"),
    f = (amount % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return (amount / 10n ** 18n).toString() + (f ? "." + f : "");
}
export function validateCase(document: string, a: string, b: string): void {
  for (const [name, text, min, max] of [
    ["Original document", document, 10, 3000],
    ["Completion A", a, 5, 1200],
    ["Completion B", b, 5, 1200],
  ] as const) {
    if (
      Array.from(text).length < min ||
      Array.from(text).length > max ||
      !text.trim() ||
      text.includes("\0")
    )
      throw new Error(`${name}: use ${min}–${max} characters without NUL.`);
  }
  if (a === b) throw new Error("The completions must differ.");
}
export async function digest(text: string): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function commitmentFor(
  data: Omit<RevealBackup, "commitment">,
): Promise<string> {
  return digest(
    JSON.stringify([
      "lacuna-v1",
      data.chain,
      data.contract.toLowerCase(),
      data.campaign,
      data.challenger.toLowerCase(),
      data.document,
      data.a,
      data.b,
      data.salt,
    ]),
  );
}
export async function prepareBackup(
  campaign: string,
  challenger: string,
  document: string,
  a: string,
  b: string,
): Promise<RevealBackup> {
  validateCase(document, a, b);
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
  const data = {
    version: 1 as const,
    chain: CHAIN_ID,
    contract: ADDRESS,
    campaign,
    challenger,
    document,
    a,
    b,
    salt,
  };
  return { ...data, commitment: await commitmentFor(data) };
}
export async function parseBackup(
  text: string,
  campaign: string,
  challenger: string,
): Promise<RevealBackup> {
  if (text.length > 40000) throw new Error("Backup is too large.");
  const b = JSON.parse(text) as RevealBackup;
  if (
    b.version !== 1 ||
    b.chain !== CHAIN_ID ||
    !same(b.contract, ADDRESS) ||
    b.campaign !== campaign ||
    !same(b.challenger, challenger)
  )
    throw new Error(
      "This backup belongs to another network, contract, campaign, or wallet.",
    );
  if (
    ![b.document, b.a, b.b, b.salt, b.commitment].every(
      (v) => typeof v === "string",
    )
  )
    throw new Error("Invalid backup fields.");
  validateCase(b.document, b.a, b.b);
  if (
    !/^[0-9a-f]{64}$/.test(b.salt) ||
    (await commitmentFor(b)) !== b.commitment
  )
    throw new Error("Backup commitment does not match its contents.");
  return b;
}
export const backupKey = (campaign: string, wallet: string) =>
  `lacuna:backup:${CHAIN_ID}:${ADDRESS.toLowerCase()}:${campaign}:${wallet.toLowerCase()}`;
export function downloadBackup(backup: RevealBackup): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `lacuna-${backup.campaign}-reveal.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function friendly(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/rejected|denied/i.test(message))
    return "Wallet request declined. No automatic retry was sent.";
  if (/fetch|network error|503|502/i.test(message))
    return "StudioNet is temporarily unreachable. Check any submitted transaction before trying again.";
  if (/timeout|timed out/i.test(message))
    return "Confirmation is taking longer. Resume the same transaction below; do not submit it again.";
  return message.replace(/.*\[EXPECTED\]\s*/, "").slice(0, 280);
}
