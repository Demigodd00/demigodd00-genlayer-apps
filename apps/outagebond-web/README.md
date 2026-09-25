# OutageBond web app

[Live StudioNet demo](https://outagebond.vercel.app) · [Review guide](../../docs/OUTAGEBOND_SUBMISSION.md) · [Regression report](../../docs/OUTAGEBOND_REVIEW.md)

OutageBond is a GenLayer StudioNet dapp for collateral-backed service incident compensation. Providers register an immutable outage policy and lock the maximum payout; the named beneficiary submits a completed incident window and two public report URLs. Anyone can request attestation. Validators independently fetch both sources and agree on the derived eligibility verdict as well as the evidence interval. The beneficiary collects an eligible payout onchain.

## Run

From the repository root:

```powershell
python scripts/deploy_outage_bond.py --ephemeral-studionet-deployer
cd apps/outagebond-web
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm dev
```

The deployment script runs GenVM lint and direct regression tests, deploys on StudioNet, verifies the deployed source hash and protocol configuration, records the deployment at `deployments/outage_bond_studionet.json`, and configures `.env.local` for this app. The ephemeral signer is not persisted and has no contract admin role. For a recoverable signer, set `OUTAGEBOND_PRIVATE_KEY` in the process environment and omit `--ephemeral-studionet-deployer`.

For local frontend checks without deployment, copy `.env.example` to `.env.local` and leave the contract address empty. Transactions remain disabled in preview mode.

To inspect the existing v0.2 release without deploying, set `NEXT_PUBLIC_OUTAGEBOND_ADDRESS=0x2893BfB51B80A3ABEE168732f1B3bF86Cde08082` and `NEXT_PUBLIC_NETWORK_NAME=StudioNet` in `.env.local`.

Transaction timeouts are unknown outcomes, not failures. Reconnect the same wallet and use the saved-transaction recovery panel; do not clear local storage or send a replacement deposit. Modern HTTPS browsers with Web Locks are required for cross-tab safety. Synthetic demo reports are deliberately labeled and are not independent real-world evidence.

StudioNet GEN is test currency and has no monetary value. This release is an experimental testnet demo, not production insurance or a financial-safety claim.
