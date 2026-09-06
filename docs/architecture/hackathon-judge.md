# Hackathon Judge v2.3 architecture

Hackathon Judge interprets a prose rulebook through independent GenLayer validator judgments, then settles a prize through deterministic code.

## Boundary

The frontend owns wallet connection, evidence-file guidance, transaction progress and presentation. GitHub supplies public repository and commit records over HTTPS. The contract owns evidence authentication, immutable capture, comparison rules, judging, appeals, ranking, credit and credentials. There is no private verification server or privileged judge.

## Repository provenance

1. The entrant connects a wallet and selects a GitHub `.txt` file URL: `https://github.com/OWNER/REPO/blob/REF/PATH.txt`.
2. The app or `get_evidence_challenge()` produces an exact proof line binding StudioNet, this contract address, event ID, wallet, normalized repository name, case-sensitive file path, purpose, and parent package.
3. The entrant places the line in the file with project evidence and publishes it on the repository's default branch.
4. During submission, every validator independently fetches GitHub repository metadata and `/commits/HEAD`. The submitted ref must be the default branch name, `HEAD`, or that exact current head commit.
5. Validators retrieve `/contents/PATH?ref=COMMIT`, require a file record, decode its content, and recompute the Git blob SHA-1. They require the exact challenge as a complete line.
6. Validators render the commit-pinned raw file with `gl.nondet.web.render()`. Its normalized text must equal the authenticated file content. The commit, file and provenance result must match independently across validators.
7. The contract stores the snapshot, SHA-256 snapshot digest, canonical provenance record and SHA-256 package digest.

The provenance record includes repository ID and name, fork status, default branch, commit, blob SHA, file path, submitted and frozen URLs, challenge, contract, network, event, wallet, summary/statement digest and parent package. The package digest is SHA-256 of canonical JSON containing the provenance record string and snapshot digest. The field names and normalization are specified by `_canonical_json` and `_package_digest` in the contract.

A fork proves publication in that fork only. A pull-request-only commit cannot pass as the default branch head of an upstream repository. The repository name and contract address in the proof prevent copying a challenge between repositories or deployments.

## Authentication scope

The signed GenLayer transaction establishes the entrant wallet. Publishing its domain-separated challenge on the named repository's default branch establishes repository publication control or authorization at capture. GitHub HTTPS/API records are the external trust source. This is not a GitHub OAuth account link, a signed-commit attestation, legal ownership verification, originality detection, or proof that external deployment links belong to the entrant. Those claims remain evidence for judging. Direct deployment-only proofs are not supported in this release: it implements the steward's repository-record route.

## Judgment and appeals

The jury evaluates only saved evidence and stored rules. Every validator independently runs the LLM. Eligibility and score band (0,20,40,60,80,100) must match exactly. Confidence buckets may differ by at most 20. Reasoning wording is exempt, but the result schema is strictly validated. Low confidence becomes INCONCLUSIVE; non-eligible entries score zero.

An adverse decision gives its entrant one appeal. A clarification-only appeal is authorized by the entrant transaction. New evidence needs a new GitHub file with an appeal challenge containing the original package digest. The new package also binds the appeal statement. Both packages are validated before judging or resolving an appeal.

## Settlement and liveness

Before selecting any eligible winner, finalization recomputes and checks original and appeal package bindings. A missing or corrupted binding rejects settlement before any prize credit or credential is issued. Highest qualifying score wins; ties favor the earliest entry. No AI call or external fetch occurs during finalization: the verified capture is immutable.

Deposits create wallet-owned credit. Event creation locks the prize; finalization credits the winner or refunds the organizer if no entry qualifies. An organizer can cancel only an empty event. Withdrawal zeroes credit before emitting the transfer.

An initial judgment or pending appeal unresolved for 24 hours can be permissionlessly expired to INCONCLUSIVE. That entry cannot win, allowing the remaining event to settle.

## Bounds and availability

Eight entries per event, one entry per wallet and evidence URL, one appeal, 20,000 normalized evidence characters, 400 rationale characters. Only public UTF-8 GitHub .txt files with simple URL paths are supported; branches containing slashes can use HEAD. Queries, fragments, traversal and lookalike hosts are rejected.

GitHub errors, rate limits, unavailable records, changing branch heads, file/render disagreement and validator disagreement fail closed. Wait and retry while the submission window remains open. Frozen evidence is unaffected by later branch edits or repository deletion.

StudioNet GEN is simulated. Credentials are wallet records across events on this contract, not verified human identities.

## Release and verification

Contract: `0x6fD9B65001B0eEF5CC98A95D20A1c693C0D04FBA`  
Deployment: `0x98cdf25fe5bf20ac88a3aa60198a9ccd853882e29dd3cf35f81b2f4ea14bc079`  
Source SHA-256: `dce90861bfed11d9ec9f34c4b10a5523f0881df770c2beb067cac7cf7594d506`

See [steward response and reproduction](../HACKATHON_JUDGE_STEWARD_RESPONSE.md), [live receipts](../../deployments/hackathon_judge_demo.json), and [security scope](../HACKATHON_JUDGE_SECURITY.md).
