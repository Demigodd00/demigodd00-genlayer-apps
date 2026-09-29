# ATTEST — Project Explorer submission

Use these fields for the GenLayer Project Explorer form. The contribution date should match the day the form is actually sent; 29/09/2026 is the date for this prepared entry. No portal submission has been sent.

## 1. Project identity

**Project name:** ATTEST

**Primary tag:** AI & Agents

**Tag 1:** Source Verification

**Tag 2:** Verifiable Inference

**Contribution date:** 29/09/2026, if submitting today

**Logo:** Upload [the ATTEST PNG](assets/attest/attest-logo.png). It is 1024 × 1024 pixels and under 2 MB.

## 2. One-liner

> Bond-backed public claims resolved by GenLayer validators against locked rules and web evidence.

## 3. Description

Paste this into the description field (under 1,000 characters):

> ATTEST is a GenLayer StudioNet app for bonded public claims. An author locks a factual statement, verification rule, public HTTPS sources, review deadline and GEN bond on-chain. A challenger stakes a counter-bond and supplies counter-evidence; the author can respond once. After the deadline, GenLayer validators independently fetch the declared sources and assess the fixed rule. Consensus stores evidence snapshots, hashes, citations and a SUPPORTED, DISPROVEN or INCONCLUSIVE outcome. The contract credits both bonds to the winning party or refunds each side when evidence is inconclusive. Unchallenged claims return the author's bond without certifying truth; withdrawals are recipient initiated. The live demo uses synthetic, project-controlled evidence and valueless test GEN on StudioNet.

## 4. Demo video

Optional. Leave blank unless a public ATTEST walkthrough video is available.

## 5. How-to instructions

Add these as separate steps:

1. **Open the live docket.** Open the [ATTEST website](https://attest-web-silk.vercel.app). No wallet is needed to review the existing claims. Confirm the StudioNet live indicator and open [att-1](https://attest-web-silk.vercel.app/?claim=att-1).
2. **Inspect the disputed claim.** In att-1's claim file, review the fixed verification rule, terms digest, source URLs, and challenger case. The final determination is DISPROVEN. Inspect the stored line citations, then expand “View evidence snapshots and hashes.”
3. **Check unavailable evidence.** Open [att-2](https://attest-web-silk.vercel.app/?claim=att-2). Its declared sources were unavailable, so the challenged claim finalized INCONCLUSIVE and each side recovered its own bond.
4. **Check the uncontested path.** Open [att-3](https://attest-web-silk.vercel.app/?claim=att-3). It finalized UNCONTESTED, returning the author's bond without making a truth judgment.
5. **Verify settlement.** Open the [public acceptance journal](../deployments/attest_acceptance.json) and [reviewer guide](ATTEST_REVIEW.md). They link the finalized transactions, final claim records, and native child transfers for the author and challenger withdrawals. The [read-only verifier](../scripts/check_attest_release.py) can check these records without wallet keys.

## 6. Expected verification outcome

Paste this into the expected-outcome field (under 500 characters):

> Without a wallet, att-1 shows DISPROVEN with citations and evidence hashes; att-2 shows INCONCLUSIVE after unavailable sources; att-3 shows UNCONTESTED without a truth judgment. The public journal and read-only verifier confirm 13 finalized transactions, 16 passing checks, and exact test-GEN withdrawal credits of 0.009 to the author and 0.006 to the challenger.

**Contract link 1:** [ATTEST StudioNet contract](https://explorer-studio.genlayer.com/address/0x3aFF086e8AAa7707b29ad88a9ebDf581d2d6Ef41)

## 7. Project links

**Website:** [ATTEST live app](https://attest-web-silk.vercel.app)

**GitHub:** [ATTEST release branch](https://github.com/Demigodd00/demigodd00-genlayer-apps/tree/codex/attest-review)

The branch link is essential while the [ATTEST pull request](https://github.com/Demigodd00/demigodd00-genlayer-apps/pull/1) remains unmerged; the repository's default branch does not yet contain this release.

## 8. Evidence and supporting information

Use **Add Evidence** for each URL separately, in this order:

1. **Required GitHub source:** [ATTEST release branch](https://github.com/Demigodd00/demigodd00-genlayer-apps/tree/codex/attest-review)
2. **Reviewer instructions and limitations:** [ATTEST reviewer guide](ATTEST_REVIEW.md)
3. **Completed settlement demonstration:** [Public acceptance journal](../deployments/attest_acceptance.json)
4. **Intelligent contract implementation:** [ATTEST contract source](../contracts/attest.py)
5. **Deployed contract:** [StudioNet explorer](https://explorer-studio.genlayer.com/address/0x3aFF086e8AAa7707b29ad88a9ebDf581d2d6Ef41)
6. **Working application:** [Public ATTEST app](https://attest-web-silk.vercel.app)
7. **Release review:** [ATTEST pull request](https://github.com/Demigodd00/demigodd00-genlayer-apps/pull/1)

The demo evidence is synthetic and project-controlled; do not describe it as proof of an independent real-world event. The hosted browser-wallet signing path, a live SUPPORTED claim, and the seven-day timeout were not exercised in this acceptance run. The pull request also has two failed Vercel preview statuses from unrelated OutageBond and UptimeBond project settings; ATTEST's production app is live and its GitHub Actions checks pass.

This GitHub repository has hosted other projects. If the portal rejects the branch URL as already submitted or requires a repository root URL, use a dedicated ATTEST repository with the same release source and evidence before retrying. Do not treat changed URL spelling as proof that a duplicate project has been accepted.
