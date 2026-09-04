# Hackathon Judge web app

StudioNet dApp for the hardened `HackathonJudge` v2.2 intelligent contract.

- Contract: `0x788432Aa8D55c81c3bd2ef0FbB29A4Bc7E6e4cC6`
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
