# StreakPact by demigodd00: StudioNet deployment status

Checked on 2026-09-02. StreakPact V2.1 is live at
[streakpact-zeta.vercel.app](https://streakpact-zeta.vercel.app). The steward's
evidence-provenance request is implemented in the contract, UI, reviewer
fixtures, and release records.

## Release identity

- Network: GenLayer StudioNet, chain ID `61999`.
- Contract: `StreakPactV2`, version `2.1.0`.
- Address: `0xa878379DE7398da0F6Ac6cF1AE32d6CA4e9062c2`.
- Deployment transaction: `0x011ad6d8bfd315fd3cb6993ff19ece8a64b5d5921b6d076a6ac90ff4706efdb0`.
- Deployer and treasury: `0x1adf37F016384714F683CaC4d0a261A6d4e27033`.
- Deployed at: `2026-09-02T13:33:08.406316+00:00`.
- Implementation revision: `29ecaa894f4d793329f65e85e7ccd5777fd352bf`.
- Source SHA-256: `80fc4f894f23339d9c0f38698852a3d9499c08e3f280cfb830c4159b86f78057`.
- Machine-readable deployment record: [streak_pact_v2_studionet.json](../deployments/streak_pact_v2_studionet.json).

StudioNet and its test GEN have no monetary value. The network is temporary and
may reset; this is not a mainnet or financial-safety claim.

## Steward correction: passed

V2.1 fixes an evidence-attestor wallet when a pact is created. Each successful
check-in is a GenLayer transaction from that wallet and binds these fields into
the stored record and canonical `streakpact.wallet-attestation.v1` ID:

- pact, period, subject wallet, and attestor wallet;
- activity statement and period-bounded observation time;
- public evidence URL and validator-recomputed SHA-256 digest; and
- provenance class: `SELF_ATTESTED`, `WALLET_VERIFIED`, or
  `APPELLANT_ATTESTED`.

Only the configured attestor can submit an original check-in. The transaction
authenticates who made the attestation but does not make the activity claim true;
validators still compare the artifact and signed claim with the pact criteria.
Bare self-assertions are explicitly insufficient in the adjudication prompt.

Appeals write a second record. The original verdict, signer, evidence, digest,
statement, observation time, and adjudication remain unchanged and readable.
Live fixture `sp2-5` proves an independent verifier submission and an original
`MISSED / AUTO_MISS` record beside a maker-signed successful appeal. Fixture
`sp2-6` proves signed maker and challenger records in a settled two-wallet pact.

## Exact-release contract acceptance: passed

The recorded matrix ran against the exact address above with two SDK signers:

- 42 finalized transactions: 29 successful executions and 13 expected contract
  rejections;
- 29 state assertions, including independent-attestor enforcement and immutable
  original/appeal provenance;
- six emitted refunds or payouts checked for finality, recipient, amount, parent
  linkage, and `value_credited: true`; and
- six created pacts, four settled pacts, four kept periods, and eight missed
  periods in the final contract stats.

| Pact | Scenario | Final state | Verified test-GEN credit |
| --- | --- | --- | --- |
| `sp2-1` | Unstarted self-pact cancellation | `VOIDED` | 0.001 to maker |
| `sp2-2` | Unmatched challenge cancellation | `VOIDED` | 0.001 to maker |
| `sp2-3` | Matched challenge loss | `SETTLED` | 0.002 to challenger |
| `sp2-4` | Self-pact loss | `SETTLED` | 0.001 to failure recipient |
| `sp2-5` | Verifier-attested self-pact win after appeal | `SETTLED` | 0.001 to maker |
| `sp2-6` | Matched challenge win after signed appeals | `SETTLED` | 0.002 to maker |

See the [V2.1 transaction and transfer journal](../deployments/streak_pact_v2_1_acceptance.json).
The fixtures are synthetic reading logs without personal data; they are not
claims that physical activity was independently observed.

## Build and hosted verification: passed

- GenVM lint/validation and pinned runner verification passed.
- 15 direct contract tests and 70 web tests passed.
- TypeScript, the Next.js production build, and the production dependency audit
  passed; no known vulnerabilities were reported.
- GitHub Actions passed for the final application revision `d851d98`:
  [Tests run 33646289908](https://github.com/Demigodd00/demigodd00-genlayer-apps/actions/runs/33646289908).
- Vercel deployment `H7ivsoQaN7biy4djbhxh9dZnyDuY` reached `READY` from
  revision `d851d9889db99bce82ff3e82b17604c298c54c46`.
- The public `/api/health` returned HTTP 200 with product `StreakPact V2.1` and
  all four readiness flags true.
- The public status page resolved the exact V2.1 address, version, zero fee,
  `CONTENT_ADDRESSED_AND_WALLET_ATTESTED`,
  `streakpact.wallet-attestation.v1`, and
  `IMMUTABLE_SEPARATE_RECORDS`. Its metrics matched the acceptance journal.
- Public `sp2-5` and `sp2-6` pages displayed the signed wallets, timestamps,
  evidence digests, attestation IDs, and separate original/appeal audit records.
- No browser console warning or error was observed on the checked status and
  reviewer views.

See the [machine-readable hosting record](../deployments/streak_pact_v2_vercel.json).
The earlier V2.0 contract and MetaMask-created `sp2-7` are archived history and
must not be submitted as V2.1 evidence.

## Remaining manual product checks

These are useful product sign-off checks, not observed blockers in the steward's
provenance correction:

1. Create and reject one V2.1 transaction using the real MetaMask extension,
   then refresh and switch accounts to confirm browser-wallet recovery.
2. Open an invitation or shared pact on a physical phone wallet browser and
   check layout, evidence selection, and approvals.

The available automated browser has no wallet extension or physical-device
surface, so these checks are deliberately not marked passed. A custom domain is
optional; the public Vercel URL is already live.
