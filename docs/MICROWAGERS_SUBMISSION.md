# MicroWagers Portal submission

Submit MicroWagers as its own contribution. Do not combine it with StreakPact.

## Portal fields

**Contribution type:** Projects

**Contribution date:** 30/08/2026

**Title:** MicroWagers by demigodd00 — Source-Bound Peer Predictions on GenLayer

**Notes / Description:**

```text
MicroWagers by demigodd00 is a two-sided prediction market built for GenLayer StudioNet, where test GEN has no monetary value. A creator posts a question, two fixed positions, a public HTTPS source, a deadline, and a test stake; another wallet matches it. After the deadline, GenLayer validators fetch that source and use comparative consensus to agree on the supported side and a bounded confidence bucket. Their decision directly controls escrow: a decisive result becomes provisional, while ambiguous or low-confidence evidence refunds both participants. The losing participant has one bonded appeal, which triggers an independent validator review. Claims stay locked through the five-minute appeal window. The exact deployment was tested with two wallets through creation, matching, role and stake failures, cancellation/refund, source-backed resolution, appeal, duplicate-appeal rejection, winner-only claim, and credited payout. There is no admin settlement control.
```

## Evidence to add

1. **GitHub Repository**
   https://github.com/Demigodd00/streakpact

2. **GenLayer Explorer Contract**
   https://explorer-studio.genlayer.com/address/0x5D2679a7277D05E5bE9a6Bf60526D0fC7C1d477C

3. **Other** — live product
   https://microwagers.vercel.app

4. **GitHub File** — intelligent contract
   https://github.com/Demigodd00/streakpact/blob/main/contracts/micro_wagers.py

5. **GitHub File** — exact StudioNet deployment record
   https://github.com/Demigodd00/streakpact/blob/main/deployments/micro_wagers_studionet.json

6. **GitHub File** — exact-release acceptance journal
   https://github.com/Demigodd00/streakpact/blob/main/deployments/micro_wagers_acceptance.json

Only one evidence link is required by the form, but the repository, Explorer contract, and live product together make review much easier.

## Reviewer path

1. Open the live product without connecting a wallet.
2. Open settled market `w-2` to see its public source, two participant positions, confidence bucket, validator reason, appeal statement, and settled state.
3. Open `/status` to confirm the exact contract, zero fee, five-minute appeal window, and the absence of admin settlement controls.
4. Open the Explorer contract and compare it with the deployment and acceptance records.
5. Connect MetaMask on GenLayer StudioNet only if a fresh test transaction is desired.

## Private repository note

The repository is intentionally private to protect authorship. Before submitting, ensure the Portal account or assigned reviewer can access it. If private-repository access is unavailable, keep the Explorer contract and live product evidence attached and grant the reviewer explicit GitHub access; do not make the repository public without a deliberate decision.
