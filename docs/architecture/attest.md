# ATTEST architecture

ATTEST makes a public factual claim financially accountable on GenLayer StudioNet. The author fixes a statement, verification rule, one or two public HTTPS evidence URLs, a review window, and a GEN bond. A challenger can lock a counter-bond and add sources before the deadline; the author may answer once. The terms digest binds the original claim fields. StudioNet GEN is test currency with no monetary value.

Funding is deliberately separate from posting. `deposit()` adds native GEN to the caller's withdrawable credit. `create_claim()` and `challenge()` attach no value and spend that credit only after their deterministic checks pass. Unused deposits, refunded bonds, and winnings can all be recovered through `withdraw_credit()`. The challenge bond is max(10% of the author bond, 0.001 GEN).

~~~text
author deposits recoverable GEN credit → posts claim and locks bond
  → public challenge window
  → optional challenger deposits credit and locks counter-bond
  → optional author response
  → deadline → independent GenLayer source fetch and adjudication
  → deterministic bond credit → parties withdraw
~~~

At resolution, each validator fetches every declared URL and normalizes the returned page. A readable source must be at most 48 KB before normalization and at most 6,000 characters afterwards. Larger pages are `TOO_LARGE` and their partial contents cannot be cited. A conclusive result needs valid source-line citations. The validator independently judges the same rule and checks the leader's outcome, complete source snapshots, hashes, and cited excerpts against its own fetch. If content changes between validators, the adjudication transaction can fail without moving either bond.

The URLs lock when submitted; their external contents do **not**. The stored snapshot is the content fetched at adjudication, not at claim creation or challenge. Authors and challengers should use stable, publicly readable, concise sources. ATTEST does not prove that a source is truthful or prevent its publisher from editing it before review.

| Resolution | Author credit | Challenger credit | Meaning |
| --- | ---: | ---: | --- |
| `SUPPORTED` | Both bonds | — | Validators agreed that readable evidence supports the rule. |
| `DISPROVEN` | — | Both bonds | Validators agreed that readable evidence materially contradicts the rule. |
| `INCONCLUSIVE` | Author bond | Challenge bond | Evidence could not decide the claim. |
| `UNCONTESTED` | Author bond | — | No challenge was posted; the claim was **not** adjudicated. |
| `TIMEOUT_REFUND` | Author bond | Challenge bond | No adjudication finalized within seven days after the review deadline. |

Any account may finalize an unchallenged claim, resolve a challenged claim after its review deadline, or trigger the seven-day timeout refund. `resolve()` closes at the timeout boundary. The application has no administrator override or application-level appeal. GenLayer's protocol appeal and finality process remains separate from ATTEST's claim workflow.

The web app reads finalized claim pages, opens records by ID, and displays the full stored evidence snapshot with hashes and citations. It saves a submitted transaction hash locally and blocks another write by that wallet until finality is reconciled. A successful UI message requires finalized successful contract execution; an unknown outcome retains the hash for inspection. The app never handles a private key.

Local direct-mode tests cover bond conservation, withdrawals, winner payouts, inconclusive/uncontested results, timeout refunds, oversized sources, failed posts retaining deposit credit, and a validator rejection when source content changes. The [live StudioNet acceptance journal](../ATTEST_REVIEW.md) separately verifies consensus on challenged claims and exact native withdrawal credits; it does not accelerate the seven-day timeout or test the hosted browser-wallet signing path.
