# Lacuna by demigodd00

An adversarial abstention range on GenLayer StudioNet. Find incomplete synthetic
cases that cause a pinned evaluator to decide when it should abstain.

Website: https://lacuna-sepia.vercel.app

This directory is **Lacuna**, one independent product in the shared GenLayer
apps repository. Do not deploy the repository root or another product's folder.

- [Review evidence and limitations](../../docs/LACUNA_RELEASE.md)
- [Copy-ready submission fields](../../docs/LACUNA_SUBMISSION.md)
- [Intelligent Contract source](../../contracts/lacuna.py)
- [Completed MetaMask case](https://lacuna-sepia.vercel.app/attempt/la-4)
- [Verified native payment](https://explorer-studio.genlayer.com/tx/0x7be9b0430bbe18fc844f7e765343a06e56dbb4e84610a31f245d631ae9da9031)

Canonical v0.1.1 Intelligent Contract:
`0x39AE6124194cEd74bBa0A772B9d4568b6cb29242` (StudioNet, chain 61999).

## Run

Use Node 22 and pnpm 11.19.0 in this directory:

```sh
pnpm install --frozen-lockfile
pnpm dev --port 3106
pnpm check
pnpm audit --prod --audit-level=high
```

The verified StudioNet address is the default. `.env.example` documents the
optional explicit build-time address setting. Never put a private key or LLM
key in frontend environment variables. No backend adjudication service exists.

For contract checks, use an isolated Python 3.12 environment and run these
commands from the **repository root**, not from this app directory:

```sh
python -m pip install -r requirements-lacuna.txt
python scripts/prepare_gltest_runner.py
genvm-lint check contracts/lacuna.py
python -m pytest tests/direct/test_lacuna.py -v --tb=short
python scripts/check_lacuna_release.py
```

The release checker reads the published contract and receipts without a wallet
or private key. Hosted StudioNet reads are rate-limited and may need a retry
after a network outage. `deploy_lacuna.py` and `lacuna_acceptance.py` are the
owner's resumable **write** tools, bound to the original authorized signer and
journals. They are not the reviewer entry point and must not be run with a
replacement key. Their published transcripts document the original run;
subsequent public campaigns can change global counts. Use the read-only checker
to verify those immutable cases instead of replaying the write script.

## Review path

1. Browse without connecting a wallet. Open a campaign and its case record.
2. Inspect the original document, target verdict, and both blinded referee
   records. Seeded controls are labeled and have a separate finding counter.
3. Connect an Ethereum wallet on StudioNet to fund a standard campaign. Choose
   an immutable rule, bounty, and closing time. Wait for rule review to open it.
4. From a different funded test wallet, prepare an incomplete original document
   and two additive completions that yield opposite outcomes without changing
   the original facts. Download the backup before committing the exact stake.
5. Reveal within 15 minutes. The contract queues target → referee one → referee
   two on finalized self-calls. The browser never supplies an accepted verdict.
6. When settled, inspect allocations and withdraw the wallet's credit. A
   successful withdrawal parent queues a native transfer; its child must also
   finalize with `value_credited=true` before calling it paid.

For test GEN, use the built-in faucet at https://studio.genlayer.com. No tokens
here represent real money. Do not submit personal or confidential information.

## Evidence / source

In the containing workspace:

- `contracts/lacuna.py`: full Intelligent Contract with pinned runner.
- `tests/direct/test_lacuna.py`: adversarial unit-level protocol and validator replay tests.
- `scripts/deploy_lacuna.py`: lint → tests → resumable deployment → source/config checks.
- `scripts/lacuna_acceptance.py`: real StudioNet LLM calls, two test wallets,
  automatic child stages, accepted verdicts, and native credit checks.
- `deployments/lacuna_studionet.json`: canonical release record.
- `deployments/lacuna_acceptance_011.json`: exact-address live acceptance journal;
  all three cases and native payments completed PASS on 2026-09-13.
- `scripts/check_lacuna_release.py`: unsigned, read-only source/website/record/payment
  verification; completed PASS for this release.
- `deployments/lacuna_browser_acceptance.json`: completed two-wallet MetaMask
  website flow, including the FINALIZED native payout and zero remaining credit.
- `docs/architecture/lacuna.md`: semantics, economics, boundaries and limitations.

Do not publish the containing workspace's `.env`, Vercel tokens, or unrelated
projects. This app has its own Vercel project (`demi17/lacuna`). Deploy it from
this directory. Git auto-deployment is intentionally disconnected; deploying
the unrelated monorepo root would select the wrong build context.

## Honest limitations

This tests Lacuna's pinned profiles, not arbitrary deployed contracts or AI
systems. Different referee wording is not guaranteed model-provider diversity.
Consensus can share errors. Network stalls or disagreement are inconclusive,
not findings or successful defenses. Timeout recovery requires a transaction
and network progress. One pending attempt and a 20-attempt campaign cap bound
work but do not eliminate denial-of-service incentives. Two wallets do not
prove distinct people. Valid-case deduplication is byte-exact, not semantic.

The intentionally faulty SEEDED_PERMISSIVE evaluator is a positive control.
A successful control demonstrates the settlement path, not a genuine discovery.

Source visibility does not grant a license. All rights reserved unless a
separate license grants permission. StudioNet test GEN has no monetary value.
