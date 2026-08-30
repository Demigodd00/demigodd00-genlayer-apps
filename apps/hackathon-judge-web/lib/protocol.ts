export type Address = `0x${string}`;

export type HackathonSummary = {
  id: string;
  organizer: Address;
  name: string;
  award_title: string;
  status: string;
  submission_deadline_unix: string;
  submission_count: string;
  evaluated_count: string;
  prize_atto: string;
  has_winner: boolean;
};

export type Hackathon = HackathonSummary & {
  rulebook: string;
  rubric: string;
  created_at_iso: string;
  phase: string;
  max_submissions: string;
  min_winning_score: string;
  appeal_window_secs: string;
  prize_released: boolean;
  remaining_slots: string;
  winner_index: string;
  winner: Address | "";
  winner_project: string;
  finalized_at_iso: string;
  accepting_submissions: boolean;
  appeal_blocked: boolean;
  finalizable: boolean;
};

export type Submission = {
  index: string;
  hackathon_id: string;
  entrant: Address;
  project_name: string;
  evidence_url: string;
  evidence_digest: string;
  summary: string;
  submitted_at_iso: string;
  status: string;
  eligibility: string;
  score_band: string;
  confidence_bucket: string;
  reasoning: string;
  evaluated_at_iso: string;
  is_winner: boolean;
  appeal_count: string;
  appeal_statement: string;
  appeal_evidence_url: string;
  appeal_evidence_digest: string;
  appeal_deadline_unix: string;
  appeal_resolved: boolean;
  original_eligibility: string;
  original_score_band: string;
  appealable: boolean;
  appeal_resolvable: boolean;
  resolution_deadline_unix: string;
  expirable: boolean;
};

export type Evidence = {
  evidence_url: string;
  evidence_digest: string;
  evidence_snapshot: string;
  appeal_evidence_url: string;
  appeal_evidence_digest: string;
  appeal_evidence_snapshot: string;
};

export type BuilderProfile = {
  address: Address;
  entries: string;
  judged_entries: string;
  wins: string;
  available_credit_atto: string;
};

export type ProtocolStats = {
  total_hackathons: string;
  total_submissions: string;
  total_evaluated: string;
  total_finalized: string;
  total_no_winner: string;
  total_credentials: string;
  total_appeals: string;
  total_prize_awarded_atto: string;
  total_prize_refunded_atto: string;
};

export type Page<T> = { total: string; items: T[] };

export type CreateHackathonInput = {
  name: string;
  awardTitle: string;
  rulebook: string;
  rubric: string;
  deadlineUnix: string;
  maxSubmissions: string;
  minWinningScore: string;
  appealWindowSecs: string;
  prizeAtto: string;
};

export function isAddress(value: string): value is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

export function sameAddress(left?: string, right?: string): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

export function shortAddress(value?: string): string {
  return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "Not connected";
}

export function formatGen(value: string | bigint): string {
  const atto = typeof value === "bigint" ? value : BigInt(value || "0");
  const whole = atto / 10n ** 18n;
  const fraction = (atto % 10n ** 18n).toString().padStart(18, "0").slice(0, 4).replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""}`;
}

export function parseGen(value: string): bigint {
  const clean = value.trim();
  if (!/^\d+(?:\.\d{1,18})?$/.test(clean)) throw new Error("Enter a valid GEN amount with up to 18 decimals.");
  const [whole, fraction = ""] = clean.split(".");
  return BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0"));
}

export function dateTime(unix: string): string {
  const value = Number(unix) * 1000;
  return Number.isFinite(value)
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value)
    : "—";
}

export function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/^.*?\[(?:EXPECTED|EXTERNAL|TRANSIENT|LLM_ERROR)\]\s*/s, "")
    .replace(/^Error:\s*/, "")
    .slice(0, 280);
}
