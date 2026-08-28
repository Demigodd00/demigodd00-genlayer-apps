# StreakPact V2 StudioNet release runbook

StreakPact is a zero-value StudioNet application. “Deployable” means the source and UI pass their repeatable gates. A deployed release has a recorded contract address and hosted website; launch acceptance additionally requires the real two-wallet checks against that exact address. StudioNet is temporary and may reset, so a release address is not a promise of permanent state.

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

This runs GenVM lint/validation, all StreakPact V2 direct tests, deployment-script compilation, web API and interface safeguard tests, web type checking, a production build, and the production dependency audit. A missing release deployment is reported as pending rather than failing the pre-deployment gate.

## 2. Evidence publisher

Create a Pinata JWT restricted to `org:files:write`; do not use an unrestricted account token. The app follows Pinata's current public-file upload API and explicitly selects the public network: [official upload endpoint](https://docs.pinata.cloud/api-reference/endpoint/upload-a-file).

Configure these hosting secrets and variables:

```text
PINATA_JWT=server-only-token
STREAKPACT_APP_ORIGIN=https://the-exact-production-origin.example
NEXT_PUBLIC_NETWORK_NAME=StudioNet
```

The publisher accepts only non-empty JSON or plain text up to 100,000 bytes, applies a basic per-instance rate limit, removes the original filename, and never returns the JWT. Because IPFS evidence is public and content-addressed, testers must not upload secrets, personal identifiers, or sensitive health data. Add a platform/WAF rate limit before distributing the app broadly; the in-process limit is only a first layer.

## 3. Recorded StudioNet deployment

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
2. The zero-check-in lifecycle, real-evidence consensus and matched two-wallet
   challenge checks pass. The exact-release matrix in section 7 covers these
   paths without deploying temporary contracts.
3. The hosted `/api/health` reports the contract, evidence publisher, origin lock, and tester readiness as configured.
4. The two-wallet acceptance matrix is recorded against the exact release address.
5. Every tester entry point says StudioNet test GEN has no monetary value.
6. Real wallet-provider and physical-device checks are signed off separately;
   mocked providers and SDK signer tests do not substitute for these checks.

Moving beyond StudioNet requires a fresh security, legal, economic, privacy, and operations review; this runbook does not claim mainnet readiness.

## 7. Repeatable exact-release checks

The release acceptance scripts use the existing deployment record. They never
deploy a replacement contract or fund a wallet. Run one acceptance process at a
time; the journal resumes submitted transaction IDs instead of blindly sending
them again.

```bash
python scripts/check_streakpact_hosted.py fixtures
python scripts/check_streakpact_hosted.py protection
python scripts/run_streakpact_acceptance.py cancellations
python scripts/run_streakpact_acceptance.py prepare_losses
python scripts/run_streakpact_acceptance.py self_win
python scripts/run_streakpact_acceptance.py final_matrix
```

These commands publish two tiny synthetic public JSON files and create clearly
labeled, valueless acceptance pacts. The second signer is reproducibly derived
from the saved owner signer with a separate test-account context; no private key
is printed or stored in the public records. Preserve the owner's ignored `.env`
and the transaction journal. Do not delete the journal to retry pending writes.

Results are stored in `deployments/streak_pact_v2_acceptance.json` and
`deployments/streak_pact_v2_hosted_checks.json`. They include actual execution
outcomes and credited native-transfer receipts, not finality alone. The public
test records intentionally accept synthetic reading logs; they are not claims
that real-world activities were independently observed.

The browser uses StudioNet's `consensus_data.leader_receipt.execution_result`
when the SDK's normalized execution field is absent. Regression tests retain
the real successful and rejected receipt shapes. A `FINALIZED` transaction with
a failed or unknown execution result must never be shown as confirmed.

Wallet-provider rejection, account/network changes, and shared recipient actions
have unit coverage. A real MetaMask connect/sign/reject check on the public site
and a physical-phone check remain separate manual acceptance items; SDK signer
tests do not prove browser-extension behavior.

The pinned JavaScript SDK's `connect()` helper also requests a MetaMask Snap.
This app instead uses standard EIP-1193 account requests plus network
switching/adding and checks the resulting chain. Its transaction path uses the
ordinary wallet provider and does not require a Snap. Never import the saved
deployment key into the website. If a wallet needs a test balance, StudioNet has
a built-in faucet in its account selector; do not send real funds. See the
[official network guide](https://docs.genlayer.com/developers/networks).
