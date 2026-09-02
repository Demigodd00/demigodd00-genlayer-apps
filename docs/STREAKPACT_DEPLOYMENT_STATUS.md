# StreakPact by demigodd00: StudioNet deployment status

Checked on 2026-09-02. The website is live at
[streakpact-zeta.vercel.app](https://streakpact-zeta.vercel.app).
Hosting, evidence publishing, and the exact-release two-wallet contract matrix
have passed. Real MetaMask pact creation has also passed; rejection recovery,
account switching, and physical-phone layout remain separate manual checks.

## Release identity

- Network: StudioNet, chain ID `61999`.
- Contract: `StreakPactV2`, version `2.0.0`.
- Address: `0xae785A6DF3a2AA204A5E64FC02246d17b3fc38a6`.
- Deployment transaction: `0xcd543a760e85f6dc754b17d3527156850a526fb9f0c36b455572d4e9dc6d82c6`.
- Deployer and treasury: `0x1adf37F016384714F683CaC4d0a261A6d4e27033`.
- Deployed at: `2026-08-28T16:50:17.520325+00:00`.
- Source revision: `f9c9bd1c900ae6c70d93d5c98fd2dd2782368db6`.
- Source SHA-256: `b24ef1c96b6db375a0a5b44088e40eba54e1ff865c557eedf6ce9e8d245f213b`.
- Machine-readable provenance: [deployment record](../deployments/streak_pact_v2_studionet.json).

StudioNet has no monetary value and is a temporary development environment;
this is the intended release address, not a promise of permanent state retention.
See the [official network comparison](https://docs.genlayer.com/developers/networks).

## Hosting and evidence: passed

- Vercel project `demi17/streakpact`, Hobby plan, public portfolio monorepo
  `Demigodd00/demigodd00-genlayer-apps`, production branch `main`.
- Root directory `apps/streakpact-web`; Node.js `22.x`; pnpm `11.19.0`.
- Final application revision: `ae5327c4ec2ec88e3200dacb108597de328da146`.
  Later acceptance-record/documentation commits may create additional deployments.
- Production environment contains the release address, StudioNet label, exact
  HTTPS origin, and a sensitive server-only `PINATA_JWT`. No wallet key was
  uploaded to Vercel. Local environment files remain Git-ignored.
- The public health endpoint returns HTTP 200 with all configuration gates true.
- Two 152-byte synthetic JSON proofs were published through the hosted route
  with HTTP 201, downloaded with HTTP 200, and matched byte-for-byte and by
  SHA-256. Repeat checks re-download existing files without republishing them.
- Foreign and missing Origin headers are rejected with HTTP 403.
- The published Vercel Firewall rule limits `POST /api/evidence` to five requests
  per IP per 60 seconds. Excess requests returned HTTP 429 with
  `x-vercel-mitigated: deny`, proving enforcement at Vercel's edge.
- The browser upload flow handles Vercel's plain-text 429 response clearly.

See the [hosting record](../deployments/streak_pact_v2_vercel.json) and
[hosted check receipts](../deployments/streak_pact_v2_hosted_checks.json).
Origin checks are not authentication, and per-IP limiting does not eliminate
distributed abuse. Keep an eye on the free hosting and Pinata usage quotas.

## Contract acceptance: passed

The release code hash, schema, configuration and owner signer were verified.
The deployed source is 32,440 bytes and matches the recorded SHA-256. The fee is
zero, periods are 60 seconds, and appeals last 300 seconds.

The recorded run used two actual SDK signers against this exact address:
42 contract transactions, comprising 29 successful executions and 13 expected
rejections, plus 28 state assertions. All six emitted refunds/payouts were
independently checked for finality, recipient, amount, parent linkage, and
`value_credited: true`.

| Pact | Scenario | Final state | Verified test GEN credit |
| --- | --- | --- | --- |
| `sp2-1` | Unstarted self-pact cancellation | `VOIDED` | 0.001 to maker |
| `sp2-2` | Unmatched challenge cancellation | `VOIDED` | 0.001 to maker |
| `sp2-3` | Matched challenge loss | `SETTLED` | 0.002 to challenger |
| `sp2-4` | Self-pact loss | `SETTLED` | 0.001 to failure recipient |
| `sp2-5` | Self-pact win after appeal | `SETTLED` | 0.001 to maker |
| `sp2-6` | Matched challenge win after appeal | `SETTLED` | 0.002 to maker |

The run includes real `KEPT` and `MISSED` evidence evaluations, elapsed-period
misses, maker and challenger appeals, duplicate/unauthorized appeal rejection,
wrong-stake/self-join rejection, premature finalization/claim rejection, and
wrong-recipient/double-claim rejection. One claim exceeded the initial polling
window; resuming its existing transaction hash verified success without a
duplicate submission. StudioNet confirmation times are not guaranteed.

Final observed stats: six created, three self-pacts, three challenges, four
settled, four kept periods and eight missed periods. The two cancelled pacts
are not counted as settled.

See the [complete transaction and transfer journal](../deployments/streak_pact_v2_acceptance.json).
These are explicitly synthetic reading-log fixtures with no personal data and
no claim that real-world activity was independently observed. The SDK signer
matrix is not a MetaMask browser test.

## Build and interface checks: passed

- GenVM lint/validation, pinned runner verification, and 13 direct contract tests.
- `check_streakpact_release.py --require-deployment --skip-web` passed all
  deployment provenance and contract gates; web gates were run separately.
- 69 web tests, TypeScript checking, and the production build passed.
- Production dependency audit: no known vulnerabilities reported.
- The saved wallet key and upload JWT had zero matches across 17 browser assets
  and 12 release files. Neither ignored environment file is included in Git.
- Real successful and rejected StudioNet receipts were re-read with the web's
  JavaScript SDK. The UI now uses actual leader execution results when the SDK
  omits its normalized field; `FINALIZED` alone never means success.
- Wallet connection uses standard account/network requests, verifies StudioNet,
  and does not require a MetaMask Snap. EIP-6963 and legacy provider discovery
  present each enabled wallet explicitly. Mock-provider tests cover multi-wallet
  selection, switching, unknown-network setup, rejection, account changes and
  wrong-network refusal.
- Shorter UI copy retains the StudioNet/no-value and public-proof warnings.
  Shared pact links work without a wallet, failure recipients can open their
  pact, and cancellation, pagination, stale-proof, timing and duplicate-submit
  controls have regression coverage.
- Hosted home, invitation, shared-pact and status views were checked at the
  available 624-pixel browser width without horizontal overflow.
- MetaMask submitted transaction
  `0x627ab1c09f1626df2b49fe37745ce77fdc68079cf084715c048e606e08772339`
  on StudioNet and created `sp2-7`. The pact was then cancelled and now reads
  `VOIDED`. Its reviewer view reports the 0.01 test GEN stake as refunded rather
  than displaying the challenge's theoretical 0.02 matched pot.
- Read-only StudioNet calls retry bounded transient transport failures. A raw
  `Failed to fetch`/Viem message no longer reaches the user; transaction writes
  are never automatically retried.
- My pacts, creation, joining, and protocol guidance now have distinct,
  reload-safe URLs. Earlier query-string submission links redirect to the new
  reviewer routes and the recorded `sp2-5` and `sp2-7` fixtures still load.

Local checks used Node.js `24.19.0` and emitted the expected engine warning;
the hosted production runtime is Node.js `22.x`.

## Remaining manual sign-off

1. In the real MetaMask browser, reject one request, then refresh and switch
   accounts to check recovery with the actual wallet. Pact creation is already
   recorded as passed above.
2. Open an invite/shared pact on a physical phone, preferably in MetaMask's
   built-in browser, and check layout, proof selection and wallet approvals.

The available browser has no installed wallet; a connected desktop Chrome or
phone was not available. These checks are **not** marked passed. There is no
remaining Vercel account, origin, upload-secret, firewall or contract deployment
setup required. A custom domain is optional; the public Vercel URL already works.

This is a tested StudioNet demo, not a mainnet security certification. The
public repository makes the source and provenance directly reviewable but does
not transfer authorship or permission to misrepresent the work. Delivered
JavaScript and published IPFS proofs are public. Use only valueless test GEN and
non-sensitive proofs. See the [Vercel checklist](STREAKPACT_VERCEL_DEPLOYMENT.md) and
[release runbook](STREAKPACT_STUDIONET_RELEASE.md) for repeatable checks.
