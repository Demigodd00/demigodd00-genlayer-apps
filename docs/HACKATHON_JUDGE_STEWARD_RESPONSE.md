# Hackathon Judge v2.3 — evidence provenance response

Steward request: “Improve evidence provenance: bind each evidence package to the entrant wallet and verify authenticated repository or deployment records before prize settlement.”

## Paste-ready response

Implemented in v2.3. Evidence now requires an exact wallet/event/contract/repository/path challenge published in a GitHub .txt file on the repository's default branch. Validators independently verify GitHub repository identity, the default-branch commit, file contents and Git blob digest; they render the commit-pinned file and require matching content. A SHA-256 package binds the entrant, event, contract, repository ID, commit, snapshot and summary. New appeal evidence must include a fresh proof linked to the original package. Judging and finalization recheck the saved packages before any winner credit or credential is issued. The app exposes the proof and package details. Public acceptance receipts cover wrong-wallet rejection, verified submissions, appeal, finalization and withdrawal. This implements repository-record verification; it proves publication control at capture, not originality or ownership of linked deployments.

## Requirement to enforcement

| Request | Enforcement | Reviewer evidence |
|---|---|---|
| Bind each package to the entrant | Transaction sender plus exact challenge; immutable package includes wallet, event, contract, repository, path and summary/statement digest | Inspect snapshot → Wallet and repository provenance |
| Authenticate repository records | Independent GitHub metadata, default-branch head, contents API, blob SHA-1 recomputation, commit-pinned raw render equality | Stored repository ID/name, commit, blob digest, frozen URL and challenge |
| Cover appeal evidence | New file, entrant-only transaction and challenge containing the original package digest | Appeal provenance parent_package_digest equals original evidence_package_digest |
| Enforce before settlement | _require_provenance runs before judgment, appeal reassessment and winner selection; invalid records reject before prize credit | Contract source and tampered-package settlement regression tests |
| Demonstrate rejection | Real wrong-wallet replay fails without creating an entry | wrong_wallet_rejection in the public demo receipt |

## Current release

- [Live app](https://hackathon-judge-studionet.blazekingsley2.chatgpt.site/)
- [v2.3 contract](https://explorer-studio.genlayer.com/address/0x6fD9B65001B0eEF5CC98A95D20A1c693C0D04FBA)
- Deployment transaction: `0x98cdf25fe5bf20ac88a3aa60198a9ccd853882e29dd3cf35f81b2f4ea14bc079`
- Source SHA-256: `dce90861bfed11d9ec9f34c4b10a5523f0881df770c2beb067cac7cf7594d506`
- [Deployment record](../deployments/hackathon_judge_studionet.json)
- [Live acceptance receipt](../deployments/hackathon_judge_demo.json)
- [Contract source](../contracts/hackathon_judge.py)
- [Direct adversarial tests](../tests/direct/test_hackathon_judge.py)
- [Live receipt/source/state verification](../tests/integration/test_hackathon_judge_studionet.py)

## Review path

Open hj-1 on the live app. Inspect both submissions and the separate appeal evidence. Confirm the recorded entrant wallets and the appeal's parent package link. Open the live receipt: the wrong-wallet transaction must show failed execution with the expected challenge error; subsequent valid transactions must show successful finalized execution. Confirm the event winner, prize credit release and withdrawal transaction. The two entries are controlled release fixtures, not a claim of independent hackathon adoption.

## Reproduction

```powershell
genvm-lint check contracts/hackathon_judge.py --json
python -m pytest tests/direct/test_hackathon_judge.py -v
gltest tests/integration/test_hackathon_judge_studionet.py --network studionet -v -s
```

The direct suite uses mocked web/LLM inputs for lifecycle and adversarial cases. Its VM normally executes the leader only; explicit comparison tests cover validation rules but cannot prove network consensus. The live seeder executes real StudioNet transactions with real GitHub requests, rendering and LLM judgments. The integration test independently reads their receipts, deployed source and final state; it does not create another event.

For a fresh live demonstration: deploy a new contract, prepare original/fixture proof files using that contract address, event ID and the seeder's entrant wallets, then commit them to the public repository. Run `python scripts/seed_hackathon_judge_demo.py --phase submit`. This submits the wrong-wallet negative test and valid entries, then prints the appeal challenge. Put that challenge in the appeal file, commit it to the same default branch, and run `python scripts/seed_hackathon_judge_demo.py --phase finish`. The scripts are configured for this project's repository and local demonstration signer. A different repository or signer requires matching configuration and newly published proof lines. Never publish private keys.

Frontend checks run from apps/hackathon-judge-web with `pnpm check` and `pnpm audit:prod`.

The Python read adapter uses StudioNet's native raw-calldata read route because its [legacy read decoder](https://github.com/genlayerlabs/genlayer-studio/blob/main/backend/protocol_rpc/transactions_parser.py) assumes a two-byte RLP list prefix, which fails on long helper arguments. The adapter preserves read-only calls and latest-final state; it does not alter consensus, execution mode, or transaction validation. Its two tests cover calldata round-tripping and error propagation. The live acceptance record includes challenge_view_verified after comparing the full on-chain appeal challenge with the expected wallet binding.

## Scope and limitations

GitHub HTTPS records and a repository-published challenge establish publication control/authorization at capture. This is not OAuth identity binding or signed-commit verification. Fork publication does not authenticate upstream authorship. The verifier does not claim that external deployment links belong to the entrant; this release supports the repository route of the request. Originality and factual project claims remain matters for the jury's evidence assessment.

Only public UTF-8 GitHub .txt evidence files are supported. Provider errors, changing heads, inconsistent rendering and invalid proofs fail closed. Subsequent repository changes do not alter frozen evidence. StudioNet GEN is simulated. The existing v2.2 video is historical and should not be used as proof of the new provenance checks.

See the [complete resubmission fields](HACKATHON_JUDGE_PROJECT_EXPLORER_SUBMISSION.md).
