# StreakPact by demigodd00: StudioNet deployment status

Checked on 2026-09-04. StreakPact V2.2 is live at
[streakpact-zeta.vercel.app](https://streakpact-zeta.vercel.app). The release
closes the steward's evidence-provenance request and the subsequent evidence,
address, audit-history, and timestamp review findings.

## Release identity

- Network: GenLayer StudioNet, chain ID `61999`.
- Contract: `StreakPactV2`, version `2.2.0`.
- Address: `0x386Baf8F5C543429a8d513F183271513ae59BC81`.
- Deployment transaction: `0x08877fdbb955b7c5b1a55a46c231a6d716b33f1879e32f06cf71774f3253b3c3`.
- Deployer and treasury: `0x1adf37F016384714F683CaC4d0a261A6d4e27033`.
- Deployed at: `2026-09-04T18:11:55.550253+00:00`.
- Implementation revision: `b76c816a0e947c1b06fda184b19367b03221ca76`.
- Source SHA-256: `7548cd316c161a75b9de9915784f04dce2d27ba39fe5b282bab27bc61e721f83`.
- Machine-readable deployment record: [streak_pact_v2_studionet.json](../deployments/streak_pact_v2_studionet.json).

StudioNet and test GEN have no monetary value. StudioNet is temporary and may
reset; this is not a mainnet or financial-safety claim.

## Steward corrections: passed

Every successful check-in is a GenLayer transaction from the pact's fixed
evidence-attestor wallet. It binds the subject, statement, observation time,
public artifact, validator-recomputed SHA-256 digest, and signer into the
canonical `streakpact.wallet-attestation.v1` record. A signature proves who
made the claim, not that the off-chain activity is true; validators still judge
the exact public evidence against the pact criteria.

V2.2 additionally enforces these reviewer-facing invariants:

- evidence must be valid UTF-8 and no more than both 8,000 Unicode characters
  and 100,000 bytes; the entire artifact is judged and nothing is truncated;
- zero addresses are rejected for treasury, failure recipient, and evidence
  attestor;
- every original and appealed adjudication remains available with its complete
  reason and provenance; the UI initially shows recent entries but can expand
  the full history; and
- check-in and appeal observation timestamps preserve seconds and are checked
  against the exact period boundaries before signing.

Appeals always add a separate record; the original verdict, signer, evidence,
digest, statement, observation time, and adjudication remain unchanged.
Fixture `sp2-6` proves an independent verifier plus preserved appeal history.
Fixture `sp2-7` proves a settled two-wallet challenge with signed appeal records.

## Exact-release contract acceptance: passed

The matrix ran against the exact V2.2 address above with two SDK signers:

- 50 finalized contract transactions were inspected: 33 successful executions
  and 17 expected contract rejections;
- 34 state assertions covered provenance, immutable appeals, zero-address
  guards, full-document evidence limits, and settlement accounting;
- seven native refunds or payouts were checked for finality, recipient, amount,
  parent linkage, and `value_credited: true`; and
- seven pacts were created, five settled, four periods kept, and eleven missed.

| Pact | Scenario | Final state | Verified test-GEN credit |
| --- | --- | --- | --- |
| `sp2-1` | Unstarted self-pact cancellation | `VOIDED` | 0.001 to maker |
| `sp2-2` | Unmatched challenge cancellation | `VOIDED` | 0.001 to maker |
| `sp2-3` | Matched challenge loss | `SETTLED` | 0.002 to challenger |
| `sp2-4` | Self-pact loss | `SETTLED` | 0.001 to failure recipient |
| `sp2-5` | Oversized evidence rejected, then elapsed-period loss | `SETTLED` | 0.001 to failure recipient |
| `sp2-6` | Independent-verifier self win after preserved appeal | `SETTLED` | 0.001 to maker |
| `sp2-7` | Matched challenge win after signed appeals | `SETTLED` | 0.002 to maker |

See the [V2.2 transaction and transfer journal](../deployments/streak_pact_v2_2_acceptance.json).
The fixtures are synthetic reading logs without personal data; they are not
claims that physical activity was independently observed.

## Build and hosted verification: passed

- GenVM lint/validation passed with the concrete pinned runner.
- 19 direct contract tests and 77 web tests passed.
- TypeScript, the Next.js production build, and the production dependency audit
  passed; no known production vulnerabilities were reported.
- A real full-consensus StudioNet evidence test finalized `KEPT` and verified
  the stored digest and signer.
- GitHub Actions passed on the exact implementation revision:
  [Tests run 33910379517](https://github.com/Demigodd00/demigodd00-genlayer-apps/actions/runs/33910379517).
- Vercel deployment `4MpeNvJYUFo3P3E5W11SnZCQCRPB` reached `READY` from
  revision `b76c816a0e947c1b06fda184b19367b03221ca76` and is Production.
- `/api/health` returned HTTP 200 with product `StreakPact V2.2` and all four
  readiness flags true.
- `/admin` resolved the exact V2.2 address, version, zero fee, evidence limits,
  provenance policy, attestation schema, and immutable record policy.
- Public `sp2-6` and `sp2-7` views exposed the complete original/appeal audit
  trail. No browser console warning or error was observed.
- Public evidence download digests, origin rejection, and Vercel edge rate
  limiting passed. An 8,001-character upload was rejected with HTTP 413 before
  Pinata upload.

See the [machine-readable hosting record](../deployments/streak_pact_v2_vercel.json).
The earlier V2.0 and V2.1 contracts are archived history and must not be used as
evidence for this V2.2 submission.

## Remaining manual sign-off

No automated or reviewer-blocking defect is known. Two device-specific product
checks remain because the available automation cannot control a real MetaMask
extension or physical phone:

1. Create and reject one V2.2 transaction in MetaMask, then refresh and switch
   accounts to confirm browser-wallet recovery.
2. Open an invitation or shared pact in a physical phone wallet browser and
   check layout, evidence selection, and approvals.

The public Vercel URL is live; a custom domain is optional.
