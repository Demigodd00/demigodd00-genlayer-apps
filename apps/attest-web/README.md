# ATTEST

ATTEST is a GenLayer StudioNet public claims docket. An author publishes a checkable claim, a verification rule, public evidence URLs, a deadline, and a GEN bond. A second wallet can challenge with a counter-bond and contrary sources. GenLayer validators independently fetch and evaluate the declared sources after the deadline, then the contract assigns withdrawable credit by the agreed outcome. StudioNet GEN is test currency with no monetary value.

The [hosted app](https://attest-web-silk.vercel.app) reads the [verified StudioNet contract](https://explorer-studio.genlayer.com/address/0x3aFF086e8AAa7707b29ad88a9ebDf581d2d6Ef41). Without `NEXT_PUBLIC_ATTEST_ADDRESS`, a local build shows clearly labeled sample records and disables writes. The release and acceptance evidence is tracked in [the ATTEST reviewer guide](../../docs/ATTEST_REVIEW.md).

## How funds move

1. Connect a wallet on StudioNet and call `deposit()` to add recoverable GEN credit.
2. Publish a claim or challenge. These calls attach **zero** GEN and spend the required credit only after contract checks pass.
3. After the deadline, anyone may finalize an unchallenged claim or ask GenLayer to resolve a challenged one.
4. Withdraw unused deposits, returned bonds, or winnings from available credit. If a dispute cannot finalize within seven days after its deadline, anyone may refund each party's bond.

The author bond is 0.004–1,000 GEN. The challenger posts max(10% of that bond, 0.001 GEN). `SUPPORTED` credits both bonds to the author; `DISPROVEN` credits both to the challenger; `INCONCLUSIVE` returns each bond. `UNCONTESTED` returns the author bond without verifying the claim. `TIMEOUT_REFUND` returns both bonds without a verdict.

Each side may name one or two public HTTPS URLs. URLs are fixed when submitted, but external page contents are captured **at adjudication**, not publication. Pages over 48 KB or 6,000 normalized characters are excluded as `TOO_LARGE`. Sources should be concise and stable; changing content can prevent validators from accepting a result. The record exposes the accepted snapshot, SHA-256 digests, and line citations. The app has one challenger, one author response, no administrator override, and no application-level appeal.

The app saves a submitted transaction hash until its final outcome is known. If finality times out, use **Check pending transaction** before sending another write. A finalized transaction can still contain a contract execution error; the app checks both finality and execution.

## Run locally

Use Node.js 22 and pnpm:

~~~powershell
cd apps/attest-web
pnpm install --frozen-lockfile
Set-Content .env.local 'NEXT_PUBLIC_ATTEST_ADDRESS=0x3aFF086e8AAa7707b29ad88a9ebDf581d2d6Ef41'
pnpm dev
~~~

To verify the contract and app from the repository root without broadcasting a deployment:

~~~powershell
python scripts/deploy_attest.py
~~~

After a verified deployment, set `NEXT_PUBLIC_ATTEST_ADDRESS` in `.env.local` to the deployed contract address and restart the app. The frontend uses an injected EVM wallet and never requests or stores a private key.
