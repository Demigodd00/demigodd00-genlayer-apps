# Milestone 1 — Transparent Scorecards & Score Appeals

Release: Hackathon Judge v3.0.1, GenLayer StudioNet.

## Submission copy

Title: Transparent Scorecards & Score Appeals

Description (under 1,000 characters):

Hackathon Judge v3 adds auditable weighted scorecards and criterion-specific appeals to the accepted project. Organizers lock 2–4 natural-language criteria with weights totaling 100%. Validators independently judge frozen, wallet-bound evidence and agree on eligibility and each criterion’s score band; code checks citation locations and calculates exact weighted totals. Eligible entrants can appeal one criterion once without changing the others. Original and revised scorecards, evidence excerpts, digests and ranking changes remain publicly inspectable. A shared appeal window starts after all initial decisions finish or time out, and settlement is blocked until the window closes and pending appeals are handled. This is a separate StudioNet deployment; the accepted v2.3 contract and evidence remain unchanged. Controlled live fixtures demonstrate the workflow using simulated GEN, not real-user traction.

Primary tag: AI & Agents. Suggested focus tags: Verifiable Inference and AI Policy Enforcement.

## What changed beyond the accepted project

| Accepted v2.3 baseline | New v3 milestone |
| --- | --- |
| One overall score band | 2–4 immutable weighted criteria and exact integer totals |
| Overall rationale and frozen evidence | Per-criterion rationales and bounded, checked citations into that evidence |
| Appeals for negative/inconclusive decisions | Eligible entrants may also appeal one criterion once |
| Original eligibility/score fields | Canonical original and revised scorecards with parent digests and history view |
| Individual appeal deadlines | One common window after all initial decisions complete or time out |
| Provenance checks before settlement | Provenance plus scorecard integrity, closed-window and pending-appeal checks |

The repository/wallet provenance feature was already in the accepted release. It is retained here, not claimed again as the milestone's new work.

## Links in submission order

1. Website: https://hackathon-judge-studionet.blazekingsley2.chatgpt.site/
2. Repository: https://github.com/Demigodd00/demigodd00-genlayer-apps
3. New contract: https://explorer-studio.genlayer.com/address/0xF37518553b89e1874DA6c459e9cFb0312298Ab60
4. Milestone notes and reviewer path: https://github.com/Demigodd00/demigodd00-genlayer-apps/blob/main/docs/HACKATHON_JUDGE_MILESTONE_1.md
5. New contract source: https://github.com/Demigodd00/demigodd00-genlayer-apps/blob/main/contracts/hackathon_judge_scorecards.py
6. Live acceptance receipts: https://github.com/Demigodd00/demigodd00-genlayer-apps/blob/main/deployments/hackathon_judge_scorecards_v3_0_1_demo.json
7. One-minute walkthrough: https://hackathon-judge-studionet.blazekingsley2.chatgpt.site/hackathon-judge-v3-walkthrough.mp4

The walkthrough is a captioned slideshow of actual app captures backed by live contract views, not a continuous screen recording. The optional YouTube field should be left blank unless you upload the video to YouTube yourself; the MP4 link belongs in supporting evidence.

Keep the accepted project as the parent project when creating the milestone. Do not submit this as a duplicate original project. The program's reviewers determine acceptance and points.

## Reproducible reviewer path

No wallet is needed to inspect the recorded demonstration.

1. Open the website and select **Transparent Scorecards — Milestone 1** (`hj-1`) on the v3 contract.
2. Read the locked rubric: Implementation 40%, Reproducibility 40%, Reviewer clarity 20%.
3. Find **Score Appeal Fixture** in the submission docket and choose **View scorecard**.
4. Compare its original and effective totals and ranks. Inspect **Reproducibility**, the appealed criterion. The other two criterion records must remain unchanged.
5. Expand a cited evidence range to read the exact frozen excerpt. Expand **Original rationale and references** and **Inspect immutable records and digests** to compare both records and their parent link.
6. Close the scorecard and choose **Inspect snapshot**. The dialog includes both the original snapshot and an **Appeal evidence** section for the addendum. Each package carries its wallet, repository, contract, event and parent binding.
7. Inspect the finalized event and the public receipt file. The negative settlement attempt must have failed before the shared window closed; the final settlement and withdrawal must have succeeded.

