# Hackathon Judge web app

StudioNet dApp for HackathonJudge v2.3, with wallet-bound GitHub evidence and settlement provenance checks.

- Contract: `0x6fD9B65001B0eEF5CC98A95D20A1c693C0D04FBA`
- Live: https://hackathon-judge-studionet.blazekingsley2.chatgpt.site/
- Historical v2.2 video: /hackathon-judge-demo.mp4 (predates provenance)
- Stack: vinext, React, Tailwind, shadcn; genlayer-js

## Entrant flow

Connect the entrant wallet, open a room, and enter a GitHub .txt file URL on the repository's default branch. The form generates an exact challenge. Publish it as a complete line in the evidence file before submitting. Validators independently check GitHub records, file contents and the rendering; the saved package is bound to the wallet, event, contract and repository.

New appeal evidence needs a different file and a challenge tied to the original package digest. Inspect snapshot exposes provenance and package digests. Provenance proves repository publication at capture, not originality or ownership of linked deployments.

## Development and checks

```powershell
pnpm install --frozen-lockfile
pnpm dev
pnpm check
pnpm audit:prod
```

Set NEXT_PUBLIC_HACKATHON_JUDGE_ADDRESS before building only when targeting another compatible v2.3 deployment.
