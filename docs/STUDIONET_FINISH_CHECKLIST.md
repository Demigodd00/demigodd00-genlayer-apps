# StudioNet finish checklist

The codebase is ready for zero-value StudioNet acceptance testing. The remaining work depends on deployment addresses or external services and therefore cannot be completed from source code alone.

## 1. Deploy the current contracts

- Deploy StreakPact V2 with `fee_bps=0`, `period_secs=60`, and `appeal_window_secs=300`.
- Deploy MicroWagers with `fee_bps=0` and `appeal_window_secs=300`.
- Keep script preflight enabled and commit the generated `deployments/*.json` records.

## 2. Configure the apps

- Put the recorded StreakPact address in `apps/streakpact-web/.env.local` as `NEXT_PUBLIC_STREAKPACT_V2_ADDRESS`.
- Set a server-only, file-write-restricted `PINATA_JWT` and lock uploads to the exact hosted `STREAKPACT_APP_ORIGIN`.
- Put the recorded MicroWagers address in its HTML meta tag, paste it into the contract field, or open the app with `?contract=0x...`.
- Build and publish the Next.js app and the static MicroWagers folder.

## 3. Provide evidence for StreakPact

- Use the built-in public IPFS publisher as the recommended path; approved manual IPFS and Arweave URLs remain available.
- Publish small JSON or text artifacts no larger than 100 KB.
- Confirm the browser-calculated SHA-256 matches the publisher response before submitting the URL and digest.

## 4. Run acceptance scenarios

- StreakPact self-stake success and failure.
- StreakPact challenge join, cancellation, missed-window synchronization, appeal, finalization, and claim.
- MicroWagers creation, acceptance, creator cancellation, resolution, appeal, void, and claim.
- Wallet rejection, failed execution, refresh, mobile layout, and invite-link behavior.

## 5. Seed and hand to testers

- Seed three StreakPacts and three MicroWagers with short, understandable rules.
- Show “StudioNet test environment” and “no monetary value” in every tester entry point.
- Collect the wallet address, transaction hash, pact/wager ID, and screenshot for every reported issue.

The products are “finished for StudioNet” when both recorded deployments are configured and every acceptance scenario above passes against those exact addresses.
