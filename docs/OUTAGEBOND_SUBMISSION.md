# OutageBond — reviewer guide

## Open the product

- [Live app](https://outagebond.vercel.app)
- [Finalized protocol status](https://outagebond.vercel.app/status)
- [Policy guide](https://outagebond.vercel.app/how-it-works)
- [StudioNet contract](https://explorer-studio.genlayer.com/address/0x2893BfB51B80A3ABEE168732f1B3bF86Cde08082)
- [Release source](https://github.com/Demigodd00/demigodd00-genlayer-apps/tree/codex/outagebond-review-fixes/apps/outagebond-web)
- [Contract source](../contracts/outage_bond.py), [review fixes](OUTAGEBOND_REVIEW.md), [deployment proof](../deployments/outage_bond_studionet.json)

No wallet is needed to inspect coverage, claim evidence, the consensus verdict, or protocol counters. A compatible browser wallet is needed to send writes on StudioNet chain 61999; the app requests that chain explicitly. StudioNet GEN has no monetary value.

## Why GenLayer is essential

The protocol needs validators to interpret public incident reports, not merely trust a signed status flag. Each validator fetches both pages independently and extracts service/region identity, outage status, timestamps, and confidence. Deterministic code derives the decision and rejects near-threshold disagreements, uncovered intervals, calendar-day replay, and noncanonical leader metadata. Only agreed evidence can reserve an eligible payout for the named beneficiary.

Provider collateral, immutable coverage terms, claim submission, permissionless attestation, fixed beneficiary payout, and unused-collateral recovery all execute in the native intelligent contract. No administrator chooses settlement; protocol fees are zero.

## Live acceptance evidence

The resume-safe acceptance run writes its results to `deployments/outage_bond_acceptance.json`. Its `all_checks_passed` field, finalized transaction hashes, canonical stored claim readings, native child-transfer `value_credited`, and before/after recipient balances are the evidence of success—not a frontend toast or transaction lifecycle status alone.

The named test service is **OutageBond Synthetic API**. Both source reports are openly labeled synthetic and controlled by the demo author. They use separate public hosts, but do not demonstrate independent organizations or a real operational outage. The first fixture case was inconclusive because its wording was ambiguous, and its retry ended `UNDETERMINED`. That original claim remains visible with its normal 24-hour expiry protection. The fresh `eligible-v2` case uses structured synthetic facts. The acceptance history retains the inconclusive claim and failed-consensus hash rather than presenting every attempt as successful.

Review the coverage records for the eligible, short, and unavailable-source cases. The acceptance journal maps their exact coverage/claim IDs and transaction hashes. Payout and wrong-wallet/double-collection checks use dedicated recoverable test accounts, never another app's keys.

## Reproduce and inspect

See [release instructions](OUTAGEBOND_RELEASE.md) for lint, tests, frontend build, deployment reconciliation, and live acceptance. The dedicated GitHub Actions workflow runs contract lint/regressions and frontend tests/typecheck/build. A known confirmation timeout retains its original request/ref/hash and blocks another write until reconciled; users must not clear browser storage to retry.

Long-duration claim expiry, payout expiry, provider refund, and cross-midnight adversarial cases are covered by direct-mode time-controlled tests. They were not accelerated on the shared live chain. Native payout credit is separately checked live. This submission is an experimental testnet demo, not insurance, a security audit, or a financial-safety certification. No submission portal has been sent automatically.
