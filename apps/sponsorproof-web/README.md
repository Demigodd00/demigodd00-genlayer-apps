# SponsorProof

A GenLayer-native two-party sponsorship agreement workspace. State, frozen evidence, decisions and payment allocations live in the SponsorProof intelligent contract, not a browser database or trusted AI server.

Contract: `0x0235c7f7E646bA26532587aFED3108148C92Ef2f` on StudioNet. All GEN is simulated. The accepted Hackathon Judge app and contract are independent and unchanged.

Use Node 24. Install the lockfile with `npm ci`, then `npm run dev` or `npm run build`. Typecheck with `npx tsc --noEmit --incremental false`; run exact-amount tests with `node --experimental-strip-types --test tests/protocol.test.mjs`.

The interface supports proposals, organizer acceptance, exact sponsor funding, source challenges/capture, early sealing, independent judgments, one shared appeal round, settlement, held-fund splits/timeouts and claims. Wallet/network changes invalidate the session. A pending transaction hash is retained in session storage; no private keys or authoritative agreement state are stored there. Execution success is verified independently of finality status.

`inspect_sponsorship_agreement` is an optional read-only WebMCP tool. It displays existing on-chain state and never signs transactions. Unsupported browsers use the ordinary interface.

See [reviewer guide](https://github.com/Demigodd00/demigodd00-genlayer-apps/blob/main/docs/SPONSORPROOF_REVIEW.md) for evidence, limits and reproduction instructions.

## Receipt regression checks

Run `node --experimental-strip-types --test tests/protocol.test.mjs tests/receipts.test.mjs` for offline helper/receipt checks (16 tests). Run `node --experimental-strip-types --test tests/receipts.live.test.mjs` for two read-only checks against actual finalized StudioNet demo transactions. These use the frontend's production receipt adapter, no wallet or signing, and distinguish successful execution from a finalized rollback. Neither check creates a new transaction.

The adapter supports StudioNet snake_case leader receipts and normalized SDK execution fields. Missing or inconsistent execution data fails closed; finality or validator agreement alone is never interpreted as success. Existing stored pending hashes can be resolved through **Check receipt** after updating the page, without submitting the original action again.
