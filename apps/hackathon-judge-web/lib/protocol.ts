export type Address = `0x${string}`;

export type Criterion = { id: string; name: string; description: string; weight: number };
export type Citation = { source: 'original' | 'appeal'; start: number; end: number; excerpt: string };
export type CriterionScore = { id: string; score_band: number; reason: string; refs: Citation[] };
export type Scorecard = {
  phase: 'initial' | 'appeal'; evaluated_at_iso: string; rubric_digest: string;
  parent_scorecard_digest: string; original_package_digest: string; appeal_package_digest: string;
  decision: { eligibility: string; confidence_bucket: number; reason: string; score_total_bps: number; criteria: CriterionScore[] };
};
export type ScorecardHistory = {
  criteria: Criterion[]; rubric_digest: string; original: Scorecard | null; current: Scorecard | null;
  original_digest: string; current_digest: string; appeal_target: string; appeal_statement: string;
  appeal_resolved: boolean; judgment_timed_out: boolean; effective_eligibility: string;
  effective_total_bps: string; effective_status: string; effective_at_iso: string;
  original_rank: string; current_rank: string; common_appeal_deadline_unix: string;
};

export const DEFAULT_CRITERIA: Criterion[] = [
  { id: 'implementation', name: 'Implementation', weight: 40, description: 'Assess demonstrated working functionality, completeness and reproducibility.' },
  { id: 'usefulness', name: 'Usefulness', weight: 30, description: 'Assess the evidenced usefulness for the intended users and problem.' },
  { id: 'originality', name: 'Originality', weight: 20, description: 'Assess the distinct contribution supported by evidence; do not assume ownership.' },
  { id: 'clarity', name: 'Clarity', weight: 10, description: 'Assess clear explanations, documentation and how reviewers can reproduce the result.' },
];

export function serializeRubric(criteria: Criterion[]): string {
  if (criteria.length < 2 || criteria.length > 4) throw new Error('Choose 2–4 criteria.');
  const ids = new Set<string>();
  for (const criterion of criteria) {
    if (!/^[a-z][a-z0-9_]{0,23}$/.test(criterion.id) || criterion.id === 'eligibility' || ids.has(criterion.id)) throw new Error('Criterion IDs must be unique lowercase identifiers.');
    ids.add(criterion.id);
    if (!Number.isInteger(criterion.weight) || criterion.weight < 1 || criterion.weight > 99) throw new Error('Each weight must be a whole percentage from 1 to 99.');
    if (criterion.name.trim().length < 3 || criterion.name.length > 60 || criterion.description.trim().length < 20 || criterion.description.length > 1000) throw new Error('Each criterion needs a name (3–60 characters) and description (20–1,000 characters).');
  }
  if (criteria.reduce((sum, criterion) => sum + criterion.weight, 0) !== 100) throw new Error('Criterion weights must total 100%.');
  return JSON.stringify(criteria.map((criterion) => ({ ...criterion, name: criterion.name.trim(), description: criterion.description.trim() })));
}

export function formatScore(bps: string | number): string {
  const value = BigInt(bps);
  const fraction = (value % 100n).toString().padStart(2, '0').replace(/0+$/, '');
  return `${value / 100n}${fraction ? `.${fraction}` : ''}`;
}

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
  criteria?: Criterion[];
  rubric_digest?: string;
  common_appeal_deadline_unix?: string;
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
  provenance_record: string;
  evidence_package_digest: string;
  appeal_provenance_record: string;
  appeal_package_digest: string;
  summary: string;
  submitted_at_iso: string;
  status: string;
  eligibility: string;
  score_band: string;
  score_total_bps?: string;
  original_total_bps?: string;
  original_scorecard_digest?: string;
  current_scorecard_digest?: string;
  appeal_target?: string;
  judgment_timed_out?: boolean;
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
  entrant: Address;
  provenance_record: string;
  evidence_package_digest: string;
  appeal_provenance_record: string;
  appeal_package_digest: string;
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

export function evidenceChallenge(contract: string, event: string, entrant: string, url: string, parent = ''): string {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_.-]+)\/blob\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_./-]+\.txt)$/.exec(url.trim());
  if (!match || match[4].split('/').some((part) => ['', '.', '..'].includes(part)) || ['.', '..'].includes(match[2])) {
    throw new Error('Use a GitHub .txt file URL on your repository’s default branch.');
  }
  if (!isAddress(contract) || !isAddress(entrant)) throw new Error('Connect your entrant wallet to prepare the proof.');
  if (parent && !/^[0-9a-f]{64}$/.test(parent)) throw new Error('The original evidence package is unavailable.');
  return ['HJ-PROVENANCE-V1', 'studionet', contract.toLowerCase(), event, entrant.toLowerCase(), `${match[1]}/${match[2]}`.toLowerCase(), match[4], parent ? 'appeal' : 'submission', parent || 'none'].join('|');
}
