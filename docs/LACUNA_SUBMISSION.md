# Lacuna — Project Explorer submission

Use this for Lacuna only, not another product in this shared repository.
No Portal form has been submitted automatically.

## Application date

13/09/2026 is the completed build/test date. Use the actual application date
when submitting; do not copy an old date from an earlier project's screenshot.

## 1. Identity

- Project name: **Lacuna by demigodd00**
- Primary tag: **Developer Tools**
- Tag 1 / Tag 2: leave blank if optional; do not select unrelated topics just to fill them.
  Their currently available options have not been verified.
- Logo upload, if used: the existing Lacuna L mark; the Portal accepts PNG,
  JPEG or WebP, 128–2048 px, up to 2 MB. The app's SVG favicon is not an accepted
  upload format, so do not upload it as a PNG without converting it.

## 2. One-liner

An on-chain adversarial range that rewards finding decisive AI answers where the evidence is incomplete.

## 3. Description

The following paragraph is 927 characters, within the 1,000-character field:

Lacuna is an adversarial abstention-testing range on GenLayer StudioNet. Sponsors fund a pinned natural-language rule. Challengers commit and reveal an incomplete synthetic document plus two compatible additions that lead to opposite outcomes. GenLayer runs the target evaluator and two differently framed referees; validators independently replay each semantic task. A bounty is awarded only when a decisive target verdict survives both ambiguity checks. Correct abstention and changed facts do not win. The contract preserves the original case and both referee records, handles deadlines, and settles native test-GEN credits and withdrawals. The app supports MetaMask and public case records. Standard findings and deliberately flawed seeded controls are clearly separated. A two-wallet browser lifecycle and actual native payouts are verified. Test GEN has no monetary value; this is not a universal AI-safety certification.

## 4. Demo video

Leave the optional YouTube field empty. No demo video URL is being claimed.

## 5. How-to — exact reviewer path

Add these as separate steps. The text under each heading is the instruction.

### Inspect a completed case

Open https://lacuna-sepia.vercel.app/attempt/la-4 without connecting a wallet.
Read the original document, target verdict, both referee records and allocation.
This is explicitly a deliberately flawed seeded control, not a genuine discovery.
The verified payment link is in the evidence section below.

### Create your own test campaign

Open https://lacuna-sepia.vercel.app/new in a browser with MetaMask. Connect a
StudioNet test wallet; obtain test GEN from https://studio.genlayer.com if needed.
Enter a campaign name, click "Use the sample rule", choose "Seeded control",
leave the bounty at 0.001 test GEN and duration at 2 hours, acknowledge the terms,
and click "Fund campaign & pin rule". Approve only the StudioNet transaction.
Wait for finalization and the separate GenLayer rule review to open the campaign.

### Change to the challenger wallet

Switch MetaMask to a different funded test account and reconnect if necessary.
Open the campaign you just created. The sponsor cannot challenge their own campaign.

### Commit the sample case

Click "Use June sample", then "Prepare commitment". Download the reveal backup
before clicking "Commit 0.0001 test GEN". Approve the commitment in MetaMask.
Preserve the backup and stay on the page. The reveal deadline is 15 minutes
from commit inclusion, not 15 minutes from when you return to the app.

### Reveal and inspect GenLayer's records

Click "Reveal & start GenLayer evaluation" and approve the zero-additional-stake
transaction before its deadline. The contract automatically queues the target,
compatibility referee and falsification referee as separate finalized self-calls.
Wait for the accepted records. Pending, failed or inconclusive execution is not
a finding; do not repeatedly resubmit a pending transaction.

### Withdraw the allocation

If the case settles as a confirmed control finding, the challenger receives
0.0011 test GEN in withdrawable credit. Click "Withdraw to my wallet" and approve.
A successful withdrawal queues a separate native payment; verify that child's
FINALIZED status, credited value and recipient before calling it paid.
For the standard defense and invalid-evidence examples, inspect
https://lacuna-sepia.vercel.app/attempt/la-1 and
https://lacuna-sepia.vercel.app/attempt/la-3 respectively.

## 6. Expected verification outcome

The following paragraph is 441 characters, within the 500-character field:

Case la-4 shows a labeled seeded-control finding: the target approved the incomplete case, both referees preserved its facts and gave APPROVE for June 10 versus REJECT for June 20, and 0.0011 test GEN reached the challenger. Its native payment is FINALIZED with value_credited=true. Case la-1 shows correct standard abstention; la-3 rejects changed facts. A fresh run exposes separate on-chain stage records and a fixed-recipient withdrawal.

### Contract link

https://explorer-studio.genlayer.com/address/0x39AE6124194cEd74bBa0A772B9d4568b6cb29242

Network: GenLayer StudioNet, chain 61999. Use this exact address, not the
archived 0.1.0 experimental deployment.

## 7. Project links

Website:
https://lacuna-sepia.vercel.app/

GitHub project entry point:
https://github.com/Demigodd00/demigodd00-genlayer-apps/tree/main/apps/lacuna-web

The repository root hosts several products. The project-specific directory
makes clear that this submission is Lacuna.

## Evidence & supporting information

| Evidence type | URL |
| --- | --- |
| GitHub Repository — Lacuna directory | https://github.com/Demigodd00/demigodd00-genlayer-apps/tree/main/apps/lacuna-web |
| Other — live website | https://lacuna-sepia.vercel.app/ |
| GitHub File — Intelligent Contract | https://github.com/Demigodd00/demigodd00-genlayer-apps/blob/main/contracts/lacuna.py |
| GitHub File — verification and limitations | https://github.com/Demigodd00/demigodd00-genlayer-apps/blob/main/docs/LACUNA_RELEASE.md |
| GitHub File — two-wallet MetaMask evidence | https://github.com/Demigodd00/demigodd00-genlayer-apps/blob/main/deployments/lacuna_browser_acceptance.json |
| GenLayer Explorer Contract | https://explorer-studio.genlayer.com/address/0x39AE6124194cEd74bBa0A772B9d4568b6cb29242 |
| Other — completed public case | https://lacuna-sepia.vercel.app/attempt/la-4 |
| Other — actual native payment | https://explorer-studio.genlayer.com/tx/0x7be9b0430bbe18fc844f7e765343a06e56dbb4e84610a31f245d631ae9da9031 |

Use "GenLayer Studio Contract" if that is the Portal's available StudioNet
category instead of "GenLayer Explorer Contract".

If the Portal requires the literal repository root, it is:
https://github.com/Demigodd00/demigodd00-genlayer-apps

The directory URL is a genuine project-specific link, not a tracking-parameter
workaround. If the Portal still rejects the shared repository as already
submitted, ask the steward how to register a distinct project within the same
repository, or use the appropriate existing-submission update flow. Do not
relabel evidence or append meaningless URL parameters to evade its checks.

## Claims to preserve

- StudioNet native test GEN transfers are real on-chain transfers, not valuable money.
- Two seeded-control findings are not two genuine vulnerability discoveries.
- Standard findings currently remain zero; correct abstention is a valid defense.
- The successful two-wallet MetaMask flow is one bounded manual test, not a
  guarantee that every wallet combination or adversarial input is bug-free.
- No claim of independent model-provider diversity, universal AI safety,
  arbitrary-contract scanning, formal correctness or production insurance.
- No private keys, wallet recovery phrases, Vercel tokens or unrelated app files
  are included in this publication.
