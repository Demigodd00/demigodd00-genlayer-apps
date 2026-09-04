# Hackathon Judge demo walkthrough

Target length: 60 seconds. A matching silent, captioned cut is available at [`docs/assets/hackathon-judge/hackathon-judge-demo.mp4`](assets/hackathon-judge/hackathon-judge-demo.mp4).

## 0–8s — Problem and contract

Show the live app header, StudioNet badge, and contract stamp.

> Hackathon rules are prose, but prizes need deterministic settlement. Hackathon Judge puts the subjective review inside GenLayer consensus.

## 8–18s — Immutable evidence

Open a submission and select **Inspect snapshot**. Point to the SHA-256 digest and stored rendered text.

> Entrants submit public evidence. Validators independently render it and agree on the exact digest before the snapshot is stored. Later page edits cannot rewrite the judged record.

## 18–30s — Consensus boundary

Show the Jury Console and a judged submission.

> Validators evaluate the same snapshot against the on-chain rulebook. Eligibility and the 20-point score band must match exactly. Confidence has a bounded tolerance. Reason wording is deliberately exempt, because comparing prose verbatim would make honest subjective judgment fail consensus.

## 30–41s — Appeal

Show the Appeal Recovery Fixture’s original adverse result, appeal marker, and appeal evidence digest.

> The Appeal Recovery Fixture first omits its deployment transaction and becomes inconclusive. Its one appeal adds that exact identifier as a second immutable snapshot, then validators reassess the complete record.

## 41–52s — Settlement

Show the finalized event, winning project, escrow amount, and builder profile totals.

> Finalization is deterministic: highest qualifying score wins, ties go to the earliest submission, the prize becomes withdrawable credit, and the wallet receives a portable win credential.

## 52–60s — Close

Show the live URL and contract address.

> No committee vote, no hidden oracle, and no admin override—just public evidence, independent validator judgment, a 24-hour liveness fallback, and code-enforced settlement.
