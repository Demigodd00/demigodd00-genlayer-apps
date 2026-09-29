# ATTEST reviewer guide and release gate

**Status: live StudioNet release; settlement acceptance verified.** The contract is deployed and source-verified, the public app is hosted, and three synthetic test claims have finalized. The [acceptance journal](../deployments/attest_acceptance.json) records `all_checks_passed: true`; the independent read-only verifier also passed against StudioNet.

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

The resume-safe [acceptance script](../scripts/attest_acceptance.py) uses dedicated test wallets. It recorded 13 finalized transactions and 16 passing checks, including a deliberately failed invalid-source post whose deposit credit remained recoverable. It never blindly resends a write after a hash is known. Reviewers can run `python scripts/check_attest_release.py` to [verify the public journal](../scripts/check_attest_release.py) against StudioNet without the test-wallet keys; this passed for all 13 receipts, final claim records, stored evidence digests and citations, and two native withdrawal transfers.

| Case | On-chain record | Final result |
| --- | --- | --- |
| Readable register and audit contradict a four-recipient claim | [att-1](https://attest-web-silk.vercel.app/?claim=att-1) | `DISPROVEN`; the snapshot cites register line 6 and audit lines 3 and 5; both bonds credited to the challenger |
| Both declared source URLs return 404 | [att-2](https://attest-web-silk.vercel.app/?claim=att-2) | `INCONCLUSIVE`; each side recovered its own bond |
| No challenge before the deadline | [att-3](https://attest-web-silk.vercel.app/?claim=att-3) | `UNCONTESTED`; author bond returned without a truth judgment |

The [DISPROVEN resolution](https://explorer-studio.genlayer.com/tx/0xa88a5875876e75d52bf73875ce08c921ca11f23683f4289db3bbec753b416f48), [INCONCLUSIVE resolution](https://explorer-studio.genlayer.com/tx/0xfe1fb56f2d51a24d5d6c8fc60195622298a4b37a06960ddc06f60ff22ae1d9c0), and [uncontested finalization](https://explorer-studio.genlayer.com/tx/0x246525e7ebf9bc406804d9d4e0a7882400f68887c8d8ded0febd02683a9fcb4c) all finalized with successful execution. The author withdrew **0.009 test GEN** through [this finalized transaction](https://explorer-studio.genlayer.com/tx/0xe87534aa7d0e3e2427978f0245d055e2a628b9086447c389ec2a580bbdf73228) and the challenger withdrew **0.006 test GEN** through [this one](https://explorer-studio.genlayer.com/tx/0xc9e99ed7e2469f45cb912efe8692228ab8b42431abae349c868368f3edb50128). Each emitted one finalized native child transfer with `value_credited=true`; recipient balances rose by the exact amounts and both contract credits cleared. The contract reports zero locked bond and 0.014 test GEN settled across the three claims.

`SUPPORTED` and seven-day timeout behavior are covered by direct-mode tests and are not presented as live-tested here.

## Known limitations

- Both hosted evidence fixtures are synthetic and controlled by this project. They exercise the workflow, but do not establish an independent real-world grant distribution or source trustworthiness.
- URLs are locked at submission, but content is sampled at adjudication. Edited or dynamic pages can cause consensus to fail; after seven days, anyone can return both bonds without a truth verdict.
- Uncontested claims receive their author bond back without a GenLayer judgment. A timeout refund likewise does not certify truth.
- This version allows one challenger, one author response, and no application-level appeal. GenLayer's protocol appeals are distinct from product-level reassessment.
- A deposited balance is recoverable credit, not a claim. The user must separately sign the zero-value posting transaction and later withdraw unused credit.
- This is a StudioNet test-currency demonstration. Fee-charging network policy and fee profiling are not implemented or measured, and the hosted wallet-signing path has not been exercised with a browser extension in this acceptance run.
- No external submission form has been sent automatically.
