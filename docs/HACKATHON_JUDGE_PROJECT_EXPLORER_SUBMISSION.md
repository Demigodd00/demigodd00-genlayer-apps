# Hackathon Judge — Project Explorer resubmission

## Identity

- Project name: Hackathon Judge
- Application date: use the portal's actual resubmission date.
- Logo: [existing logo](assets/hackathon-judge/hackathon-judge-logo.png)
- Primary tag: AI & Agents
- Focus tags: Verifiable Inference; Source Verification

## One-liner

On-chain hackathon judging with wallet-bound repository evidence, validator consensus, appeals and prize settlement.

## Description (under 1,000 characters)

Hackathon Judge is a GenLayer protocol for organizers and builders. Organizers store prose rules, a rubric, deadlines and a prize on-chain. Entrants publish a wallet/event/contract challenge in a GitHub evidence file. Validators independently verify repository metadata, the default-branch commit and file digest, then render and freeze the authenticated evidence. Each package binds the entrant, event, repository, commit, snapshot and summary. Validators judge the saved evidence, agreeing on eligibility and 20-point score bands while reasoning wording is exempt. New appeal evidence requires another verified package linked to the original. Settlement rechecks both packages before awarding withdrawable prize credit and wallet-based credentials. The StudioNet demo includes a rejected wrong-wallet replay, verified submissions, an evidence appeal and prize withdrawal. Repository verification proves publication control at capture, not originality or ownership of linked deployments.

## How-to steps

1. **Open the v2.3 docket.** Open the website, select hj-1, and confirm the contract address below and StudioNet v2.3 badge. The finalized demo has two judged entries.
2. **Inspect repository provenance.** Click Inspect snapshot for each entry. Read the entrant wallet, repository ID/name, default branch, captured commit, blob digest, challenge, frozen URL and package digest.
3. **Check the appeal binding.** Inspect Appeal Recovery Fixture's appeal evidence. Its provenance record includes parent_package_digest equal to that entry's original evidence_package_digest.
4. **Verify enforcement and settlement.** Open the public demo receipt. wrong_wallet_rejection records a finalized failed execution with the expected missing-wallet-challenge error and zero entries afterward. Successful later transactions cover valid entries, judgments, appeal, finalization and winner withdrawal.

## Expected verification outcome

The same public app reads v2.3 contract 0x6fD9B65001B0eEF5CC98A95D20A1c693C0D04FBA. Docket hj-1 is FINALIZED with a 100-point Hackathon Judge Protocol winner and an 80-point Appeal Recovery Fixture after one appeal. Every evidence package exposes its wallet/repository/commit binding; the appeal points to its original package. The receipt proves a wrong-wallet submission was rejected without creating an entry, and the winner withdrew the 0.001 simulated GEN prize.

## Links and evidence

- Website: https://hackathon-judge-studionet.blazekingsley2.chatgpt.site/
- GitHub (also paste into the required Evidence field): https://github.com/Demigodd00/demigodd00-genlayer-apps
- Contract: https://explorer-studio.genlayer.com/address/0x6fD9B65001B0eEF5CC98A95D20A1c693C0D04FBA
- Steward response: https://github.com/Demigodd00/demigodd00-genlayer-apps/blob/main/docs/HACKATHON_JUDGE_STEWARD_RESPONSE.md
- Live receipt: https://github.com/Demigodd00/demigodd00-genlayer-apps/blob/main/deployments/hackathon_judge_demo.json
- Deployment: https://github.com/Demigodd00/demigodd00-genlayer-apps/blob/main/deployments/hackathon_judge_studionet.json
- Source: https://github.com/Demigodd00/demigodd00-genlayer-apps/blob/main/contracts/hackathon_judge.py

The optional YouTube field can stay blank. The existing video is a historical v2.2 walkthrough and does not demonstrate the new provenance checks. Use the live v2.3 docket and receipts as current evidence.

Update the existing action-needed application via Edit. Replace the old contract link and verification text, attach the steward response and live receipt, then personally complete any CAPTCHA and resubmit.
