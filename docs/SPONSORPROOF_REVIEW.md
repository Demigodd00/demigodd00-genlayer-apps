# SponsorProof — reviewer guide

SponsorProof is a two-party sponsorship fulfillment protocol on GenLayer StudioNet. Sponsors and organizers lock prose deliverables, exact public evidence URLs, percentage weights and payment terms. After organizer acceptance and exact funding, the contract freezes wallet-bound publication evidence, obtains independently verified AI decisions and computes allocations deterministically. A shared appeal round, immutable decision history, held-funds resolution and pull-based claims complete the workflow.

## Deployment and source

- [SponsorProof app](https://sponsorproof-studionet.blazekingsley2.chatgpt.site) — public reviewer access enabled on 20 September 2026.
- [Intelligent contract](https://explorer-studio.genlayer.com/address/0x0235c7f7E646bA26532587aFED3108148C92Ef2f)
- [Contract source](https://github.com/Demigodd00/demigodd00-genlayer-apps/blob/main/contracts/sponsorproof.py)
- [Deployment record](https://github.com/Demigodd00/demigodd00-genlayer-apps/blob/main/deployments/sponsorproof_studionet.json)
- [Controlled live run journal](https://github.com/Demigodd00/demigodd00-genlayer-apps/blob/main/deployments/sponsorproof_demo.json)
- [Bilateral appeal run journal](https://github.com/Demigodd00/demigodd00-genlayer-apps/blob/main/deployments/sponsorproof_bilateral_demo.json)
- [Design and security boundaries](https://github.com/Demigodd00/demigodd00-genlayer-apps/blob/main/docs/SPONSORPROOF_DESIGN.md)

Version 1.0.0. Deployment transaction: `0x2708c7bc14843b3f8eb829c1a11f1fbc2ea6d2eb9f91a1e4a9b720be3aff92d9`. Exact source SHA-256: `9c1798d53296836efc5f65ff70d0c90c13c38ad5aeba86060414a3d9dab5dd87`.

## Read-only reviewer path

1. Open SponsorProof, refresh the agreements, and select `sp-2`, **Open Builders Workshop · bilateral appeal demo**, in the agreement selector. Viewing needs no wallet. `sp-1` remains available as the original historical demo.
2. Expand the agreed settlement rules and inspect the two party wallets, immutable terms digest and deadlines.
3. Inspect each of the three weighted commitments and its exact agreed source URL.
4. Expand **Inspect frozen evidence** to read numbered captured text and SHA-256 hashes. These are contract records, not frontend judgments.
5. Compare current outcomes, citations and original decisions. Expand **Both parties’ appeal arguments** and the immutable history records. In `sp-2`, both the sponsor and organizer statements were accepted. The original `sp-1` run contains only the organizer's accepted statement and retains the sponsor's rejected late attempt in its journal.
6. Compare organizer allocation, sponsor refund and held amount against the fixed 100%/50%/0% rule and integer weights. The live journal records actual receipts and claim outcomes; do not treat a pending step as success.

The pages, event, sponsor brand and wallets in this run are controlled acceptance fixtures. They do not establish actual sponsorship, external users, audience numbers or adoption. The app also permits users to create their own agreements.

## Create an agreement

Connect an injected wallet on StudioNet. The sponsor drafts 1–4 text-based public-web commitments whose integer weights total 100%, sets a budget of 0.001–1000 simulated GEN, a delivery deadline and a 1-minute–1-day review window. The app defaults to 60 minutes: allow time for finality and both parties to respond, rather than choosing the minimum. Use a different organizer wallet. The organizer accepts the exact terms digest; the sponsor then sends the exact budget. Use the StudioNet faucet for simulated funding.

The organizer publishes each displayed challenge as its own line on the agreed page, then captures each page before the delivery deadline. Captures are immutable. Both parties can seal early only after every commitment has evidence. Anyone may trigger evaluation after both seals or the delivery deadline. Each party may submit one appeal argument in the common window. Anyone can resolve the shared appeal once the window closes; no new evidence pages are admitted. Settlement is blocked during the review window or pending appeal. Each recipient claims its allocated credit from its own wallet.

Inconclusive allocations stay held. One party can propose a split and the counterparty must accept its exact digest. Seven days after the delivery deadline, unresolved funds can be refunded to the sponsor under the pre-agreed timeout. This refund is not an AI finding of non-delivery. There is no privileged administrator.

## Important limitations

- GEN balances/transfers are simulated by StudioNet. This is not production custody or real-money readiness.
- Evidence support is bounded public UTF-8 text/HTML, not screenshots, PDFs, private analytics or continuous monitoring. Pages needing browser-only JavaScript rendering may not contain reviewable text.
- Both parties approve the source URL; its challenge binds publication control to the organizer and agreement. Neither the hash nor the challenge proves factual truth, human identity or audience reach. A redirect or compromised source can undermine provenance; inspect agreed sources carefully.
- Every validator independently judges the frozen evidence. Exact outcome labels must agree, while wording and valid citation choices may differ. One bounded schema repair is permitted per validator. Invalid output fails closed; no guaranteed first-attempt consensus is claimed.
- Captures require identical normalized text across validators. Rapidly changing pages can fail capture. HTTP failure is not converted into a delivery verdict.
- Missing evidence becomes INCONCLUSIVE, not an automatic misconduct finding. Human agreement or the disclosed timeout resolves held allocations.
- Contract reads and transactions depend on StudioNet availability. The UI retains pending transaction hashes and lets users check receipts instead of automatically resubmitting writes.
- All agreement text and evidence are public on the development chain. Never submit private or sensitive information.

## Reproduce checks

```sh
pip install -r requirements-deploy.txt
python scripts/prepare_gltest_runner.py
genvm-lint check contracts/sponsorproof.py
pytest tests/direct/test_sponsorproof.py -q
pytest tests/integration/test_sponsorproof_studionet.py -v -s
cd apps/sponsorproof-web
npm ci
npx tsc --noEmit --incremental false
node --experimental-strip-types --test tests/protocol.test.mjs
npm run build
```

Use Node 24 and Python 3.12. Direct tests inject controlled web/LLM responses; they do not prove network consensus. The integration test reads actual deployed source, canonical digests, captured excerpts, payment arithmetic and finalized receipts. It performs no writes and needs no private key. The separate seeder signs actual test-network transactions and preserves a resumable journal; do not reset it or blindly duplicate pending writes.

## Verified release results — 20 September 2026

- GenVM lint: passed, with a non-blocking notice that a newer runner exists; deployed source remains pinned to its verified runner.
- Direct contract tests: **32 passed**. These include both-party appeal handling, timeouts, inconclusive holds, mutual splits, duplicate-settlement/withdrawal guards, and an independent validator rejecting a changed outcome.
- Frontend exact-amount/address tests: **4 passed**. TypeScript checking and the production build passed.
- Independent live read-back test: **1 passed** against the deployed source, actual finalized receipts, immutable evidence/decision digests, citations, allocations and cleared claim balances. The test explicitly verifies the late-appeal deviation below; it does not count that attempt as a successful appeal.
- Actual `sp-1` initial and appeal outcomes: website FULFILLED, newsletter PARTIAL, session listing NOT_FULFILLED. Final state SETTLED, organizer **0.00065 simulated GEN**, sponsor **0.00035 simulated GEN**, held **0**. Both claims executed successfully and both claim credits are zero.
- The controlled live run includes three intentionally rejected transactions: outsider acceptance, incorrect funding amount, and premature settlement. It also contains one **unexpected test-plan failure**: the sponsor appeal was submitted after the deliberately short 120-second window. Its finalized rejection, failed expectation and full receipt remain in the journal. Only the organizer appeal was resolved live. Both-party appeal behavior is covered by direct tests, not demonstrated by two accepted live statements in this run.
- Runtime dependency audit (`npm audit --omit=dev`): **0 reported vulnerabilities** after patch updates. The full audit still reports **six development-tool advisories (two low, four moderate)** through the starter's esbuild/tooling dependencies. This is not a clean full audit or a production security certification; do not expose development servers publicly. Breaking starter-toolchain upgrades were not forced.
- The read-only WebMCP agreement inspector was exercised on actual `sp-1` state; invalid input was rejected without altering the selected agreement.

Website version 1 was initially published privately. On 20 September 2026, the owner authorized public access and the Site access policy was changed to public without changing the deployed app. Anyone with the URL can visit. Nothing has been submitted to a contribution portal.

## Receipt-handling fix — version 2

A follow-up review found a frontend blocker in website version 1: it expected normalized `statusName` and `txExecutionResultName`, while StudioNet returned `status_name` and `consensus_data.leader_receipt`. Finalized writes were therefore incorrectly displayed as pending, locking further actions. The earlier Python live test and amount-helper tests did not exercise this frontend adapter.

Version 2 accepts both observed receipt formats, requires explicit successful execution rather than finality/consensus alone, recognizes finalized rejections, and fails closed on missing or conflicting data. The contract and its existing state are unchanged. The fix has passed **16 offline frontend tests plus two actual read-only StudioNet receipt tests**, TypeScript checks and the production build. No new chain transactions were submitted for this fix.

Run `node --experimental-strip-types --test tests/protocol.test.mjs tests/receipts.test.mjs` from `apps/sponsorproof-web` for the offline checks and `node --experimental-strip-types --test tests/receipts.live.test.mjs` for the live frontend-adapter checks.

Publication status: version 2 was successfully published to the existing public website on 20 September 2026 at 21:26 UTC, following owner approval. Reload the app and use **Check receipt** for any previously stuck transaction; do not repeat the original action.

## Separate bilateral appeal demonstration

Agreement `sp-2`, **Open Builders Workshop · bilateral appeal demo**, uses a 600-second shared review window and separate sponsor/organizer wallets and publication challenges. The contract, website version, original `sp-1` record and original fixture pages are unchanged. This remains a controlled demonstration using simulated GEN, not external adoption.

The runner is `scripts/seed_sponsorproof_bilateral.py`. It saves each transaction hash before waiting for finalization, preserves unexpected failures, and resumes known transactions without resubmitting them. Both statements must be present in the APPEAL_OPEN state before resolution; the runner waits for the actual review deadline without any time, validator or web overrides.

The run completed on 20 September 2026 at 21:52 UTC. Both appeal statements executed successfully within the common window. The appeal resolution succeeded after that window closed; its decision digest binds both stored arguments. The original decision and captured evidence remain unchanged.

Final state: **SETTLED**. Website FULFILLED, newsletter PARTIAL, listing NOT_FULFILLED; organizer allocation **0.00065 simulated GEN**, sponsor refund **0.00035 simulated GEN**, held **0**. Both withdrawals executed successfully, both claim credits are zero, and an independent balance read returned those exact amounts in the separate recipient wallets.

| Evidence | Finalized transaction |
| --- | --- |
| Organizer appeal accepted | [View receipt](https://explorer-studio.genlayer.com/transactions/0xf655f752264d1477db839150f71908175ababad9a8bd7308696c8488a6361838) |
| Sponsor appeal accepted | [View receipt](https://explorer-studio.genlayer.com/transactions/0x4736f8392c955fb0affc4315c7cde4520aac7be92137aba511eae45feeb415d1) |
| Shared appeal resolved | [View receipt](https://explorer-studio.genlayer.com/transactions/0xfcc4dc5340ea19a8f5a1ac72a3b06a0e0b8040db65f1930c4ee709fa98f0d72a) |
| Settlement | [View receipt](https://explorer-studio.genlayer.com/transactions/0x13f7466f2fdcd33bb8fd568dea7bfea796acc794d35f280f5be583b63b6632b9) |
| Organizer withdrawal | [View receipt](https://explorer-studio.genlayer.com/transactions/0xb540ff4b51ce788d5dc9bb84b9d279d1a07f39491b14ccc58ce283ec16f6d2b5) |
| Sponsor withdrawal | [View receipt](https://explorer-studio.genlayer.com/transactions/0xe0736ddc2885ae950b06361645311ec808705a606e59b1ea77c59728be812130) |

Independent live read-back verification: **2 tests passed**, covering both the original and bilateral journals. For `sp-2`, checks include successful finalized receipts for every step, both appeal submissions before the deadline, resolution after it, the decision digest binding both arguments, unchanged original evidence/history, conservative integer allocations and zero remaining claim credits.

The frontend's production receipt adapter independently recognized both accepted appeal transactions as successful. The original late sponsor appeal in `sp-1` is preserved rather than relabeled. `sp-2` supplies the missing live two-party appeal demonstration; it does not change the original run's history or imply real-world adoption. The public website already reads this agreement from the existing contract; no frontend redeployment is required.