## Technical verification

From a fresh checkout with Python 3.12 and the pinned Node/pnpm toolchain:

```sh
pip install -r requirements-deploy.txt
python scripts/prepare_gltest_runner.py
genvm-lint check contracts/hackathon_judge_scorecards.py
pytest tests/direct/test_hackathon_judge.py tests/direct/test_hackathon_judge_scorecards.py tests/test_hackathon_judge_rpc.py -q
pytest tests/integration/test_hackathon_judge_scorecards_studionet.py -v -s
cd apps/hackathon-judge-web
pnpm install --frozen-lockfile
pnpm check
pnpm audit:prod
```

On a Windows terminal with a legacy encoding, set `PYTHONIOENCODING=utf-8` before running the linter. The live readback test signs no writes and needs no private key. The seeder is a separate, explicit three-phase write workflow: prepare, publish original proofs, submit, publish appeal proof, finish. Its journal preserves submitted hashes for safe resumption; do not rerun it against another deployment without preserving and reconciling its existing record.

Direct tests inject controlled nondeterministic inputs and do not establish network consensus. Live receipts and readback are the separate consensus evidence. No test enables leader-only mode, simulated LLM responses or vote overrides in the live run.

## Consensus and security boundaries

- Each validator independently generates a scorecard; eligibility and all criterion bands must agree exactly. Confidence buckets may differ by 20. Reasons and valid citation choices may differ.
- v3.0.1 asks the model for single-line references and allows one schema-repair attempt per validator after invalid output. Both attempts remain subject to the same evidence/rubric checks; repair does not accept invalid data, force a score or bypass independent validation. Persistent invalid output still fails closed and resolution may be retried.
- Scores are 0, 20, 40, 60, 80 or 100. Total basis points = sum(score × integer weight), out of 10,000. Ranking and minimum-score checks never use rounded display values. Earlier submission wins a tie.
- Every positive criterion score needs 1–2 evidence citations. Each citation spans at most five lines and 1,200 characters; code derives its excerpt from a frozen snapshot. This proves location and integrity, not factual truth or semantic relevance.
- Eligible score appeals preserve eligibility and every untargeted criterion. Scores may increase or decrease. Ineligible/inconclusive entries may instead appeal eligibility and receive a new complete scorecard.
- The common window opens after all initial decisions finish or time out. A pending appeal blocks settlement even after the window closes. Permissionless 24-hour timeout handling prevents permanent deadlock; timed-out work becomes inconclusive, not a fabricated AI score.
- Settlement rechecks the original/current scorecard digests, rubric, evidence package bindings and appeal parent links. AI does not choose weights, perform prize arithmetic or transfer funds.
- Public GitHub files must contain the exact wallet challenge and pass the existing default-branch repository checks. This is evidence of repository control and wallet binding, not identity, legal ownership or an independent security audit.
- StudioNet GEN is simulated. This milestone does not claim real-money readiness, real entrants, external adoption, guaranteed fair/correct judgments or multi-winner payouts.

## Preserved baseline

- Accepted contract: https://explorer-studio.genlayer.com/address/0x6fD9B65001B0eEF5CC98A95D20A1c693C0D04FBA
- Accepted source: `contracts/hackathon_judge.py`, SHA-256 `dce90861bfed11d9ec9f34c4b10a5523f0881df770c2beb067cac7cf7594d506`.
- Existing deployment and demo records remain `deployments/hackathon_judge_studionet.json` and `deployments/hackathon_judge_demo.json`.
- New source SHA-256: `cba8e36264b29df1465cc02645d580b1b266963f5fbd105950a2ea0e40ec4ad0`.
- New deployment transaction: `0x8b5253aaabf0dbb4b0911a2cdf9fc66428b6d788e4f7ab5bbb83a80d21ff5db8`.

## Disclosed pre-release failure and patch

