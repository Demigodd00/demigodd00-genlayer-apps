# Hackathon Judge — Project Explorer submission

## Identity

- Application date: `04/09/2026`
- Project name: `Hackathon Judge`
- Logo upload: [`docs/assets/hackathon-judge/hackathon-judge-logo.png`](assets/hackathon-judge/hackathon-judge-logo.png)
- Primary tag: `AI & Agents`
- Tag 1: `Verifiable Inference`
- Tag 2: `Source Verification`

## One-liner

> On-chain hackathon judging from public evidence, prose rules, and validator consensus.

## Description

> Hackathon Judge is a GenLayer-native protocol for hackathon organizers, builders, and reviewers. Organizers publish a plain-English rulebook, rubric, deadline, appeal window, and prize. Entrants submit a public evidence URL. Validators use gl.nondet.web.render() to agree on an immutable snapshot and SHA-256 digest, then independently judge that saved evidence against the on-chain rules. Consensus compares only settlement-critical fields—exact eligibility, exact 20-point score band, and bounded confidence—while free-form reasoning is exempt. The contract supports one evidence-based appeal, permissionless evaluation and finalization, a 24-hour inconclusive fallback, deterministic ranking, withdrawable prize credit, refunds, and portable wallet-based winner credentials. A finalized StudioNet demo shows two judgments, an inconclusive case repaired by appeal, a 100-point winner, and successful prize withdrawal.

## Demo video

The form accepts YouTube URLs only. Either leave this optional field blank or upload the prepared 60-second video to YouTube as public or unlisted, then paste its `youtube.com/watch` URL.

- Upload file: [`docs/assets/hackathon-judge/hackathon-judge-demo.mp4`](assets/hackathon-judge/hackathon-judge-demo.mp4)
- Suggested YouTube title: `Hackathon Judge — GenLayer StudioNet Demo`
- Suggested YouTube description:

> Hackathon Judge turns public evidence and plain-English hackathon rules into an auditable on-chain verdict, appeal record, winner, and prize settlement through GenLayer validator consensus. Live app: https://hackathon-judge-studionet.blazekingsley2.chatgpt.site/ Source: https://github.com/Demigodd00/demigodd00-genlayer-apps

## How-to steps

### Step 1

- Optional heading: `Open the finalized docket`
- Instruction: `Open the website and select hj-1. Confirm status FINALIZED, 2/2 judged, Hackathon Judge Protocol is WINNER at 100/100, Appeal Recovery Fixture is NOT SELECTED at 80/100, and the prize escrow is 0.001 GEN.`

### Step 2

- Optional heading: `Inspect immutable evidence`
- Instruction: `Click Inspect snapshot on both submissions. Confirm each SHA-256 digest is shown and that Appeal Recovery Fixture displays a separate Appeal evidence section.`

### Step 3

- Optional heading: `Verify the on-chain release`
- Instruction: `Open the Intelligent contract link and compare its address with the contract below. Open the GitHub demo receipt to verify the finalized transactions, winner, and prize withdrawal.`

## Expected verification outcome

> The steward sees public docket hj-1 finalized on StudioNet with two judged entries: Hackathon Judge Protocol is ELIGIBLE at 100/100 and marked WINNER; Appeal Recovery Fixture is ELIGIBLE at 80/100 after one evidence appeal and marked NOT SELECTED. The jury console shows 2/2 decisions, 0.001 GEN awarded, and contract 0x788432Aa8D55c81c3bd2ef0FbB29A4Bc7E6e4cC6. Inspect snapshot shows frozen original evidence digests, while the second entry also shows a separate appeal digest. The public demo receipt records successful finalization and winner withdrawal, and both GitHub Actions workflows pass.

## Links

- Contract link 1: `https://explorer-studio.genlayer.com/address/0x788432Aa8D55c81c3bd2ef0FbB29A4Bc7E6e4cC6`
- Website: `https://hackathon-judge-studionet.blazekingsley2.chatgpt.site/`
- GitHub: `https://github.com/Demigodd00/demigodd00-genlayer-apps`

## Evidence and supporting information

Paste the repository URL into the required evidence field:

`https://github.com/Demigodd00/demigodd00-genlayer-apps`

Recommended additional evidence links:

1. Live app: `https://hackathon-judge-studionet.blazekingsley2.chatgpt.site/`
2. Final demo receipt: `https://github.com/Demigodd00/demigodd00-genlayer-apps/blob/main/deployments/hackathon_judge_demo.json`
3. Deployment receipt: `https://github.com/Demigodd00/demigodd00-genlayer-apps/blob/main/deployments/hackathon_judge_studionet.json`
4. Contract source: `https://github.com/Demigodd00/demigodd00-genlayer-apps/blob/main/contracts/hackathon_judge.py`
5. Hosted demo video: `https://hackathon-judge-studionet.blazekingsley2.chatgpt.site/hackathon-judge-demo.mp4`

Complete the reCAPTCHA personally, review the preview, and submit only after confirming every URL is clickable.
