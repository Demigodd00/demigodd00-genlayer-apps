# MicroWagers Portal submission

Submit MicroWagers as its own contribution. Do not combine it with StreakPact or any other product in the repository.

## Portal fields

**Contribution type:** Projects

**Contribution date:** Use the date you actually submit or resubmit.

**Title:** MicroWagers by demigodd00 — Source-Bound Peer Predictions on GenLayer

**Notes / Description:**

```text
MicroWagers by demigodd00 is a two-sided prediction product for GenLayer StudioNet; test GEN has no monetary value. A creator defines a question, two positions, a public HTTPS source, a deadline, and a test stake; another wallet matches. After the deadline, validators fetch the fixed source URL and use comparative consensus to agree on the supported position and confidence. Their result controls escrow: a decisive result becomes provisional, while ambiguous evidence refunds both users. Each adjudication records the strict-UTF-8 snapshot, SHA-256 digest, time, outcome, confidence, reason, and winner. Original and appeal records stay separate and public. One bonded appeal triggers an independent validator refetch. Claims lock for five minutes. If adjudication never finalizes, any wallet can recover both stakes after ten minutes. Three wallets tested the deployment through failure cases, settlement, appeal, payout, and recovery. No admin can choose a winner or move participant escrow.
```

## Evidence to add

1. **GitHub Repository**
   https://github.com/Demigodd00/demigodd00-genlayer-apps

2. **GenLayer Explorer Contract**
   https://explorer-studio.genlayer.com/address/0xe7B8E25a7608176168d4cfA84691B53d1715bADE

3. **Other** — live product
   https://microwagers.vercel.app

4. **GitHub File** — exact intelligent-contract source
   https://github.com/Demigodd00/demigodd00-genlayer-apps/blob/793fcec27d554500d2f10ae66fbcc58cf53a0f4d/contracts/micro_wagers.py

5. **GitHub File** — exact StudioNet deployment record
   https://github.com/Demigodd00/demigodd00-genlayer-apps/blob/0c6fb509401801588f4e96d5c8f01b28d68c45ed/deployments/micro_wagers_studionet.json

6. **GitHub File** — exact-address acceptance journal
   https://github.com/Demigodd00/demigodd00-genlayer-apps/blob/0c6fb509401801588f4e96d5c8f01b28d68c45ed/deployments/micro_wagers_acceptance.json

The form requires only one evidence link, but submit the repository, Explorer contract, live product, contract source, deployment record, and acceptance journal so a steward can reproduce the review quickly.

## Reviewer path

1. Open the live product without connecting a wallet.
2. Open https://microwagers.vercel.app/markets?wager=w-4 to inspect the settled and appealed flow, including the separately preserved original and appeal snapshots and SHA-256 digests.
3. Open https://microwagers.vercel.app/markets?wager=w-2 to inspect the permissionless resolution-timeout refund. It intentionally has no adjudication record because validators never finalized one.
4. Open https://microwagers.vercel.app/status to confirm the exact contract, zero fee, five-minute appeal window, ten-minute recovery period, and absence of admin settlement controls.
5. Compare the Explorer contract with the immutable source, deployment record, and acceptance journal.
6. Connect MetaMask on GenLayer StudioNet only if a fresh test transaction is desired.

## If the Portal asks “What did you change?”

```text
Upgraded MicroWagers to V1.2 and deployed a new verified StudioNet contract. Each validator adjudication now preserves the exact strict-UTF-8 source snapshot, SHA-256 digest, URL, byte and character counts, judgment time, outcome, confidence, reason, and winner. Original and appealed adjudications are stored as separate immutable records and displayed publicly in the app. The wording now states accurately that validators fetch the source when adjudication runs after the deadline; it no longer implies a deadline-time snapshot. Invalid, private, malformed, oversized, NUL-containing, or non-UTF-8 sources are rejected. I also added permissionless timeout recovery so any wallet can void an unresolved matched wager after ten minutes and refund both original test stakes. The exact new address was tested with three wallets through negative cases, settlement, appeal, payout, and timeout recovery, and the live Vercel app now points to that deployment.
```

## Public repository note

The repository is public so Portal reviewers can verify source, deployment records, and acceptance evidence without requesting access. Authorship is documented by Git history, the demigodd00 attribution throughout the product, and the repository license and notice. Public visibility does not grant permission to present the work as someone else's.
