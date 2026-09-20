# SponsorProof

A GenLayer-native two-party sponsorship agreement workspace. State, frozen evidence, decisions and payment allocations live in the SponsorProof intelligent contract, not a browser database or trusted AI server.

Contract: `0x0235c7f7E646bA26532587aFED3108148C92Ef2f` on StudioNet. All GEN is simulated. The accepted Hackathon Judge app and contract are independent and unchanged.

Use Node 24. Install the lockfile with `npm ci`, then `npm run dev` or `npm run build`. Typecheck with `npx tsc --noEmit --incremental false`; run exact-amount tests with `node --experimental-strip-types --test tests/protocol.test.mjs`.

The interface supports proposals, organizer acceptance, exact sponsor funding, source challenges/capture, early sealing, independent judgments, one shared appeal round, settlement, held-fund splits/timeouts and claims. Wallet/network changes invalidate the session. A pending transaction hash is retained in session storage; no private keys or authoritative agreement state are stored there. Execution success is verified independently of finality status.

`inspect_sponsorship_agreement` is an optional read-only WebMCP tool. It displays existing on-chain state and never signs transactions. Unsupported browsers use the ordinary interface.

See [reviewer guide](https://github.com/Demigodd00/demigodd00-genlayer-apps/blob/main/docs/SPONSORPROOF_REVIEW.md) for evidence, limits and reproduction instructions.
