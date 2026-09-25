# OutageBond StudioNet release

Release: **0.2.0-studionet**. [Live app](https://outagebond.vercel.app). Contract: `0x2893BfB51B80A3ABEE168732f1B3bF86Cde08082`.

This replacement supersedes v0.1 at `0x0A4535CC2c14cA09A9b62b1CC3e00876Dd5722F4`; that immutable contract was not upgraded. Its deployment record is preserved under `deployments/history/`.

The release includes the GenLayer intelligent contract, the Next.js wallet-connected dapp in `apps/outagebond-web`, direct lifecycle/regression tests, and a verified StudioNet deploy script.

## Preflight and deploy

```powershell
python scripts/deploy_outage_bond.py --ephemeral-studionet-deployer
```

This runs GenVM lint and both `test_outage_bond*.py` suites, deploys with a disposable signer, checks finalized success, compares the deployed source SHA-256 with the preflighted source, and verifies `get_stats`. It writes the public deployment record and updates only OutageBond's local public address values. No other product key is used. A recoverable key can instead be supplied through `OUTAGEBOND_PRIVATE_KEY`; the deploy script never stores it. To reconcile a known deployment hash without sending another, use `--resume-transaction HASH`.

## Frontend verification

```powershell
cd apps/outagebond-web
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
pnpm dev
```

See [the architecture note](architecture/outagebond.md) for the immutable policy, evidence, threshold, retry, and escrow rules. StudioNet GEN has no monetary value; OutageBond is an experimental demo and is not production insurance.

## Live acceptance

```powershell
python scripts/outagebond_acceptance.py --origin https://outagebond.vercel.app
```

The runner journals broadcasts before sending, resumes the same hashes, uses only dedicated test wallets in the ignored `.outagebond-private/` directory, and records public evidence in `deployments/outage_bond_acceptance.json`. Never delete those wallets or the journal to work around a pending transaction. The run funds only test collateral using StudioNet's public faucet. It checks eligible payout plus recipient balance delta, failed unauthorized/duplicate collection, ineligible collateral release, and terminal unverifiable release after three committed attempts. Long timeouts/grace periods and cross-midnight adversarial cases are exercised in deterministic direct tests, not by changing shared StudioNet time.

The two live report fixtures are explicitly synthetic and controlled by the demo author. Different public hosts demonstrate real fetching and consensus, **not independent organizations or a real outage**. `/api/demo-incident` is an intentionally open synthetic fixture generator, never an authoritative status service.

## Hosting

Vercel project `outagebond`, separate from UptimeBond. Production and preview builds need `NEXT_PUBLIC_OUTAGEBOND_ADDRESS` and `NEXT_PUBLIC_NETWORK_NAME=StudioNet`. The health route reports configured values; use `/status` for finalized chain reads. Neither a configured address nor a green HTTP response is proof that an individual transaction succeeded.
