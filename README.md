# GenLayer Apps by demigodd00

A portfolio monorepo of separate GenLayer StudioNet products built by demigodd00.
Each product has its own contract, frontend, deployment evidence, and Portal submission pack.

Copyright (c) 2026 demigodd00. This is proprietary software; no permission is
granted to copy, modify, distribute, host, publish, or create derivative works.
See [`LICENSE`](LICENSE) for the complete terms.

StreakPact V2.2 is one product in this repository. It supports self-stake pacts by default and optional matched challenges. Users define structured success criteria and a fixed evidence-attestor wallet. Each check-in binds that wallet, the subject, activity statement, second-precision observed time, and complete content-addressed evidence before validators decide a provisional result.

**Live release:** [StreakPact app](https://streakpact-zeta.vercel.app) · [GenLayer Explorer contract](https://explorer-studio.genlayer.com/address/0x386Baf8F5C543429a8d513F183271513ae59BC81) · [`StreakPactV2` source](contracts/streak_pact_v2.py)

> **Release status:** V2.2 is deployed and fully acceptance-tested on GenLayer StudioNet at `0x386Baf8F5C543429a8d513F183271513ae59BC81`. StudioNet GEN has no monetary value.

> **Portal submission scope:** StreakPact V2.2 and MicroWagers are separate products with separate deployment evidence and submission packs. Do not combine them into one Portal contribution. Earlier StreakPact releases are not submission candidates.

## Products

| Product | GenLayer fit | Status |
|---|---|---|
| StreakPact V2.2 | Strong: authenticated external-evidence claims directly control escrow settlement | Live StudioNet build |
| StreakPact V1 | Strong concept, unsafe period accounting | Historical deployed prototype; do not promote |
| MicroWagers | Strong: public-source interpretation directly controls peer escrow settlement | Verified StudioNet test-token release |

**MicroWagers release:** [live app](https://microwagers.vercel.app) · [read-only status](https://microwagers.vercel.app/status) · [GenLayer Explorer contract](https://explorer-studio.genlayer.com/address/0xe7B8E25a7608176168d4cfA84691B53d1715bADE) · [paste-ready Portal submission](docs/MICROWAGERS_SUBMISSION.md)

## Why GenLayer

The frontend owns wallet connection, templates, reminders, transaction feedback, indexing, and evidence preparation. The contract owns only the consensus-critical boundary: evidence inputs, validator comparison, period accounting, provisional settlement, appeals, and payout eligibility.

GenLayer is not used as a generic AI backend. Its judgment changes an escrow state that independent validators must reproduce.

## V2.2 safeguards

- Every elapsed period is accounted for in bounded contract logic; zero check-ins cannot win.
- Self-stake is the default product mode; head-to-head challenges are optional.
- Each pact fixes a self or independent verifier wallet as its evidence attestor.
- The attestor's GenLayer transaction binds the subject, statement, observed time, and exact IPFS/Arweave SHA-256 digest.
- Evidence is valid UTF-8 and bounded by both 8,000 characters and 100 KB; the complete artifact is judged without silent truncation.
- Zero treasury, failure-recipient, and evidence-attestor addresses are rejected.
- Validators agree on verdict, evidence digest, and a bounded confidence bucket.
- Low-confidence evidence is inconclusive and cannot create a financial verdict.
- Payouts remain locked through a provisional appeal window.
- Only the adversely affected participant may appeal a period, once.
- Appeals create a second adjudication record; they never overwrite the original verdict or evidence provenance.
- Every original and appealed record remains expandable with its complete reason, signer, statement, timestamps, URL, digest, and attestation ID.
- Pagination and financial inputs are capped.
- The web app uses an injected wallet and never requests or stores a private key.
- Transactions are shown as successful only after finalized execution succeeds.

## Repository layout

```text
apps/streakpact-web/                 Next.js 16 consumer + read-only operations app
apps/microwagers-web/                Next.js 16 MicroWagers product app
contracts/streak_pact_v2.py         primary StudioNet intelligent contract
contracts/streak_pact.py            historical V1 contract
contracts/micro_wagers.py           hardened StudioNet demo contract
tests/direct/                        deterministic and adversarial contract tests
tests/integration/                   manual StudioNet consensus smoke tests
scripts/deploy_streak_pact_v2.py     gated V2 deployment and provenance record
deployments/                         immutable deployment records
docs/                                product and architecture decisions
```

## Local validation

Python 3.12:

```bash
pip install -r requirements-deploy.txt
python scripts/prepare_gltest_runner.py
genvm-lint check contracts/streak_pact_v2.py
genvm-lint check contracts/micro_wagers.py
pytest tests/direct -v
python scripts/check_streakpact_release.py
```

Web app:

```bash
cd apps/streakpact-web
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm dev
```

Copy `.env.example` to `.env.local` after the V2 StudioNet deployment exists:

```text
NEXT_PUBLIC_STREAKPACT_V2_ADDRESS=0x...
NEXT_PUBLIC_NETWORK_NAME=StudioNet
PINATA_JWT=server-only-restricted-token
STREAKPACT_APP_ORIGIN=https://your-streakpact-host.example
```

Without an address, the web app deliberately runs in non-transactional product-preview mode. Without `PINATA_JWT`, manual IPFS/Arweave URLs still work, but the built-in publisher clearly reports that owner configuration is pending. The Pinata token stays server-side and should be restricted to `org:files:write`.

## V2.2 execution flow

```text
connect wallet
  → choose structured template and mode
  → choose and review the evidence attestor
  → fund escrow
  → attestor signs the activity claim + exact public evidence each period
  → validators agree on verdict + digest + confidence bucket
  → deterministic accounting fills every expired period
  → provisional settlement
  → one-time signed appeals preserved beside the original record
  → final settlement
  → eligible recipient claims
```

## Deployment

Deployment requires an explicit signer and treasury address. For the zero-fee StudioNet demo, the treasury can be the deployer address because it receives no protocol fee. The script never generates or hides a key, and it runs lint plus the V2 direct suite by default.

```bash
export STREAKPACT_PRIVATE_KEY=0x...
export STREAKPACT_TREASURY=0x...   # deployer address is fine when fee-bps is zero
export STREAKPACT_NETWORK=studionet
python scripts/deploy_streak_pact_v2.py --fee-bps 0 --period-secs 60 --appeal-window-secs 300 --configure-frontend
```

The deploy script records source provenance and refuses non-zero StudioNet fees. After deployment, run the post-deployment gate and the opt-in real-evidence smoke test:

```bash
python scripts/check_streakpact_release.py --require-deployment
export STREAKPACT_TEST_EVIDENCE_URL=https://gateway.pinata.cloud/ipfs/...
gltest tests/integration/test_streak_pact_v2_evidence_studionet.py --network studionet -v -s
```

Deploy MicroWagers with a short StudioNet appeal window and bounded unresolved-market recovery. The script records the transaction only after finality, successful execution, source verification, and configuration verification. Then configure `apps/microwagers-web/.env.local` with the recorded address and run the exact-release acceptance:

```bash
export MICROWAGERS_PRIVATE_KEY=0x...
export MICROWAGERS_NETWORK=studionet
python scripts/deploy_micro_wagers.py --fee-bps 0 --appeal-window-secs 300 --resolution-timeout-secs 600
python scripts/microwagers_acceptance.py
```

```text
NEXT_PUBLIC_MICROWAGERS_ADDRESS=0x...
NEXT_PUBLIC_NETWORK_NAME=StudioNet
NEXT_PUBLIC_SITE_URL=https://your-microwagers-host.example
```

Keep preflight enabled for both deployments.

## Owner boundary

StreakPact's `/admin` and MicroWagers' `/status` surfaces are read-only. They expose configuration and public activity only. Owners cannot rewrite verdicts, move test escrow, block appeals, or block legitimate claims.

See [`docs/STREAKPACT_PORTAL_SUBMISSION.md`](docs/STREAKPACT_PORTAL_SUBMISSION.md), [`docs/STREAKPACT_STUDIONET_RELEASE.md`](docs/STREAKPACT_STUDIONET_RELEASE.md), [`docs/MICROWAGERS_SUBMISSION.md`](docs/MICROWAGERS_SUBMISSION.md), [`docs/MICROWAGERS_RELEASE.md`](docs/MICROWAGERS_RELEASE.md), and [`docs/product/genlayer-fit.md`](docs/product/genlayer-fit.md) for the submission packs, release procedures, and rationale.

---

# BountyForge

Permissionless open-source bounties, adjudicated by an AI jury on GenLayer.

A sponsor pre-funds a bounty against a GitHub issue. A hunter connects a wallet, submits a pull request URL, the exact 40-character head SHA, and GitHub login plus a small anti-spam stake. The PR body must include `BountyForge-Wallet: <hunter wallet>` so the contract can bind the GitHub contribution to the claimant. Resolution is a separate permissionless transaction: GenLayer validators fetch the issue, PR metadata, and diff from GitHub and reach comparative consensus on `FIXES_ISSUE`, `NOT_FIXED`, or `INCONCLUSIVE`. Rejected claims remain appealable during the configured appeal window; accepted claims enter a sponsor challenge window; only finalized claims can be paid.

## Lifecycle

```
sponsor ── create_bounty(title, criteria, issue_url, deadline) + pot ──► OPEN
hunter ── submit_claim(bounty_id, pr_url, head_sha, github_login) + exact stake
  validators fetch api.github.com (issue JSON + PR JSON + diff) → AI jury
  resolve_claim() is permissionless; consensus on FIXES_ISSUE | NOT_FIXED | INCONCLUSIVE

FIXES_ISSUE   → AWARDED (challenge window)
                 sponsor challenge_claim(statement), once per award:
                   upheld      → stays AWARDED
                   overturned  → back to OPEN, hunter stake refunded
                 finalize_bounty() after the window → FINALIZED
                 claim_payout() → SETTLED (pot − fee + stake, winner-only, once)
NOT_FIXED     → REJECTED_PENDING_APPEAL, hunter may appeal during the appeal window
                 appeal FIXES → AWARDED; expiry or appeal NOT_FIXED → REJECTED_FINAL
INCONCLUSIVE  → claim recorded and stake refunded; retry with a fresh resolution

cancel_bounty()  sponsor only, before the first claim → CANCELLED + refund
expire_bounty()  permissionless, after deadline with no award → REFUNDED
```

- **Minimal consensus surface**: validators rerun the same fetch + prompt and must agree only on the verdict (`±1` confidence decile); reasons are stored but never voted on.
- **GitHub-only evidence**: URLs must match strict `github.com/{owner}/{repo}/issues|pull/{n}` patterns; validators read structured API payloads, not scraped HTML.
- **Anti-spam**: `0.001` GEN claim stake per submission — refunded on payout/overturn/inconclusive, sent to treasury only after a rejection appeal window closes; max 8 claims per bounty.
- **Identity binding**: the submitted PR author, head SHA, and wallet marker are checked again by every validator.
- **No dead ends**: permissionless `resolve`, `release_rejected_stake`, `finalize`, and `expire`; unclaimed bounties are refundable; terminal statuses are irreversible.

## Files

```
contracts/bounty_forge.py                          the intelligent contract
tests/direct/test_bounty_forge.py                  fast in-memory tests (no server)
tests/integration/test_bounty_forge_studionet.py   end-to-end escrow tests
apps/bountyforge-web                                wallet-connected sponsor/hunter UI
scripts/deploy_bounty_forge.py                     deployment script → deployments/
```

```bash
genvm-lint check contracts/bounty_forge.py
python -m pytest tests/direct/test_bounty_forge.py -v          # no network
python -m pytest tests/integration/test_bounty_forge_studionet.py -v  # StudioNet
python scripts/deploy_bounty_forge.py 0 3600 86400             # fee, challenge, appeal window
```

Write API: `create_bounty` *(payable)* · `submit_claim` *(payable, exact stake)* ·
`resolve_claim(bounty_id, claim_index)` · `appeal_claim(bounty_id, claim_index)` ·
`release_rejected_stake(bounty_id, claim_index)` · `challenge_claim(bounty_id, statement)` · `finalize_bounty(bounty_id)` ·
`claim_payout(bounty_id)` · `cancel_bounty(bounty_id)` · `expire_bounty(bounty_id)`

To run the client after deployment:

```bash
cd apps/bountyforge-web
copy .env.example .env.local
# Set NEXT_PUBLIC_BOUNTYFORGE_ADDRESS to deployments/bounty_forge_<network>.json
pnpm install --frozen-lockfile
pnpm check
pnpm dev
```

The deployment script requires `BOUNTYFORGE_PRIVATE_KEY` and will refuse to generate a new account. The current contract is a StudioNet release candidate; complete the integration smoke suite and independent security review before any mainnet representation.

View API: `get_bounty` · `get_claim` · `list_claims` · `list_bounties` ·
`list_sponsor_bounties` · `list_hunter_claims` · `get_config` · `get_stats`

Status: lint clean (pinned runner `py-genlayer:1jb45aa8ynh…`) · direct tests 19/19 ·
studionet E2E cancel-refund ✓ expire-refund ✓
