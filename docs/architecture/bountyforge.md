# BountyForge release architecture

BountyForge is a GenLayer-native settlement protocol for public GitHub work. The contract owns escrow, claim identity, evidence re-fetching, validator agreement, appeal/challenge windows, and terminal payout state. The web app is a non-custodial client: it helps users form valid transactions and displays contract state, but it never decides whether work is complete.

## State flow

```text
OPEN
 ├─ cancel (sponsor, no claims) ───────────────> CANCELLED
 ├─ expire (permissionless, deadline, no appeal) > REFUNDED
 ├─ submit_claim (hunter + exact SHA/login/marker)
 │    └─ PENDING ─ resolve_claim (permissionless)
 │         ├─ INCONCLUSIVE + stake refund ─────> INCONCLUSIVE
 │         ├─ NOT_FIXED ────────────────────────> REJECTED_PENDING_APPEAL
 │         │    ├─ appeal + FIXES ──────────────> AWARDED
 │         │    ├─ appeal + NOT_FIXED ──────────> REJECTED_FINAL
 │         │    └─ window expiry ───────────────> REJECTED_FINAL
 │         └─ FIXES ────────────────────────────> AWARDED
 │                                                   ├─ challenge + NOT_FIXED -> OPEN
 │                                                   ├─ challenge + FIXES -----> AWARDED
 │                                                   └─ window expiry ----------> FINALIZED -> SETTLED
```

## User and sponsor boundaries

- Hunters must publish the wallet marker in the PR body and provide the current head SHA. Validators re-check the PR author, SHA, marker, and diff, so a stale or impersonated submission fails before an award.
- Sponsors define criteria and fund escrow. They cannot rewrite an adjudication, seize a stake, or bypass a finalized payout. Their only dispute action is a bonded challenge during the explicit challenge window.
- Permissionless actions keep the system from depending on an owner-operated keeper: anyone can resolve claims, close expired rejection appeals, finalize awards, and expire eligible bounties.
- The dApp never handles private keys. It uses an injected wallet and waits for a finalized GenLayer execution result before showing success.

## Deployment boundary

The contract must be deployed first with a recoverable deployer/treasury key. After the receipt is verified, copy the recorded address into `apps/bountyforge-web/.env.local` as `NEXT_PUBLIC_BOUNTYFORGE_ADDRESS`, build the app, and host the static Next output. Do not publish an address until it matches the deployment record for the selected network.

The GitHub API remains an external mutable source. The contract binds the claim to the PR head SHA and recomputes a source digest on every adjudication; a changed PR produces a different evidence digest and cannot silently retain an old identity. A future v3 should add an explicit immutable issue snapshot/digest if sponsors need criteria to remain independent of GitHub issue edits.
