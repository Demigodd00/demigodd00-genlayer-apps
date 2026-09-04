# MicroWagers StudioNet release

MicroWagers by demigodd00 is a source-bound, two-sided prediction market for GenLayer StudioNet. Test GEN has no monetary value. This release is separate from the StreakPact submission.

## Release identity

| Item | Release value |
|---|---|
| Live app | https://microwagers.vercel.app |
| Read-only status | https://microwagers.vercel.app/status |
| Contract | `0xe7B8E25a7608176168d4cfA84691B53d1715bADE` |
| Explorer | https://explorer-studio.genlayer.com/address/0xe7B8E25a7608176168d4cfA84691B53d1715bADE |
| Deployment transaction | `0xf15e83775086b60e015365b76df056dfb1e7a9c9f836afb26f8bae8bd7e0d0d8` |
| Source SHA-256 | `e15382ce97e3ecfddcd2789597a0e54b302293e0e8a736011319c6ede30ea7d9` |
| Fee | `0` basis points |
| Appeal window | `300` seconds |
| Unresolved-market recovery | `600` seconds after deadline |
| Web deployment | `dpl_w2LqVe8i3JiX8vfUREQue8PrRV8b` |
| Application source commit | `793fcec27d554500d2f10ae66fbcc58cf53a0f4d` |
| Release records commit | `0c6fb509401801588f4e96d5c8f01b28d68c45ed` |

The exact deployment, acceptance, and hosting records are in [`deployments/micro_wagers_studionet.json`](../deployments/micro_wagers_studionet.json), [`deployments/micro_wagers_acceptance.json`](../deployments/micro_wagers_acceptance.json), and [`deployments/micro_wagers_vercel.json`](../deployments/micro_wagers_vercel.json). Superseded V1.1 records are retained under `deployments/history/`.

## Why this is GenLayer-native

GenLayer is the settlement layer, not a generic AI add-on. After a matched market reaches its deadline, validators fetch the market's immutable public HTTPS source and independently compare that evidence with the two fixed positions. Comparative consensus requires agreement on both the outcome and a bounded confidence bucket. A decisive result changes escrow into provisional settlement; ambiguous or low-confidence evidence voids the wager and refunds both participants.

The losing participant may submit one bonded appeal. That starts an independent validator refetch and review using the original reason and appeal statement. Claims remain locked through the five-minute appeal window. No owner or admin can select a winner, rewrite a verdict, suppress an appeal, or move participant escrow.

## Evidence provenance

Each adjudication stores the exact UTF-8 source snapshot that validators compared, its SHA-256 digest, byte and character counts, source URL, judgment time, outcome, confidence bucket, winner, and reason. Invalid UTF-8, malformed or private source URLs, NUL bytes, and oversized content are rejected instead of being silently truncated.

Original and appeal adjudications are preserved as separate immutable records. The public app exposes both records and their exact snapshots. This proves which bytes GenLayer validators judged and when; it does not claim that a fetched page was authored by a participant or that its contents were historically frozen at the market deadline.

If no adjudication finalizes within ten minutes after the deadline, any wallet can call the recovery method. The contract voids the unresolved market and credits both original test stakes. This prevents StudioNet liveness issues from trapping test GEN.

## User and owner boundaries

Users can create, match, cancel an unmatched wager, request resolution after the deadline, appeal a provisional loss, claim after the appeal window, or trigger timeout recovery. The interface checks network, role, amount, deadline, and finality, while the contract independently enforces every rule.

The deployer is only the deployment account and zero-fee treasury. `/status` is read-only and exposes the contract address, release configuration, and public activity totals. It has no settlement controls.

## Exact-address acceptance

The V1.2 release was exercised against the exact deployed address with creator, taker, and independent observer wallets:

- deployment source and all constructor settings matched the validated local release;
- a non-creator cancellation failed, then creator cancellation returned the unmatched `0.001` test-GEN stake;
- self-matching, incorrect stake, early resolution, early timeout recovery, invalid appeal roles, duplicate appeal, premature claim, and non-winner claim all failed as intended;
- the observer permissionlessly recovered matched unresolved wager `w-2`, and both `0.001` test-GEN stakes were credited;
- validators resolved `w-4` from Example Domain, storing its exact 559-byte snapshot and SHA-256 digest;
- the losing wallet appealed, validators independently refetched the source, and the original and appeal records remained separately visible;
- after the appeal window, the winner claimed the credited `0.003` test-GEN pot;
- final contract statistics were four created wagers and one settled wager.

One initial positive-match acceptance transaction reached contract execution after its deliberately short test deadline. The contract correctly rejected it, the harness classified the timing event, the unmatched stake was refunded, and the script created `w-4` with a longer deadline to complete the positive lifecycle. This is retained in the journal rather than hidden.

The release also passed 37 direct contract tests, 30 frontend tests, TypeScript validation, a Next.js production build, a production dependency audit with no known high-severity vulnerabilities, production route and health checks, security-header checks, and both GitHub workflows for source commit `793fcec27d554500d2f10ae66fbcc58cf53a0f4d`.

## Reviewer path

1. Open https://microwagers.vercel.app/markets?wager=w-4 for the settled and appealed lifecycle, including both immutable adjudication records.
2. Open https://microwagers.vercel.app/markets?wager=w-2 for permissionless timeout recovery and both refunded stakes.
3. Open https://microwagers.vercel.app/status to compare the live address and release settings with the Explorer and JSON records.

## Repeat the release gate

```bash
python scripts/check_micro_wagers_release.py --require-hosting
```

Real acceptance writes are already recorded. `scripts/microwagers_acceptance.py` is resume-safe and reuses recorded transaction hashes; do not delete its journal and rerun it casually.

## Scope

This is a StudioNet demonstration, not a real-money product or a mainnet security claim. Sources must be public HTTPS pages, readable by validators, bounded in size, and suitable for objective comparison. StudioNet availability and validator consensus can add confirmation time. Genuinely ambiguous evidence is intentionally refunded rather than forced into a winner.