The first v3.0.0 trial at `0xCBebB5EDAf1323A6561d1b96911306E531355c1d` accepted both entries and produced 80/100 and 64/100 initial scores. Two resolution transactions failed consensus because of invalid citation ranges. No revised score or prize release was accepted. That trial is not counted as the successful milestone demonstration.

Its source is retained at `contracts/archive/hackathon_judge_scorecards_v3_0_0.py`; deployment and demo journals are in `deployments/history/hackathon_judge_scorecards_v3_0_0_*.json`. The immutable trial remains appeal-pending, with 0.001 simulated GEN subject to its existing 24-hour timeout path. It holds no real funds. v3.0.1 is a separate deployment with single-line model references and bounded repair; original wallet proof checks, independent scoring consensus and settlement validation remain enforced.

## Verified live outcome — September 14, 2026

The v3.0.1 acceptance run completed at `2026-09-14T03:34:56Z` with both entries eligible, one resolved criterion appeal, a finalized winner and successful withdrawal of 0.001 **simulated** GEN. No failed resolution retry was needed on this deployment.

| Score Appeal Fixture | Original | After appeal |
| --- | ---: | ---: |
| Implementation (40%) | 80 | 80 |
| Reproducibility (40%) | 40 | 100 |
| Reviewer clarity (20%) | 80 | 80 |
| Exact weighted total | 64 | 88 |
| Rank | 2 | 1 |

The control fixture stayed at 80/100. Original criterion records, rationale and citations were preserved byte-for-byte for untargeted criteria. Original scorecard digest: `27e4edd53d7f39a562ccba6e927008b55fbdf7fd8e34c5d31912abef68fa4e14`. Revised digest: `d1a477a7c7b4e55c42a6b0b2ef002e9e82479816f215b76f9b657f947a1d2a70`.

Key transactions (the full journal links each to its method, sender, arguments and checked result):

- Rejected wrong-wallet replay: `0xc5008783d2c079ca2f42dd7f5f9b03cc175bce52bbb11566417cf00db5af6c56`.
- Rejected premature settlement: `0xa35c8a27c322c8fc83cd3aea40d85df04aaf3da4c8b66463fb3fd3fd6e8352d7`.
- Successful score resolution: `0x603928c57b035c0323631b04c56983e52bf294d4365d29710f234dbf36db9518`.
- Final settlement: `0x0c234db709bc4bf434674d55fac2e692318fefe1c93fcb6f56c48c6c74b0c1a1`.
- Winner withdrawal: `0x58800de20ae5562aae6d2cc14c89375ad320a7fcb5de994b75c9f5fca421bb73`.

Expected verification outcome for the submission form:

> On v3.0.1, room hj-1 is FINALIZED with two eligible entries. Score Appeal Fixture changes from 64 to 88 points and rank 2 to rank 1 after a reproducibility-only appeal. Its original scorecard and the other two criterion records remain unchanged. The control stays at 80. Public receipts prove rejection of a wrong-wallet replay and premature settlement, followed by successful finalization and withdrawal of 0.001 simulated GEN. Winner credit is zero after withdrawal.

Release checks: 95 direct contract/RPC tests (including 48 milestone tests), 20 frontend tests, contract lint, frontend typecheck/lint/build, and one independent live readback test passed. The live test recomputes digests, citation excerpts and totals and verifies actual transaction receipts rather than trusting the journal's success labels. The 60-second video was fully decoded without errors. The production dependency audit found no known vulnerabilities.

The public website was published successfully as site version 10 at `2026-09-14T03:49:56Z`, preserving its public audience. HTTP checks confirmed the published assets use the v3.0.1 contract and the new MP4 is accessible. The exact site source commit is `7ed841c6ead6b89b67b94e8de543650bd2e2e763`; deployment details are in `deployments/hackathon_judge_site.json`, and the accepted version 9 record is preserved in `deployments/history/hackathon_judge_site_v9.json`. Both release gates passed in the [dedicated Hackathon Judge CI run](https://github.com/Demigodd00/demigodd00-genlayer-apps/actions/runs/34803440460). The live readback was run separately; CI's manually triggered StudioNet job was not run for this push.
