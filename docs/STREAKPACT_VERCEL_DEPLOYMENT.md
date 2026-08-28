# StreakPact by demigodd00: Vercel launch

The GitHub repository stays private. The production website, browser JavaScript,
StudioNet contract source and published IPFS evidence are publicly inspectable.
This is a zero-fee StudioNet demonstration, not a real-money launch.

## Owner-only prerequisites

- Put a dedicated, recoverable StudioNet signer in the ignored root `.env` as
  `STREAKPACT_PRIVATE_KEY`, with its intended `STREAKPACT_TREASURY` address and
  `STREAKPACT_NETWORK=studionet`. Do not paste keys into chat or commit them.
- The signer stays on the deployment machine. Never add it to Vercel.
- Sign in to the Vercel account that should own this app.
- Create a restricted Pinata key with Files Write permission for public uploads.
  Store its JWT as `PINATA_JWT` in Vercel, not a `NEXT_PUBLIC_*` variable.

## Deploy the release contract first

Follow [the release runbook](STREAKPACT_STUDIONET_RELEASE.md). Keep preflight on:

```sh
python scripts/deploy_streak_pact_v2.py --fee-bps 0 --period-secs 60 --appeal-window-secs 300 --configure-frontend
python scripts/check_streakpact_release.py --require-deployment
```

The recorded address in `deployments/streak_pact_v2_studionet.json` is the one to
use for this website. Temporary integration-test contracts are not the release.

## Vercel project

Import `Demigodd00/streakpact` using the owner's GitHub account. If installing the
Vercel GitHub integration, grant access only to this repository when possible.

| Setting | Value |
| --- | --- |
| Project name | `streakpact` (subject to availability) |
| Production branch | `main` |
| Root Directory | `apps/streakpact-web` |
| Framework | Next.js |
| Node.js | 22.x |
| Output Directory | Framework default (`.next`) |

The app's `vercel.json` pins pnpm 11.19.0 for both installation and build. Do not
enable static export: `/api/evidence` needs a server-side function.

Configure Production environment variables:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_STREAKPACT_V2_ADDRESS` | Recorded release contract address |
| `NEXT_PUBLIC_NETWORK_NAME` | `StudioNet` |
| `PINATA_JWT` | Restricted server-only Pinata JWT |
| `STREAKPACT_APP_ORIGIN` | Exact production HTTPS origin; no path or query |

If the final domain is assigned only after the first deployment, add its exact
origin and redeploy before testing uploads. Missing or malformed production
origins deliberately disable uploads. Public variables require a fresh build.
Leave the production Pinata secret out of Preview and Development deployments.
Do not enable paid services or upgrade plans without the owner's approval.

## Upload-abuse protection

Before sharing the app broadly, publish this Vercel Firewall rule:

- Match Request Path equals `/api/evidence` AND Request Method equals `POST`.
- Rate Limit: fixed window, 5 requests per 60 seconds, key = client IP.
- Action: deny excess traffic with HTTP 429, not log-only.
- Confirm the rule is enabled and published. Do not mark this done just because
  the app's local limiter returned 429; that limiter resets across instances.

Origin validation is a browser cross-origin safeguard, not authentication. A
non-browser client can send an Origin header. Rate limits are still necessary.

See [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).

## Live acceptance, not just a successful build

1. Request the production `/api/health`; all configuration gates should be true.
   This verifies configuration only, not contract execution or Pinata access.
2. Open `/admin`; read the actual contract configuration and verify zero fees.
3. Upload a non-sensitive text/JSON fixture through the real website. Download
   the returned public URL and verify its SHA-256 matches the uploaded bytes.
4. Record the full two-wallet acceptance matrix from the release runbook against
   the release address: transaction hashes, pact IDs, outcomes and dates.
5. Verify cross-origin uploads fail, rate limiting returns 429, invite deep links
   work and the mobile layout/wallet recovery flows are usable.
6. Retain the StudioNet/no-monetary-value warning and public-evidence warning.

Record the final website URL, source revision, release address, acceptance
results and firewall status in the release record. A hosting build alone is not
evidence of a finished end-to-end launch.
