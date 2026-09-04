# StreakPact: GenLayer Portal submission

Use this record for the StreakPact V2.2 submission only. Do not submit the old
V2.0 or V2.1 contract addresses.

## Form fields

- **Contribution type:** Project
- **Contribution date:** 29/08/2026
- **Title:** StreakPact — wallet-attested accountability on GenLayer
- **Creator:** demigodd00
- **Live app:** https://streakpact-zeta.vercel.app
- **Network:** GenLayer StudioNet (`61999`)
- **Contract:** `0x386Baf8F5C543429a8d513F183271513ae59BC81`

## Notes / description

StreakPact by demigodd00 is a wallet-attested accountability app on GenLayer
StudioNet. A user creates a self-stake pact or optional matched challenge,
defines measurable criteria, and sets a self or independent wallet as attestor.
Each check-in signs a statement, period-bounded
observation time, public evidence URL, and SHA-256 digest. GenLayer validators
fetch the exact artifact, verify its digest, judge it against the criteria, and
record `KEPT`, `MISSED`, or inconclusive. That consensus controls
provisional settlement and test-GEN eligibility. Appeals create separate signed
records, preserving the complete original and appealed audit trail. V2.2 rejects
zero-address roles and invalid or oversized evidence without silent truncation.
The app supports MetaMask, evidence publishing, appeals, claims, and status.
StudioNet GEN has no monetary value; a
signature identifies the claimant but does not prove the real-world activity.
Only synthetic, non-sensitive evidence should be used.

## What did you change?

Updated StreakPact to V2.2 and deployed a replacement StudioNet contract. The
contract and publisher now reject invalid UTF-8 and evidence over either 8,000
characters or 100 KB instead of judging a truncated prefix. Zero treasury,
failure-recipient, and evidence-attestor addresses are rejected. The contract
returns complete adjudication reasons, while the UI exposes every original and
appealed record in an expandable audit trail. Observation inputs now preserve
seconds and are checked against exact period boundaries before signing. I added
regression tests, completed a 50-transaction exact-release matrix with seven
verified transfers, passed real StudioNet validator consensus, updated Vercel
to the new address, and replaced all reviewer evidence with V2.2 links.

## Evidence links

Add these as separate Portal evidence items:

1. **GitHub Repository — required:** https://github.com/Demigodd00/demigodd00-genlayer-apps
2. **GenLayer Explorer Contract:** https://explorer-studio.genlayer.com/address/0x386Baf8F5C543429a8d513F183271513ae59BC81
3. **GitHub File:** https://github.com/Demigodd00/demigodd00-genlayer-apps/blob/b76c816a0e947c1b06fda184b19367b03221ca76/contracts/streak_pact_v2.py
4. **Other — live product:** https://streakpact-zeta.vercel.app
5. **GitHub File — exact-release journal:** https://github.com/Demigodd00/demigodd00-genlayer-apps/blob/b76c816a0e947c1b06fda184b19367b03221ca76/deployments/streak_pact_v2_2_acceptance.json

The repository is a public portfolio monorepo. Review this contribution using
the StreakPact-specific contract, pinned source, Explorer, journal, and live-app
links above.

## Reviewer quick check

1. Open the live app and confirm it identifies StudioNet and valueless test GEN.
2. Open **App status** and verify version `2.2.0`, zero fee, address
   `0x386Baf8F5C543429a8d513F183271513ae59BC81`, 8,000-character/100-KB evidence
   limits, wallet attestations, and immutable original/appeal records.
3. Open https://streakpact-zeta.vercel.app/pacts?pact=sp2-6 for an
   independent-verifier self pact with preserved original and appeal records.
4. Open https://streakpact-zeta.vercel.app/pacts?pact=sp2-7 for a settled
   two-wallet challenge with signed appeals and an expandable complete audit.
5. Compare those views with the exact-release journal: 50 finalized contract
   transactions, 33 successful executions, 17 expected rejections, 34 state
   assertions, and seven credited native transfers.
6. If creating a pact, publish only synthetic, non-sensitive JSON or text
   because evidence is public and content-addressed.

## Release evidence

- Deployment record: [`deployments/streak_pact_v2_studionet.json`](../deployments/streak_pact_v2_studionet.json)
- V2.2 acceptance journal: [`deployments/streak_pact_v2_2_acceptance.json`](../deployments/streak_pact_v2_2_acceptance.json)
- Hosted checks: [`deployments/streak_pact_v2_hosted_checks.json`](../deployments/streak_pact_v2_hosted_checks.json)
- Deployment status: [`docs/STREAKPACT_DEPLOYMENT_STATUS.md`](STREAKPACT_DEPLOYMENT_STATUS.md)
- Architecture: [`docs/architecture/streakpact-v2.md`](architecture/streakpact-v2.md)

V2.0 and V2.1 are archived release history and are not submission evidence.
