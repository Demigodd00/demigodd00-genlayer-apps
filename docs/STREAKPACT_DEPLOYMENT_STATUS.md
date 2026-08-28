# StreakPact by demigodd00: StudioNet deployment status

Checked on 2026-08-28. The intelligent contract is deployed and verified;
the public website and full hosted acceptance run are still pending.

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

## Verified

- The saved signer derives the configured treasury address. No private key was
  printed, committed, or uploaded to a hosting provider.
- The deployment receipt is `FINALIZED` and the leader execution result is
  `SUCCESS`, with no GenVM error. Finality alone was not treated as success.
- Live `get_config` returns the expected version and treasury, zero fees,
  60-second periods, and a 300-second appeal window.
- Live `get_stats` returns an empty initial state; no acceptance pacts have yet
  been created against this release address.
- The deployed contract schema is available.
- `gen_getContractCode` returns 32,440 bytes whose SHA-256 matches the release
  source. StudioNet accepted the address-string parameter form. An EVM
  `eth_getCode` lookup returned empty and was not used as the code check.
- The local frontend address matches the deployment record.
- `python scripts/check_streakpact_release.py --require-deployment` passes:
  GenVM validation, pinned runner verification, 13 direct contract tests,
  deployment-script compilation, 20 web API tests, TypeScript checking,
  production build, dependency audit, and deployment provenance checks.
- The production dependency audit reported no known vulnerabilities.
- GitHub reports `Demigodd00/streakpact` as private. Local deployment and server
  environment files are Git-ignored.

Local web checks used bundled Node.js `24.19.0` and emitted the expected engine
warning because the project targets Node.js `22.x`. Vercel must use the configured
Node.js 22 runtime; its production build remains part of hosted acceptance.

## Still required for the website launch

1. Configure the restricted Pinata upload JWT. `PINATA_JWT` is still absent from
   the local server environment. Keep the wallet private key out of Vercel.
2. Finish the Vercel project configuration, using the recorded contract address,
   `NEXT_PUBLIC_NETWORK_NAME=StudioNet`, the server-only Pinata JWT, and the exact
   production HTTPS origin. Deploy or redeploy after setting these values.
3. Publish the Vercel Firewall upload rate limit from the hosting checklist.
4. Verify the hosted health endpoint, real evidence upload and download digest,
   wallet connection, mobile layout, and invite links.
5. Record the two-wallet acceptance matrix against this exact release address,
   including successful evidence, missed periods, appeals, cancellation,
   challenge joining, finalization, and claims. Earlier temporary-contract tests
   do not replace this acceptance run.

Follow the [Vercel checklist](STREAKPACT_VERCEL_DEPLOYMENT.md) and
[StudioNet release runbook](STREAKPACT_STUDIONET_RELEASE.md) for the remaining work.
