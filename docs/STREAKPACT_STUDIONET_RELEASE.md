# StreakPact V2 StudioNet release runbook

StreakPact is a zero-value StudioNet application. “Deployable” means the source and UI pass their repeatable gates. “Deployed” additionally means the owner has supplied a recoverable signer, created a permanent StudioNet contract, configured the hosted app, and completed the two-wallet acceptance run against that exact address.

For the website setup, use the [Vercel deployment checklist](STREAKPACT_VERCEL_DEPLOYMENT.md).

## 1. Pre-deployment gate

Use Python 3.12 and Node.js 22.

```bash
pip install -r requirements-deploy.txt
cd apps/streakpact-web
pnpm install --frozen-lockfile
cd ../..
python scripts/check_streakpact_release.py
```

This runs GenVM lint/validation, all StreakPact V2 direct tests, deployment-script compilation, web API safeguard tests, web type checking, a production build, and the production dependency audit. A missing permanent deployment is reported as pending rather than failing the pre-deployment gate.

## 2. Evidence publisher

Create a Pinata JWT restricted to `org:files:write`; do not use an unrestricted account token. The app follows Pinata's current public-file upload API and explicitly selects the public network: [official upload endpoint](https://docs.pinata.cloud/api-reference/endpoint/upload-a-file).

Configure these hosting secrets and variables:

```text
PINATA_JWT=server-only-token
STREAKPACT_APP_ORIGIN=https://the-exact-production-origin.example
NEXT_PUBLIC_NETWORK_NAME=StudioNet
```

The publisher accepts only non-empty JSON or plain text up to 100,000 bytes, applies a basic per-instance rate limit, removes the original filename, and never returns the JWT. Because IPFS evidence is public and content-addressed, testers must not upload secrets, personal identifiers, or sensitive health data. Add a platform/WAF rate limit before distributing the app broadly; the in-process limit is only a first layer.

## 3. Permanent StudioNet deployment

Use a recoverable owner-controlled key. StudioNet is gasless and the contract enforces a zero protocol fee in this deployment script.

Either export the variables in the deployment shell or place them in the ignored root `.env` file. Never commit or paste these values into chat:

```text
STREAKPACT_PRIVATE_KEY=0x...
STREAKPACT_TREASURY=0x...
STREAKPACT_NETWORK=studionet
```

```bash
export STREAKPACT_PRIVATE_KEY=0x...
export STREAKPACT_TREASURY=0x...
export STREAKPACT_NETWORK=studionet
python scripts/deploy_streak_pact_v2.py \
  --fee-bps 0 \
  --period-secs 60 \
  --appeal-window-secs 300 \
  --configure-frontend
```

The script keeps preflight enabled, waits for the receipt, checks execution, writes `deployments/streak_pact_v2_studionet.json`, and optionally upserts the address into the ignored local frontend environment file. Do not use `--skip-preflight` for the release deployment.

For a hosted build, set the same recorded address:

```text
NEXT_PUBLIC_STREAKPACT_V2_ADDRESS=0x...
```

Then run:

```bash
python scripts/check_streakpact_release.py --require-deployment
```

This rejects a stale source hash, non-zero fee, skipped preflight, malformed address, unpinned runner mismatch, or frontend address that differs from the recorded deployment.

## 4. Real evidence consensus smoke test

Publish a small record like this through the app:

```json
{"activity":"reading","completed":true,"duration_minutes":35,"recorded_at":"2026-08-26T12:00:00Z"}
```

Use the returned approved URL in the opt-in hosted StudioNet test:

```bash
export STREAKPACT_TEST_EVIDENCE_URL=https://gateway.pinata.cloud/ipfs/...
gltest tests/integration/test_streak_pact_v2_evidence_studionet.py --network studionet -v -s
```

The test independently downloads the bytes, computes SHA-256, deploys a temporary zero-fee contract, submits the artifact, and requires a `KEPT` verdict finalized through real validators. It skips when no fixture URL is supplied.

## 5. Owner acceptance matrix

Record the wallet addresses, transaction hashes, pact IDs, and observed result for each flow:

- Self pact: create, successful evidence period, elapsed-period misses, provisional loss, finalization, recipient claim.
- Challenge: create, invite link, exact-stake join from a second wallet, success and failure payout paths.
- Cancellation: self pact before start and unmatched challenge cancellation/refund.
- Appeal: adversely affected participant submits one replacement artifact; unauthorized and second appeals fail.
- Wallet/UI: rejection, execution failure, refresh recovery, account switch, mobile layout, and direct invite-link opening.
- Operations: contract config reads correctly; fee is zero; evidence service, address, and origin gates are green; no outcome-changing owner action exists.

## 6. Final release condition

The owner can call the product finished for StudioNet when:

1. `check_streakpact_release.py --require-deployment` passes.
2. The zero-check-in lifecycle and real-evidence StudioNet tests pass.
   The matched two-wallet challenge smoke test must also pass.
3. The hosted `/api/health` reports the contract, evidence publisher, origin lock, and tester readiness as configured.
4. The two-wallet acceptance matrix is recorded against the exact permanent address.
5. Every tester entry point says StudioNet test GEN has no monetary value.

Moving beyond StudioNet requires a fresh security, legal, economic, privacy, and operations review; this runbook does not claim mainnet readiness.
