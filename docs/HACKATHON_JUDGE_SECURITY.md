# Hackathon Judge v2.3 security and limitations

## Enforced properties

- Signed entrant transactions and repository challenge lines bind evidence to a wallet, event, contract, repository and file path.
- Independent validators verify public GitHub repository identity, default-branch head, file record and Git blob digest before agreeing on immutable rendered text.
- A canonical package digest binds the provenance record, snapshot digest, summary or appeal statement, and parent package.
- A new appeal file must contain its own challenge linked to the original evidence package.
- Judging and finalization validate saved package integrity. Invalid provenance cannot receive prize credit or a winner credential.
- Rules and event terms are immutable. No deployer/administrator can select winners or override judgments.
- Evidence and summaries are untrusted input to the LLM; schema, eligibility, score bands and confidence bounds are checked independently.
- Prize accounting, ranking, tie-breaking and refunds are deterministic. Withdrawal zeroes credit before emitting a transfer.
- A 24-hour permissionless timeout makes unresolved judgments inconclusive, keeping them ineligible for prizes.
- The app requests wallet transactions, never private keys, and requires successful finalized execution before reporting success.

## What provenance proves

GitHub's HTTPS/API records and publication of a contract/event-specific wallet challenge establish publication control or authorization in the named repository at capture. The contract checks repository and file identity, rather than accepting repository claims from an evidence page or LLM.

This does not prove legal ownership, original authorship, a unique person, honest project claims, or control of linked deployment addresses. Git commit signatures are not required or represented as verified. A fork is identified as a fork and proves publication only in that fork. Deployment-only proofs and private repositories are unsupported.

## Availability and remaining risks

GitHub and renderer availability are dependencies. Rate limits or inconsistent records fail closed; no entry is reserved. A default-branch update during capture may cause validator disagreement; retry with a stable head. The frozen result remains valid as a historical capture if the repository later changes or disappears.

Only public UTF-8 .txt files, simple paths and bounded text are accepted. Dynamic web pages, binary artifacts, screenshots and videos must be described in a qualifying evidence file; statements about linked material are not automatically authenticated.

LLMs may agree on a poor judgment or mishandle malicious prose. Coarse scores and a single appeal reduce but do not eliminate judgment risk. Wallet-based credentials do not establish human identity. StudioNet is a testing environment, its GEN is simulated, and this release has not received an independent custody/security audit.

## Verification

Direct tests cover wrong-wallet/event/contract/repository/path replays, untrusted URLs, non-default branches, tampered blob/render content, provider errors, appeal parent mismatch and settlement after stored-package corruption. The live acceptance run proves wrong-wallet rejection before two authenticated submissions, an evidence appeal, finalization and withdrawal. See [the response pack](HACKATHON_JUDGE_STEWARD_RESPONSE.md) and [recorded transactions](../deployments/hackathon_judge_demo.json).
