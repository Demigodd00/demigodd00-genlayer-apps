# Hackathon Judge security and limitations

## Security properties

- **No privileged judge:** the deployer receives no role. Evaluation and finalization are permissionless.
- **Immutable terms:** rulebook, rubric, threshold, deadline, appeal window, and prize are fixed at creation.
- **Immutable evidence:** submission and appeal pages are normalized, hashed, independently re-rendered, and accepted only when validators match both the exact snapshot and digest.
- **Prompt-injection boundary:** evidence, entrant summaries, and appeal statements are explicitly treated as untrusted data and cannot redefine role, output schema, or security rules.
- **Consensus-safe output:** exact comparison is limited to eligibility and coarse score band; confidence is bounded; free-form reasoning is excluded.
- **Deterministic settlement:** winner ranking, tie-breaking, refunds, credits, and credentials do not invoke an LLM.
- **Bounded state:** input lengths, page size, submission count, score values, evidence size, URL format, and appeal count are capped.
- **Escrow accounting:** prize funds move through owned app credit. Withdrawal zeroes credit before the external transfer.
- **Frontend finality:** the dApp reports success only after StudioNet finalization and a successful execution result.
- **No key custody:** the web app uses an injected wallet and never requests or stores private keys.
- **Judgment liveness:** an unresolved initial judgment or appeal can be permissionlessly converted to `INCONCLUSIVE` after 24 hours, allowing deterministic finalization and refund settlement.

## Known limitations

- `web.render()` observes rendered text, not a cryptographic build artifact. A page can make false claims; the protocol judges evidence quality but does not prove software provenance.
- Public pages may render differently across geography, time, or anti-bot infrastructure. Exact digest agreement intentionally rejects unstable evidence.
- Screenshots, video, wallet-gated demos, and very dynamic applications should publish a stable text evidence page.
- LLMs can still make poor but consensus-compatible judgments. Coarse score bands and appeals reduce, not eliminate, this risk.
- A single appeal is a product bound, not a claim that every dispute can be resolved in two passes.
- The timeout fallback deliberately chooses no winner for the unresolved entry; it restores liveness but does not attempt to manufacture validator agreement.
- Earliest-submission tie-breaking is deterministic but may reward timing. Future versions could support multiple awards or explicit tie rules.
- Address-based credentials are portable across events using the same contract but do not prove a persistent human identity.
- StudioNet is a test environment. Its GEN is simulated and the release is not audited for mainnet-value custody.

## Operational guidance

- Write rules that distinguish clear violations from missing evidence.
- Ask entrants for stable, public, text-rich evidence pages.
- Keep prize values within the configured caps and withdraw unused credit.
- Treat an `INCONCLUSIVE` result as an evidence failure, not an accusation of misconduct.
- Inspect the saved evidence digest and transaction finality before relying on a result.
