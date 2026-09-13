# Lacuna release and evidence

StudioNet only, by demigodd00. Test GEN has no monetary value.

## Canonical release

- Website: https://lacuna-sepia.vercel.app
- Version: 0.1.1-studionet
- Contract: `0x39AE6124194cEd74bBa0A772B9d4568b6cb29242`
- Explorer: https://explorer-studio.genlayer.com/address/0x39AE6124194cEd74bBa0A772B9d4568b6cb29242
- Deploy transaction: `0x4e6b1dab3aaf040766ba003cd5974d62c3ff239f7edc4b89954da6a0099404b8`
- Source SHA-256: `ea863346c0050b1c7b3343b0eefaa32ce89ad2983ed4994263100e1b0e1013a2`

Verified on 2026-09-13: `scripts/check_lacuna_release.py` completed PASS against
the published website and the completed `deployments/lacuna_acceptance_011.json`.
It checked the deployed source hash, canonical website address, immutable case
records, twelve finalized adjudication self-calls, three credited native payment
children, and balanced accounting. The checker uses unsigned public reads and
requires no private key. An older deployment's tests are not used for this address.

## What makes it native

The frontend never calls an LLM service or supplies an authoritative answer.
It reads finalized state and sends wallet-signed writes to this contract.
GenLayer runs rule admission, the incomplete-case evaluator and both blinded
referee framings. Each validator independently executes the semantic task and
compares all substantive decision fields. Settlement reads the accepted records
and credits native GEN; withdrawals create native transfers to fixed recipients.

Prompt/profile and source version are pinned. The underlying model/provider
selection belongs to the network and is not guaranteed to remain identical.
Prompt-level blinding does not hide public on-chain data from human observers.

## Evidence inventory

`tests/direct/test_lacuna.py` covers 73 cases, including mismatching independent
validator answers, malformed outputs, invalid witnesses, ownership, commit hash
binding, duplicate messages, evidence boundaries, accounting and timeouts.

Frontend tests cover wallet discovery/switching, accepted-versus-finalized
receipts, amount math, route validation, random salts, recovery backups, domain
binding, and a UTF-8 commitment vector shared with Python.

The live acceptance script uses the same three public cases against the exact
canonical address: standard abstention, a deliberately flawed positive control,
and a contradictory completion. It records all self-call hashes and checks each
native withdrawal child's FINALIZED status and `value_credited=true`.

Canonical-address acceptance completed PASS on 2026-09-13 at 10:15:40 UTC:

| Case | Accepted result | Verified native allocation |
| --- | --- | --- |
| lc-1 / la-1: standard evaluator | NO_FINDING; correctly abstained | 0.0001 test GEN to sponsor |
| lc-2 / la-2: seeded permissive control | CONFIRMED_FINDING; deliberately flawed positive control | 0.0011 test GEN to challenger |
| lc-3 / la-3: contradictory completion | INVALID_ATTEMPT; changed facts rejected | 0.0001 test GEN to sponsor |

This SDK test set contains zero standard findings and one seeded-control
finding. These are three bounded test fixtures, not exhaustive security proof.
At acceptance completion, 0.002 test GEN remained as unawarded campaign bounties,
with no active attempts or unpaid credits. Those bounties follow the recorded
campaign deadlines and normal expiry/refund path; they are not missing payments.

## Completed MetaMask website test

The production website's full two-wallet flow completed PASS in Chrome on
2026-09-13. MetaMask requests were initiated through the UI and approved by the
user. The test covered wallet discovery, connection, sponsor creation, account
switching, the sponsor self-challenge guard, reveal-backup download initiation,
commitment, reveal, automatic evaluation, settlement display and withdrawal.
Unsigned public RPC reads independently verified successful execution and
finality. No SDK-signed writes substituted for the browser interactions.

- Campaign: https://lacuna-sepia.vercel.app/campaign/lc-4
- Case record: https://lacuna-sepia.vercel.app/attempt/la-4
- Evidence: `deployments/lacuna_browser_acceptance.json` (PASS).
- Sponsor: `0xA1e3A40bdC63305b5C6fd86276bBE967c5D78698`.
- Challenger/payee: `0x1adf37F016384714F683CaC4d0a261A6d4e27033`.
- Funding: 0.001 test GEN; challenger stake: 0.0001 test GEN.
- Withdrawal parent: `0xf76ebbd58006a906dff8e05d741e1649ae9c469ee686eff964a01fd05fb55803`.
- Native payment: https://explorer-studio.genlayer.com/tx/0x7be9b0430bbe18fc844f7e765343a06e56dbb4e84610a31f245d631ae9da9031
- Payment verification: FINALIZED, `value_credited=true`, exact recipient and
  0.0011 test GEN amount. Remaining challenger credit: zero. Accounting balanced.

The seeded evaluator approved the incomplete document. Both referee framings
found that the June 10 addition supports APPROVE and the June 20 addition
supports REJECT while preserving the original facts. The accepted result was
CONFIRMED_FINDING, explicitly labeled as a seeded control. Aggregate results now
contain zero standard findings, two seeded-control findings, one correct
abstention and one invalid attempt. This additional control is not a genuine
vulnerability discovery or exhaustive security proof.

The in-app browser still has no injected wallet; extension coverage was exercised
in Chrome. Separate browser checks cover public rendering, routes, forms,
control labels, missing-wallet behavior, receipts and mobile overflow. Multiple
wallet extensions installed simultaneously and contract-wallet signing were not
part of this manual run.

## Previous experimental release

Version 0.1.0 at `0x913F1b83737e62d7a60240acd9Dec0c8a2fdA595` passed the three
live outcomes, but required validator rotation during the contradictory case.
One unaccepted leader proposal confused a known-false necessary condition with
an unknown condition. Version 0.1.1 makes this distinction explicit. No incorrect
finding or payout was accepted. Historical records remain in
`deployments/lacuna_acceptance.json` and `deployments/history/`.

Old test campaigns have no active attempts. Their unawarded bounties remain
under their original two-hour deadlines and can be reclaimed afterward through
the old contract's permissionless `expire_campaign`, then `withdraw_credit`.
The revised app neither migrates nor pretends to own those old records.

## Remaining boundaries

This is an experimental range for the two pinned Lacuna profiles, not universal
model evaluation or a scanner for third-party contracts. No genuine standard
finding is claimed merely because the seeded control wins. Model correlations,
semantic judging errors, network stalls, byte-exact deduplication and adversarial
resource use remain limitations. Funds recovery requires network liveness.
The supported interactive wallet path is an externally owned Ethereum account;
contract-wallet/native fallback compatibility has not been certified.

No Portal submission has been sent. The project-specific source entry point is
https://github.com/Demigodd00/demigodd00-genlayer-apps/tree/main/apps/lacuna-web .
The contract, tests and acceptance records live in the same repository; see
`docs/LACUNA_SUBMISSION.md` for the exact submission links and field text.
The Vercel app is manually deployed from `apps/lacuna-web`, with Git auto
deployment disconnected to avoid building the unrelated monorepo root.
