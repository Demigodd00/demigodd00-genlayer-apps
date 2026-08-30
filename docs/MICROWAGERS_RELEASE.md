# MicroWagers StudioNet release

MicroWagers by demigodd00 is a source-bound, two-sided prediction market for GenLayer StudioNet. Test GEN has no monetary value. This release is separate from the StreakPact submission.

## Release identity

| Item | Release value |
|---|---|
| Live app | https://microwagers.vercel.app |
| Read-only status | https://microwagers.vercel.app/status |
| Contract | `0x5D2679a7277D05E5bE9a6Bf60526D0fC7C1d477C` |
| Explorer | https://explorer-studio.genlayer.com/address/0x5D2679a7277D05E5bE9a6Bf60526D0fC7C1d477C |
| Deployment transaction | `0xde75d1627f2eb2666930615ec4d54eed6d5ac33d7a4c7ce449740ecab3a61e09` |
| Source SHA-256 | `86fd9fc88f96bbf49886d24cfa1f9deb5d74c10db01cc2114369b7bd804e7b25` |
| Fee | `0` basis points |
| Appeal window | `300` seconds |
| Web deployment | `dpl_DtUbKM8RdkefyuerZcMJpGfsrqvS` |
| Source commit | `9e91cfde0afbb575904d255a8c8a2baae71ee991` |

The deployment record is in [`deployments/micro_wagers_studionet.json`](../deployments/micro_wagers_studionet.json), the exact-release acceptance journal is in [`deployments/micro_wagers_acceptance.json`](../deployments/micro_wagers_acceptance.json), and the hosting record is in [`deployments/micro_wagers_vercel.json`](../deployments/micro_wagers_vercel.json).

## Why this is GenLayer-native

The contract does not use GenLayer as a generic AI service. After a market deadline, validators fetch the exact public HTTPS source named when the wager was created. Each validator interprets that evidence against two fixed positions. Comparative consensus requires agreement on the winning side and a bounded confidence bucket. That result directly changes escrow state to provisional settlement or a two-party refund.

The losing participant has one bonded appeal. Validators then re-evaluate the source with the original reason and appeal statement. Payout remains locked until the appeal window closes. A low-confidence or ambiguous result becomes `VOIDED` and refunds both stakes.

## User and owner boundaries

Users can create, accept, cancel an unmatched market, resolve after its deadline, appeal a provisional loss, and claim after the appeal window. The interface checks wallet network, role, amount, deadline, and transaction finality, while the contract independently enforces every rule.

There is no admin settlement path. The deployer cannot edit questions, select winners, reject appeals, or move participant stakes. `/status` only reads the public contract address, activity totals, zero-fee setting, and appeal window.

## Verified acceptance

The release was exercised against the exact deployed address with two StudioNet wallets:

- source and constructor configuration matched the validated local release;
- non-creator cancellation failed;
- creator cancellation finalized and the `0.001` test-GEN stake was credited back;
- self-acceptance and an incorrect matching stake failed;
- a second wallet matched the exact stake and moved the market to `LIVE`;
- early resolution failed;
- GenLayer validators fetched Example Domain and finalized a decisive source-backed verdict;
- claiming during the appeal window and appealing by the winner failed;
- the losing wallet submitted the exact bonded appeal;
- validators independently reviewed and upheld the result;
- a second appeal and a non-winner claim failed;
- the winner claimed after the appeal window, and the `0.003` test-GEN pot was credited;
- final state was `SETTLED`, with two created acceptance markets and one settled market.

The frontend also passed 24 automated tests, TypeScript validation, a Next.js production build, a production dependency audit with no known vulnerabilities, desktop QA, mobile QA, health checks, metadata checks, and security-header checks.

## Repeat the release gate

```bash
python scripts/check_micro_wagers_release.py --require-hosting
```

Real acceptance writes are already recorded. `scripts/microwagers_acceptance.py` is resume-safe and reuses recorded transaction hashes; do not delete its journal and rerun it casually.

## Scope

This is a StudioNet demonstration, not a real-money product or a mainnet security claim. Public sources must be HTTPS, readable by validators, bounded in size, and suitable for objective comparison. StudioNet availability and model consensus can add confirmation time, and genuinely ambiguous evidence is intentionally refunded rather than forced into a winner.
