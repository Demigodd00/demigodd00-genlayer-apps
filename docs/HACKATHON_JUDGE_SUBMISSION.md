# Hackathon Judge — submission pack

## One-line pitch

Hackathon Judge turns a prose rulebook, public project evidence, and independent validator judgment into a deterministic on-chain winner, appeal record, prize settlement, and portable builder credential.

## Paste-ready contribution form

**Title:** Hackathon Judge — GenLayer-native jury protocol

**Notes / Description:**

> Built Hackathon Judge, a GenLayer-native protocol that turns prose hackathon rules and public project evidence into an auditable on-chain verdict and prize settlement. Validators first use `gl.nondet.web.render()` to agree on an immutable evidence snapshot and SHA-256 digest. They then independently judge that snapshot against the stored rulebook. Consensus compares only settlement-critical fields: exact eligibility, exact 20-point score band, and bounded confidence; free-form rationale is exempt. The contract also enforces one evidence-based appeal, permissionless judging/finalization, a 24-hour inconclusive fallback, deterministic ranking, withdrawable prize credit, refunds, and portable address-based winner credentials. A finalized StudioNet demo proves two judgments, one successful appeal, winner selection, and prize withdrawal.

**Required GitHub evidence:** <https://github.com/Demigodd00/demigodd00-genlayer-apps>

## Links

- Live app: [hackathon-judge-studionet.blazekingsley2.chatgpt.site](https://hackathon-judge-studionet.blazekingsley2.chatgpt.site)
- StudioNet contract: [`0x788432Aa8D55c81c3bd2ef0FbB29A4Bc7E6e4cC6`](https://explorer-studio.genlayer.com/address/0x788432Aa8D55c81c3bd2ef0FbB29A4Bc7E6e4cC6)
- Deployment transaction: `0x4b963396d91fa9088c77c4d15fcf02197c7d397a636ff4875c0c7ad6fd1a9926`
- Deployed source SHA-256: `5b27de829d137bdf1b89c0bb02d2742431cdc7833fb0c5b63b4285f6304a14d8`
- Contract source: [`contracts/hackathon_judge.py`](../contracts/hackathon_judge.py)
- Architecture: [`docs/architecture/hackathon-judge.md`](architecture/hackathon-judge.md)
- Security and limitations: [`docs/HACKATHON_JUDGE_SECURITY.md`](HACKATHON_JUDGE_SECURITY.md)
- Reproducible live-demo seeder: [`scripts/seed_hackathon_judge_demo.py`](../scripts/seed_hackathon_judge_demo.py)
- Complete live-demo receipt: [`deployments/hackathon_judge_demo.json`](../deployments/hackathon_judge_demo.json)
- 60-second walkthrough: [`docs/assets/hackathon-judge/hackathon-judge-demo.mp4`](assets/hackathon-judge/hackathon-judge-demo.mp4)

## The problem

Hackathon judging is slow, opaque, and difficult to audit. Rules are prose, evidence changes, judge explanations differ, and prize settlement ultimately depends on a trusted operator. A conventional smart contract can count votes or add scores, but it cannot inspect a public demo and decide whether it satisfies “newly built,” “complete,” “original,” or another natural-language requirement.

## The GenLayer-native mechanism

At submission time, every validator renders the public evidence URL and must reproduce both the exact normalized snapshot and its SHA-256 digest. That agreed snapshot becomes the immutable record. After the deadline, any account may trigger judging. Validators independently evaluate the saved snapshot against the stored prose rulebook and rubric using `exec_prompt()` inside a custom `run_nondet_unsafe()` comparison.

Consensus compares only the fields that affect settlement:

```json
{
  "eligibility": "ELIGIBLE",
  "score_band": 80,
  "confidence_bucket": 80,
  "reason": "wording may differ between validators"
}
```

`eligibility` and `score_band` must match exactly. Confidence may differ by two ten-point buckets. `reason` is intentionally exempt. This is the key design choice: subjective reasoning remains expressive while the payout boundary remains reproducible.

## User flow

1. Organizer deposits simulated StudioNet GEN and creates a hackathon with prose rules, rubric, deadline, score threshold, appeal window, and prize.
2. Each entrant submits one public HTTPS evidence page. Validators capture a byte-stable text snapshot and digest.
3. After the deadline, judging is permissionless. Results are `ELIGIBLE`, `INELIGIBLE`, or `INCONCLUSIVE` with a coarse score band.
4. An adversely judged entrant gets one appeal and may add a new immutable evidence snapshot.
5. Once every decision and appeal right is resolved, anyone finalizes. Deterministic code picks the highest qualifying score and credits the prize.
6. The winner withdraws and retains an address-based, cross-hackathon win record.
7. If validator consensus cannot be reached, any account can apply the 24-hour timeout fallback. The unresolved decision becomes `INCONCLUSIVE`, preserving finalization and refund liveness.

## What the demo proves

- Real `gl.nondet.web.render()` evidence capture with validator digest agreement.
- Real LLM-backed comparative judgment against on-chain prose.
- Deliberately narrow equivalence: decision fields compared, rationale wording exempt.
- Immutable original and appeal evidence.
- One bounded entrant appeal.
- Prize escrow, winner credit, withdrawal, and no-winner/cancellation refund paths.
- Deterministic ranking and portable builder profile.
- Permissionless timeout fallback so a failed judgment cannot lock the event or prize forever.

## Live StudioNet result

Event `hj-1`, **Open Intelligence Build Week — Verified Jury Final**, is finalized on the hardened v2.2 contract.

| Project | Final eligibility | Score | Confidence | Outcome |
|---|---:|---:|---:|---|
| Hackathon Judge Protocol | `ELIGIBLE` | 100 | 80 | Winner; prize released and withdrawn |
| Appeal Recovery Fixture | `ELIGIBLE` | 80 | 80 | Initially inconclusive; one evidence appeal resolved; not selected |

The evidence digests, every transaction hash, final representative rationale, winner address, and payout assertions are preserved in the [machine-readable demo receipt](../deployments/hackathon_judge_demo.json). The decisive finalization transaction is `0x34af0a90352270921714e6721fe60c860d19ca67ebfab1e84da6361fde6b22c8`; the winner withdrawal is `0xd5ee6c83994cba1e64b37151aa6b15c5bf37bc1eb71e730dc3e19bbb6cb2874b`. The organizer has zero app credit after settlement.

## Verification evidence

| Check | Result |
|---|---|
| GenVM lint | Passed; runner hash pinned |
| Direct tests | 20 passed, including malformed-leader, forged-snapshot, and timeout cases |
| StudioNet integration | 1 passed through real renderer + LLM consensus |
| Frontend tests | 8 passed |
| Frontend typecheck/lint/build | Passed |
| Production dependency audit | No known vulnerabilities |
| Deployed source/config verification | Passed |

## Why Solidity is insufficient

Solidity can custody a prize and enforce a deadline, but cannot fetch arbitrary public evidence or interpret an organizer’s future natural-language rubric. Adding a centralized oracle would move the trust problem off-chain. Adding human votes would preserve subjectivity but not independent execution. GenLayer lets validators perform the same open-web and language task, while the equivalence principle defines exactly what agreement means.

## Suggested judging narrative

“The AI is not decorating the UI and it is not an oracle behind an API. It executes inside the contract’s consensus path. The first validator operation freezes evidence. The second judges the frozen record. Only three normalized fields need agreement; prose rationale is non-consensus metadata. Everything after that—appeal rights, ranking, prize credit, withdrawal, and credentials—is deterministic.”
