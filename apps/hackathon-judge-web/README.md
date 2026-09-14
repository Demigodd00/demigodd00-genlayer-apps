# Hackathon Judge web app

StudioNet dApp for HackathonJudgeScorecards v3.0.1, adding locked weighted criteria, evidence-linked scorecards and eligible score appeals to the accepted v2.3 protocol.

- Active v3 contract: `0xF37518553b89e1874DA6c459e9cFb0312298Ab60`
- Accepted v2.3 contract (unchanged): `0x6fD9B65001B0eEF5CC98A95D20A1c693C0D04FBA`
- Live: https://hackathon-judge-studionet.blazekingsley2.chatgpt.site/
- Historical v2.2 video: /hackathon-judge-demo.mp4 (predates provenance)
- New captioned v3 walkthrough: /hackathon-judge-v3-walkthrough.mp4
- [Milestone evidence and reviewer instructions](https://github.com/Demigodd00/demigodd00-genlayer-apps/blob/main/docs/HACKATHON_JUDGE_MILESTONE_1.md)
- Stack: vinext, React, Tailwind, shadcn; genlayer-js

## Entrant flow

Connect the entrant wallet, open a room, and enter a GitHub .txt file URL on the repository's default branch. The form generates an exact challenge. Publish it as a complete line in the evidence file before submitting. Validators independently check GitHub records, file contents and the rendering; the saved package is bound to the wallet, event, contract and repository.

New appeal evidence needs a different file and a challenge tied to the original package digest. Inspect snapshot exposes provenance and package digests. Provenance proves repository publication at capture, not originality or ownership of linked deployments.

## New scorecard workflow

Organizers lock 2–4 prose criteria with integer weights totaling 100%. Validators independently agree on eligibility and each 20-point score band; contract code calculates exact weighted totals and checks bounded citations against frozen evidence. Reason wording and valid citation choices may differ.

After every initial decision finishes or times out, a common appeal window opens. Eligible entrants may appeal one criterion once; ineligible/inconclusive entrants may appeal eligibility. A score can decrease as well as increase. View scorecard displays original and revised totals, ranks, per-criterion reasons, cited excerpts and record digests. Settlement waits for the window to close and pending appeals to finish or time out. Failed consensus leaves the pending appeal and original scorecard intact so resolution can be retried; there is no guaranteed first-attempt success.

The live milestone room uses controlled fixtures and simulated GEN. It does not establish real-user adoption, identity, factual correctness or real-money readiness.

## Development and checks

```powershell
pnpm install --frozen-lockfile
pnpm dev
pnpm check
pnpm audit:prod
```

Set NEXT_PUBLIC_HACKATHON_JUDGE_ADDRESS before building only when targeting another compatible v3 deployment. This UI's rubric and appeal write signatures are not compatible with v2.3.
