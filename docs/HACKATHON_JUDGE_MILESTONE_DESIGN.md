# Milestone 1: Transparent scorecards and score appeals

Status: implementation in progress; not yet a completed milestone claim.

Accepted baseline: v2.3, contract 0x6fD9B65001B0eEF5CC98A95D20A1c693C0D04FBA. Its source, deployment and acceptance receipt remain unchanged. This release uses a separate contract and deployment record.

## Boundary and flow

The organizer locks 2–4 prose criteria with integer percentage weights totaling 100. Entrants submit the existing wallet-bound GitHub evidence packages. Each validator independently judges the immutable, numbered evidence. Eligibility and each criterion's 20-point band must agree; confidence may differ by at most 20. Reasons and valid citation locations need not be identical. Code checks citation ranges against the captured snapshot and materializes their text; that proves location/integrity, not semantic truth. No LLM controls weights, arithmetic, ranking, deadlines or transfers.

Weighted totals use integer basis points: sum(score_band * weight), out of 10,000. Rank and minimum-score comparisons use that exact total, without rounding. The UI displays up to two decimals. Ties retain the existing earliest-submission rule, announced before entries open.

All initial judgments must complete or time out before one common appeal window starts. Every eligible entrant may appeal one criterion once; only that criterion is reassessed, so other scores and eligibility remain unchanged. Ineligible/inconclusive entries may appeal eligibility and receive a complete new scorecard. Additional evidence retains v2.3 wallet/repository/parent proof checks. A score can decrease as well as increase. No organizer overrides are introduced.

Original and current scorecards, canonical digests, timestamps, target and outcome remain inspectable. Prize settlement waits for the common window to close and all pending appeals to resolve or time out, then validates evidence and scorecard integrity. Timed-out work is inconclusive, not an invented AI score.

Frontend owns rubric editing, non-authoritative arithmetic previews, wallet actions and an audit view of contract history. GitHub owns public source records. Contract owns authenticated capture, independent validator judgment, history, appeal permissions and final settlement.

## Acceptance evidence

- Direct and adversarial tests for weights/IDs, citation ranges, independent comparison, exact totals, immutable history, score appeal authorization/limits, shared deadlines and settlement.
- Real StudioNet run with distinct controlled submissions, an eligible entrant's criterion appeal and recorded ranking changes or unchanged result, rejected premature settlement, finalization and withdrawal.
- Published app, new deployment/source hashes, before/after release notes, reviewer instructions and a short walkthrough.
- Existing v2.3 tests remain intact; simulated fixtures are clearly labeled and not reported as adoption.

Out of scope: multiple winners, extra prize currencies, GitHub OAuth, deployment ownership proofs, identity verification, guaranteed correct AI judgments, or real-money readiness.
