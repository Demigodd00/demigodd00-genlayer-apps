# ATTEST — reviewer entry

ATTEST lets users and agents put test-GEN bonds behind public claims with fixed rules, evidence sources, and review deadlines. A challenger can post a counter-bond. After the deadline, GenLayer independently evaluates the public record and the contract routes both bonds according to the agreed outcome.

## Open the product

- [Live ATTEST app](https://attest-web-silk.vercel.app)
- [StudioNet contract](https://explorer-studio.genlayer.com/address/0x3aFF086e8AAa7707b29ad88a9ebDf581d2d6Ef41)
- [Reviewable release source](https://github.com/Demigodd00/demigodd00-genlayer-apps/tree/codex/attest-review/apps/attest-web) and [pull request](https://github.com/Demigodd00/demigodd00-genlayer-apps/pull/1)
- [Contract source](../contracts/attest.py), [architecture](architecture/attest.md), and [release checks](ATTEST_REVIEW.md)
- [Verified deployment](../deployments/attest_studionet.json) and [hosting manifest](../deployments/attest_vercel.json)

No wallet is needed to read the public docket, claim terms, linked sources, or finalized evidence snapshots. A compatible browser wallet is needed to post or challenge claims on StudioNet. StudioNet test GEN has no monetary value.

## What it does

ATTEST turns a factual public statement into a bonded commitment. The author fixes the wording, verification rule, source URLs, deadline, and bond on-chain. A challenger posts a counter-bond and their own public sources. After the review deadline, anyone can request GenLayer adjudication. Validators independently fetch the sources and assess the locked rule. An agreed `SUPPORTED` or `DISPROVEN` outcome credits both bonds to the winning side; `INCONCLUSIVE` refunds both. Uncontested claims return the author's bond without claiming a truth judgment. Credits are withdrawn by the recipients themselves.

GenLayer is essential to the product because the dispute turns on interpreting public evidence under a claim-specific rule. The contract requires a validator to fetch the sources independently, match the leader's exact evidence snapshots and citations, and agree on the outcome before settlement. No administrator chooses the verdict or reroutes the bonds.

## Scope of the demonstration

The acceptance claims use two public, project-controlled text fixtures: [register](https://attest-web-silk.vercel.app/evidence/demo-register.txt) and [audit](https://attest-web-silk.vercel.app/evidence/demo-audit.txt). They are clearly marked synthetic. They prove the adjudication and bond flow, not an independent real-world grant distribution. One claim intentionally uses a missing source to exercise the unavailable-evidence result. The [public acceptance journal](../deployments/attest_acceptance.json) records 13 finalized transactions, 16 passing checks, and the final `DISPROVEN`, `INCONCLUSIVE`, and `UNCONTESTED` claims. The author and challenger withdrew 0.009 and 0.006 test GEN respectively; both native child transfers finalized with `value_credited=true` and exact recipient balance increases. Reviewers can run the [read-only verifier](../scripts/check_attest_release.py) without the test-wallet keys. See the [reviewer guide](ATTEST_REVIEW.md) for claim links, verdict receipts, and limitations.

The review window is one hour on StudioNet. The seven-day unresolved-claim timeout and other time-dependent edge cases are covered by direct tests rather than accelerated on the shared chain. The app and contract are an experimental testnet demonstration, not a mainnet deployment or a security audit.
