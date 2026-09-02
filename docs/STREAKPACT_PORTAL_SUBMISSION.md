# StreakPact: GenLayer Portal submission

Use this record for the StreakPact V2.1 submission only.

## Form fields

- **Contribution type:** Project
- **Contribution date:** 29/08/2026
- **Title:** StreakPact — wallet-attested accountability on GenLayer
- **Creator:** demigodd00
- **Live app:** https://streakpact-zeta.vercel.app
- **Network:** GenLayer StudioNet (`61999`)
- **Contract:** `0xa878379DE7398da0F6Ac6cF1AE32d6CA4e9062c2`

## Notes / description

StreakPact by demigodd00 is a wallet-attested accountability app built on GenLayer StudioNet. A user creates a self-stake pact or matched challenge, defines measurable success criteria, and fixes either their own wallet or an independent verifier wallet as the evidence attestor. For every check-in, the attestor submits an activity statement, observation time, public evidence URL, and SHA-256 digest in a signed GenLayer transaction. The contract binds the signer, subject, period, statement, time, and exact evidence bytes into a canonical attestation ID before validators judge whether the evidence satisfies the pact.

GenLayer is central to the outcome: validator consensus records `KEPT`, `MISSED`, or inconclusive evidence and directly controls provisional settlement and test-GEN eligibility. Appeals are signed by an authorized participant and stored as separate adjudication records; the original verdict, evidence, signer, and digest remain available for audit. The web app supports MetaMask, evidence publishing, transaction-finality feedback, appeals, claims, and a read-only protocol status page.

This is a zero-fee StudioNet demonstration. Test GEN has no monetary value. A wallet signature proves who made an attestation; it does not by itself prove that an off-chain activity occurred. Validators still judge the public evidence against the written criteria, and testers must use only synthetic, non-sensitive evidence.

## Evidence links

Add these separately in the Portal:

1. **GitHub Repository — required:** https://github.com/Demigodd00/demigodd00-genlayer-apps
2. **GenLayer Explorer Contract:** https://explorer-studio.genlayer.com/address/0xa878379DE7398da0F6Ac6cF1AE32d6CA4e9062c2
3. **GitHub File:** https://github.com/Demigodd00/demigodd00-genlayer-apps/blob/main/contracts/streak_pact_v2.py
4. **Other — live product:** https://streakpact-zeta.vercel.app

The repository is a public portfolio monorepo. Review this contribution using the StreakPact-specific contract, Explorer, source, and live-app links above.

## Reviewer quick check

1. Open the live app and confirm it identifies StudioNet and valueless test GEN.
2. Open **App status** and verify contract version `2.1.0`, zero fee, wallet-attested evidence, immutable original/appeal records, and the Explorer address above.
3. Open https://streakpact-zeta.vercel.app/pacts?pact=sp2-5. P1 shows evidence signed by an independent verifier wallet; P2 preserves the original `MISSED / AUTO_MISS` record beside the maker's signed successful appeal.
4. Open https://streakpact-zeta.vercel.app/pacts?pact=sp2-6. This is a settled two-wallet challenge with signed maker and challenger appeal records.
5. Compare the app views with the public exact-release journal linked below. It records 42 finalized contract transactions, 29 successful executions, 13 expected rejections, 29 state assertions, and six credited transfer receipts.
6. If creating a new pact, select the wallet allowed to attest evidence. Publish only synthetic, non-sensitive JSON or text because evidence files are public.

## Release evidence

- Deployment record: [`deployments/streak_pact_v2_studionet.json`](../deployments/streak_pact_v2_studionet.json)
- V2.1 acceptance journal: [`deployments/streak_pact_v2_1_acceptance.json`](../deployments/streak_pact_v2_1_acceptance.json)
- Hosted checks: [`deployments/streak_pact_v2_hosted_checks.json`](../deployments/streak_pact_v2_hosted_checks.json)
- Deployment status: [`docs/STREAKPACT_DEPLOYMENT_STATUS.md`](STREAKPACT_DEPLOYMENT_STATUS.md)
- Architecture: [`docs/architecture/streakpact-v2.md`](architecture/streakpact-v2.md)

The V2.0 contract and its fixtures are archived release history and are not evidence for this submission.
