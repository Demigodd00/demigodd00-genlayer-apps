# Hackathon Judge web app

StudioNet dApp for the hardened `HackathonJudge` v2.1 intelligent contract.

- Contract: `0x0bAE6f3aE56E02A50f5Bed0051F56ec28725a58F`
- Live: <https://hackathon-judge-studionet.blazekingsley2.chatgpt.site>
- Walkthrough: <https://hackathon-judge-studionet.blazekingsley2.chatgpt.site/hackathon-judge-demo.mp4>
- Framework: vinext + React + Tailwind + shadcn components
- Chain client: `genlayer-js`

## Local development

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

The release contract is the safe default. To target another deployment, set `NEXT_PUBLIC_HACKATHON_JUDGE_ADDRESS` before building.

## Verification

```powershell
pnpm check
```

`check` runs the TypeScript compiler, unit tests, focused lint, and the complete Sites production build.
