# ATTEST reviewer guide and release gate

**Status: live StudioNet release; final settlement acceptance is waiting for the one-hour review deadline.** The contract is deployed and verified, and the public app is hosted. Three synthetic test claims are on-chain. Do not mark the bond-settlement acceptance complete until `deployments/attest_acceptance.json` records `all_checks_passed: true` with finalized transaction and native-transfer evidence.

## Open and inspect

- [Live app](https://attest-web-silk.vercel.app) and [contract explorer](https://explorer-studio.genlayer.com/address/0x3aFF086e8AAa7707b29ad88a9ebDf581d2d6Ef41)
- [Claim att-1: challenged with readable contradictory evidence](https://attest-web-silk.vercel.app/?claim=att-1)
- [Claim att-2: challenged with unavailable evidence](https://attest-web-silk.vercel.app/?claim=att-2)
- [Claim att-3: unchallenged claim](https://attest-web-silk.vercel.app/?claim=att-3)
- [Contract source](../contracts/attest.py), [architecture and limitations](architecture/attest.md), and [submission entry](ATTEST_SUBMISSION.md)
- [Deployment record](../deployments/attest_studionet.json), [hosting manifest](../deployments/attest_vercel.json), and [acceptance journal](../deployments/attest_acceptance.json)

The deployment transaction `0xf5c34952c7d8736efe04738d35b8d04728017f72423cda0949b0812c7852bb12` finalized with successful execution. The deployed Python source and contract configuration match the release source. The source SHA-256 is `9f74091b114516fb59c5980f8a094bd1359b6f6ea73a6af58104fc8d48b4e83c`. The production Vercel deployment `dpl_3XxhbbNNhAKFUyRrijuqV5va4px6` is READY. The public page, fixture URLs, contract link, live docket, and claim-ID deep link were verified without a wallet. The app no longer flashes sample docket rows while its live query loads.

## Why GenLayer is essential

The payout decision depends on interpreting public text under a claim-specific rule. The leader and validator fetch evidence separately, judge independently, and must agree on the outcome. The validator also checks that the proposed source snapshots and line citations match its own fetched record. The contract, rather than the frontend, credits the winning side or refunds both. [GenLayer's use-case guidance](https://docs.genlayer.com/understand-genlayer-protocol/typical-use-cases) calls for explicit criteria, accessible evidence, defined deadlines, and a plan for unavailable evidence. [Its transaction guidance](https://docs.genlayer.com/developers/decentralized-applications/fee-outcomes-and-debugging) requires checking execution success as well as finality.

## Verification completed

On 2026-09-28, `genvm-lint check contracts/attest.py --json` passed; `pytest tests/direct/test_attest.py -q` passed all nine tests; and `pnpm typecheck`, `pnpm build`, and `pnpm audit --prod --audit-level high` passed in a clean ATTEST release checkout. The production app was built and published separately with the verified contract address. The linter notes a newer GenVM runner, but the pinned runner deployed successfully to StudioNet. The clean checkout and public deploy correspond to the same contract source digest.

The resume-safe [acceptance script](../scripts/attest_acceptance.py) uses dedicated test wallets. It records each transaction hash, finalized status, execution result, claim ID, available credit, locked and settled counters, stored evidence snapshots and citations, and native withdrawal child transfers with `value_credited` and before/after recipient balances. The script also posts an invalid claim after a deposit and checks that the failed write leaves the credit recoverable. It never blindly resends a write after a hash is known. Reviewers can run `python scripts/check_attest_release.py` to [verify the public journal](../scripts/check_attest_release.py) against StudioNet without the test-wallet keys. The three live cases target `DISPROVEN`, `INCONCLUSIVE`, and `UNCONTESTED`. `SUPPORTED` and seven-day timeout behavior are covered by direct-mode tests and are not presented as live-tested here.

## Known limitations

- Both hosted evidence fixtures are synthetic and controlled by this project. They exercise the workflow, but do not establish an independent real-world grant distribution or source trustworthiness.
- URLs are locked at submission, but content is sampled at adjudication. Edited or dynamic pages can cause consensus to fail; after seven days, anyone can return both bonds without a truth verdict.
- Uncontested claims receive their author bond back without a GenLayer judgment. A timeout refund likewise does not certify truth.
- This version allows one challenger, one author response, and no application-level appeal. GenLayer's protocol appeals are distinct from product-level reassessment.
- A deposited balance is recoverable credit, not a claim. The user must separately sign the zero-value posting transaction and later withdraw unused credit.
- This is a StudioNet test-currency demonstration. Fee-charging network policy and fee profiling are not implemented or measured, and the hosted wallet-signing path has not been exercised with a browser extension in this acceptance run.
- No external submission form has been sent automatically.
