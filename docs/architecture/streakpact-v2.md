# StreakPact V2 architecture and launch gates

## Responsibility boundary

| Layer | Owns | Must not own |
|---|---|---|
| Web app | Wallet session, templates, local timezone, reminders, indexing, evidence preparation, transaction state | Private keys, authoritative verdicts, payout decisions |
| GenLayer contract | Escrow, period accounting, evidence policy, validator comparison, provisional/final state, appeal eligibility, claims | Notifications, search, analytics, mutable content hosting |
| Evidence layer | Immutable IPFS/Arweave artifacts | Instructions to validators or payout logic |
| Operations | Deployment records, metrics, alerts, support lookup | Outcome editing, arbitrary withdrawals, claim blocking |

## State machine

```text
SELF:       create → LIVE
CHALLENGE:  create → OPEN → join → LIVE

LIVE
  → submit evidence for current period
  → automatically record every elapsed empty period as MISSED
  → once all periods are judged: PROVISIONAL_WON | PROVISIONAL_LOST
  → permitted one-time period appeals until deadline
  → finalize: WON | LOST
  → eligible payout recipient claims: SETTLED

OPEN or pre-start SELF → maker cancellation → VOIDED
```

There is no path from `LIVE` to a winning result while periods remain unaccounted for. `propose_settlement` first synchronizes all elapsed periods and then requires the judged count to equal the configured total.

## Consensus design

Each evidence transaction supplies an approved IPFS or Arweave gateway URL, a lowercase SHA-256 digest of the exact response body, and optional participant context that is explicitly marked untrusted.

The leader fetches the evidence, enforces the response bound, verifies the digest, and produces `KEPT`, `MISSED`, or `INCONCLUSIVE` with a quantized confidence bucket. Validators independently rerun the same process and must agree on the digest and verdict, with at most one confidence bucket of difference.

`INCONCLUSIVE` and confidence below 70 do not change financial state. The participant can submit stronger evidence while the period remains open.

## Product modes

### Self-stake

The maker funds one stake. A successful pact returns the stake, less any configured fee. A failed pact pays a separately chosen failure recipient. The contract rejects the maker as their own failure recipient.

### Challenge

The maker funds a stake and shares an invite. A challenger must match it before the start. Success pays the maker; failure pays the challenger. This is optional because requiring an adversary is a poor default for habit formation.

## Security invariants

1. Escrow cannot be claimed before final settlement.
2. Final settlement cannot occur during the appeal window.
3. Every period is represented by exactly one current check-in record.
4. A period can be appealed at most once.
5. Only the maker can appeal `MISSED`; only the matched challenger can appeal `KEPT`.
6. An evidence verdict cannot be stored unless its body matches the supplied digest.
7. Page reads and collection scans are bounded.
8. Treasury and timing configuration are immutable after deployment.
9. Admin software has no contract method for changing outcomes or moving user escrow.

## Evidence publishing boundary

The web app now includes a narrow server-side publisher for public IPFS. It accepts only JSON or plain text up to 100 KB, hashes the exact bytes, uploads with a server-only restricted Pinata credential, and returns an approved gateway URL plus SHA-256 digest. The browser independently hashes the selected file and refuses to auto-fill mismatched results. Manual approved IPFS and Arweave URLs remain supported.

The publisher is convenience infrastructure, not an authority: the GenLayer leader and validators still re-fetch the artifact, enforce the same size bound, and verify the digest before adjudication. Production hosting must configure an exact allowed origin and platform-level rate limiting.

A future source-adapter service could further simplify evidence collection without becoming authoritative:

1. User connects a supported source such as GitHub or a fitness provider.
2. The service normalizes the selected activity into a small canonical JSON record.
3. The record is shown to the user before publication.
4. The record is uploaded to public IPFS or Arweave.
5. The client independently computes SHA-256 and submits URL + digest.
6. Monitoring verifies gateway availability but cannot alter published records.

The service must have per-source adapters, explicit scopes, deletion/privacy documentation for upstream credentials, rate limits, and no generic server-side URL fetch endpoint.

## StudioNet completion gates

### Gate A — automated quality

- StreakPact V2 and MicroWagers pass `genvm-lint check`.
- Direct tests, including exploit regressions, pass.
- The StreakPact web app type-checks, builds, and passes its production dependency audit.
- Deployment scripts compile and keep their preflight enabled.

### Gate B — deployment and configuration

- Both contracts are deployed to StudioNet with zero fees and demo-friendly timing.
- Source hashes, constructor parameters, transaction hashes, and addresses are recorded in `deployments/`.
- `NEXT_PUBLIC_STREAKPACT_V2_ADDRESS` points to the V2 record.
- The MicroWagers static app points to its current recorded address rather than a historical prototype.

### Gate C — acceptance flows

- StreakPact: create, join, cancel, submit evidence, synchronize misses, settle, appeal, finalize, and claim are exercised.
- MicroWagers: create, accept, cancel, resolve, appeal, and claim are exercised.
- At least one inconclusive/void path is confirmed for each relevant AI judgment.
- Desktop and mobile wallet flows are checked against the configured deployments.

### Gate D — tester readiness

- Testers are told that StudioNet GEN has no monetary value.
- The built-in public IPFS path is configured with a restricted server credential and exact production origin.
- Seed examples use short deadlines and objective, stable source pages.
- A feedback channel records pact/wager ID, transaction hash, wallet address, and observed behavior.

Independent security, legal, custody, and economic reviews become relevant only if either product later moves beyond the current zero-value StudioNet scope.
