# OutageBond v0.2 review resolution

Scope: six reproduced blockers in v0.1, plus submission readiness. The replacement contract source hash is `6531a9750c6800c200091c63055943f1fb6b7a0bddbc41e1d8baf54f9210fa72`.

| Reproduced issue | Resolution | Regression evidence |
| --- | --- | --- |
| Paid claims consumed capacity twice | Decrement eligible when paid; paid remains consumed once | Paid-capacity and second-claim test; live paid coverage |
| Tolerance allowed uncovered outage time | Check extracted start/end against immutable coverage bounds | Outside-coverage report rejection |
| Cross-midnight report paid twice as two partial windows | Reserve every touched UTC day; extracted and submitted day sets must match exactly | Split replay rejected; complete cross-midnight claim succeeds |
| Failed consensus rolled back attempt count and could hold escrow forever | Permissionless `expire_claim` after fixed 24-hour deadline | Three failed independent validations with rollback, then timeout release |
| Timeout unlocked a fresh deposit/ref | Durable intent/ref/hash, cross-tab lock, finalized exact-record reconciliation | Frontend timeout/reload/duplicate/storage/receipt tests |
| Validator trusted forged labels/URLs/reasons | Canonical reconstruction of stored evidence and outcome, then independent comparison | Seven leader-forgery cases rejected |

Verification: GenVM lint; 18 direct tests; 10 frontend tests; TypeScript; local and hosted production builds. Browser testing also caught local-time rendering under UTC labels; committed timestamps now render explicitly in UTC, with a non-UTC-timezone regression. The exact source and immutable configuration were checked after deployment. See the public deployment/acceptance records for live transaction evidence, not just lifecycle statuses. Browser checks inspect rendered navigation, wallet-disconnected behavior, protocol version, and finalized claim pages; no claim is made that a real browser-wallet signature was automated.

Limits: this is test GEN, not production insurance. Distinct domains do not establish source ownership independence. LLM extraction can fail or disagree. Pages are not archived onchain. An observer must send the permissionless expiry transaction. Client storage deletion can remove recovery state. StudioNet may reset. Long-duration expiry paths were tested with the direct-mode clock, not by waiting 24 hours/30 days live. Synthetic live reports test the mechanism and are not third-party operational evidence. No external audit, certification, or portal submission is implied.
