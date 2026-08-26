# Security policy

## Supported release track

`contracts/streak_pact_v2.py`, `apps/streakpact-web`, `contracts/micro_wagers.py`, `contracts/bounty_forge.py`, `apps/bountyforge-web`, and `frontend/index.html` are supported StudioNet test surfaces. StreakPact V1 is historical. None of these StudioNet demos should be represented as an audited mainnet system.

## Reporting

Report contract or test-escrow vulnerabilities privately before publishing them. Include the affected contract version, transaction or pact/wager ID when applicable, reproduction steps, expected invariant, and observed result.

## Non-negotiable controls

- Never request, log, transmit, or persist a user private key.
- Never configure a frontend with an address that does not match the recorded StudioNet deployment.
- Never skip finalized execution-result checks.
- Never deploy from a generated account that cannot be recovered.
- Never broaden the evidence URL policy without a threat-model update.
- Never expose `PINATA_JWT` through a `NEXT_PUBLIC_` variable, browser bundle, log, or API response.
- Use a Pinata key restricted to file writes, lock production uploads to `STREAKPACT_APP_ORIGIN`, and add hosting-level rate limits before broad public testing.
- Treat every StreakPact evidence artifact as permanently public; do not publish credentials, private health data, or personal identifiers.
- Never add owner controls that can rewrite outcomes, seize escrow, or block valid refunds/claims.
