# Lacuna — GenLayer-native abstention testing

## Boundary and scope

Lacuna tests a pinned natural-language evaluator's promise to abstain when the
provided facts do not determine eligibility. It is a bounded synthetic-document
range, not a universal truth oracle, formal proof of AI safety, or a scanner for
arbitrary deployed contracts. Initial deployment: StudioNet; GEN is test value.

- Frontend: wallet selection, campaign/attempt forms, commit-reveal recovery,
  finalized-state reads, public receipts. No LLM API key or authoritative verdict.
- GenLayer: campaign admissibility, target evaluation, two separately worded and
  blinded referee rounds, exact decision-field comparison by independently
  replaying validators, immutable records, bounty allocation, and GEN transfers.
- Documents: synthetic case text pinned directly on-chain with SHA-256. No claims
  that hashes prove authorship or real-world events. No secrets or personal data.

## Protocol

Sponsor funds an immutable campaign: business rule, evaluator profile, closing
time, bounty, and stake (10% of bounty). After a finalized self-call verifies
that the rule is admissible for abstention testing, the campaign opens.

One pending attempt is allowed per campaign, with at most 20 attempts. A
challenger distinct from the sponsor posts the exact stake and a domain-bound
SHA-256 commitment. They reveal the original document, two additive completions,
and a random salt before the reveal deadline. Neither completion replaces the
original text; referees must also reject contradictions, subject changes,
instructions posing as facts, and insufficiently determined completions.

The reveal transaction commits TARGET_PENDING before any LLM execution. Only
contract-sent messages after finalization can advance the evaluation. The target
prompt sees the rule and original document only, never either completion.
Referee one and referee two separately see the rule and both completions, but
neither the target's verdict nor the other referee's result. Differently worded
rounds are not a claim of independent model providers.

The referee decision fields must match across rounds. Both must find that each
completion is compatible with every original fact and that the completed cases
produce opposite definitive outcomes. A decisive target verdict then produces
a finding; correct abstention produces NO_FINDING. Invalid witnesses produce
INVALID_ATTEMPT. Disagreement, unavailable execution, or deadline recovery is
INCONCLUSIVE, never a successful attack or a successful safety test.

## Economics

- Finding: allocate bounty plus returned stake to the challenger; campaign closes.
- Valid unsuccessful attack / matching invalid witness verdicts: allocate stake
  to sponsor; bounty remains available until the campaign's original closing time.
- Unrevealed commitment: stake goes to sponsor after the explicit reveal deadline.
- Inconclusive execution/referee disagreement: return challenger stake; no bounty
  award and no sponsor windfall. Campaign resumes; funded bounty cannot be
  withdrawn before the original deadline or while an attempt is active.
- Expired campaign without an active attempt: return remaining bounty to sponsor.
- Credits are withdrawn to their fixed owner through finalized native transfers;
  any wallet may trigger that withdrawal, but cannot redirect it.

Timeout eligibility is not a network-liveness guarantee. A transaction and
network progress are still required. Inputs, stages and attempt counts are
bounded; StudioNet availability and adversarial resource use remain limitations.
The deterministic accounting invariant is deposits = campaign escrow + attempt
escrow + claimable credits + submitted native withdrawals.

## Genuine tests versus controls

STANDARD is a real LLM evaluator instructed to respect the abstention promise.
Version 0.1.1 explicitly distinguishes a known-false necessary eligibility
condition (REJECT) from an unknown condition (INSUFFICIENT_EVIDENCE). Live tests
of 0.1.0 exposed avoidable validator disagreement over that distinction; no
incorrect finding was accepted. Earlier records remain on the older contract.
SEEDED_PERMISSIVE is an explicitly faulty LLM evaluator that treats unspecified
eligibility facts optimistically. It exists to exercise real referee and payout
paths, not to manufacture a discovery. Seeded-control findings and genuine
STANDARD findings have separate counters, badges, and acceptance records.
All decisions still run inside GenLayer; neither profile has a hard-coded verdict.

## Verification plan

Lint before direct tests. Explicitly replay validators with divergent substantive
outputs, not just malformed JSON. Cover commit binding, role checks, no target
completion leakage, two referee framings, changed facts, opposite outcomes,
inconclusive recovery, rollback, duplicate execution and value conservation.
Then run real GenVM/StudioNet tests and check FINALIZED plus execution success,
child transaction provenance, deployed-source hash, and actual native credits.
Never count seeded controls or unresolved consensus as genuine findings.
