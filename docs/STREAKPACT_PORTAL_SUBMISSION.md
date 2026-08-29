# StreakPact: GenLayer Portal submission

Use this record for the StreakPact V2 submission only.

## Form fields

- **Contribution type:** Project
- **Contribution date:** 29/08/2026
- **Title:** StreakPact — evidence-backed accountability on GenLayer
- **Creator:** demigodd00
- **Live app:** https://streakpact-zeta.vercel.app
- **Network:** GenLayer StudioNet (`61999`)
- **Contract:** `0xae785A6DF3a2AA204A5E64FC02246d17b3fc38a6`

## Notes / description

StreakPact by demigodd00 is an evidence-backed accountability app built on GenLayer StudioNet. A user creates a self-stake pact or matched challenge, defines measurable criteria, and submits a content-addressed public evidence file for each period. GenLayer validators compare that evidence with the pact criteria and reach a reproducible verdict. The contract accounts for missed periods, locks provisional outcomes during a five-minute appeal window, and releases valueless test GEN only after final settlement.

GenLayer is central to the workflow: validator judgment changes the pact’s consensus state and payout eligibility. The web app provides MetaMask connection, pact creation and sharing, IPFS evidence publishing, transaction finality feedback, appeals, claims, and a read-only owner status page. The deployed StudioNet contract, release provenance, direct tests, hosted acceptance records, and source are included in the repository.

This is a StudioNet demonstration. Test GEN has no monetary value, and validators judge whether the supplied public file satisfies the written criteria; StreakPact does not independently prove off-chain physical activity.

## Evidence links

Add these separately in the Portal:

1. **GitHub Repository — required:** https://github.com/Demigodd00/streakpact
2. **GenLayer Explorer Contract:** https://explorer-studio.genlayer.com/address/0xae785A6DF3a2AA204A5E64FC02246d17b3fc38a6
3. **GitHub File:** https://github.com/Demigodd00/streakpact/blob/main/contracts/streak_pact_v2.py
4. **Other — live product:** https://streakpact-zeta.vercel.app

The repository is private by design. Confirm that the Portal’s connected GitHub account or assigned reviewers can open it before submitting. If the Portal cannot validate the link, grant reviewer access; do not change repository visibility without the owner’s explicit approval.

## Reviewer quick check

1. Open the live app and confirm the banner says StudioNet and that test GEN has no monetary value.
2. Open **App status**. All four release gates should show **Configured**, and the contract card should open GenLayer Explorer.
3. Open the public pact view at https://streakpact-zeta.vercel.app/?pact=sp2-7&view=dashboard. It is a deliberately cancelled MetaMask-created pact and should show `VOIDED`, `0.01 GEN`, and `refunded`.
4. Connect MetaMask on StudioNet to create a self-pact. The hosted examples are designed for the deployed one-minute period configuration.
5. Publish only synthetic, non-sensitive JSON or text evidence. Evidence files are public.

## Release evidence

- Deployment record: [`deployments/streak_pact_v2_studionet.json`](../deployments/streak_pact_v2_studionet.json)
- Contract acceptance journal: [`deployments/streak_pact_v2_acceptance.json`](../deployments/streak_pact_v2_acceptance.json)
- Hosted checks: [`deployments/streak_pact_v2_hosted_checks.json`](../deployments/streak_pact_v2_hosted_checks.json)
- Deployment status: [`docs/STREAKPACT_DEPLOYMENT_STATUS.md`](STREAKPACT_DEPLOYMENT_STATUS.md)
- Architecture: [`docs/architecture/streakpact-v2.md`](architecture/streakpact-v2.md)

Real MetaMask creation transaction for `sp2-7`: `0x627ab1c09f1626df2b49fe37745ce77fdc68079cf084715c048e606e08772339`.
