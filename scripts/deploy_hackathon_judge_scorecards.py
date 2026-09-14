"""Deploy the milestone separately; never replace accepted v2.3 records."""
import json
from pathlib import Path

from eth_account import Account
from genlayer_py import create_client
from genlayer_py.assertions import tx_execution_succeeded
from genlayer_py.chains import studionet
from genlayer_py.types import TransactionStatus

import deploy_hackathon_judge as baseline
from hackathon_judge_rpc import read_studionet_view

ROOT = Path(__file__).resolve().parents[1]
CODE = ROOT / "contracts/hackathon_judge_scorecards.py"
RECORD = ROOT / "deployments/hackathon_judge_scorecards_studionet.json"
PENDING = ROOT / "deployments/hackathon_judge_scorecards_v3_0_1_deploy_pending.json"


def main():
    source = CODE.read_text(encoding="utf-8")
    digest = baseline._source_digest(source)
    account = Account.create()  # Deployment-only: the contract gives it no privileges.
    client = create_client(chain=studionet, account=account)
    if RECORD.exists():
        previous = json.loads(RECORD.read_text(encoding="utf-8"))
        if previous.get("source_sha256") == digest:
            baseline._verify_source(client, previous["address"], source)
            print(json.dumps({"state": "already_deployed", "address": previous["address"]}), flush=True)
            return
    pending = json.loads(PENDING.read_text(encoding="utf-8")) if PENDING.exists() else {}
    if pending and pending.get("source_sha256") != digest:
        raise RuntimeError("An earlier deployment has a different source; reconcile its receipt before redeploying")
    if not pending:
        tx = str(client.deploy_contract(code=source, account=account, args=[]))
        pending = {"transaction_hash": tx, "source_sha256": digest, "deployer": account.address}
        PENDING.write_text(json.dumps(pending, indent=2) + "\n", encoding="utf-8")
    tx = pending["transaction_hash"]
    print(json.dumps({"state": "waiting_for_finalized_deployment", "transaction_hash": tx}), flush=True)
    receipt = client.wait_for_transaction_receipt(tx, status=TransactionStatus.FINALIZED,
                                                  interval=5000, retries=180, full_transaction=True)
    if not tx_execution_succeeded(receipt):
        raise RuntimeError("Deployment failed: " + json.dumps(receipt, default=str))
    address = baseline._extract_contract_address(receipt)
    baseline._verify_source(client, address, source)
    config = read_studionet_view(client, address, "get_config", [])
    expected = {"version": "3.0.1", "evaluation_schema": "hackathon-judge-scorecard-v1",
                "settlement_policy": "REQUIRE_VERIFIED_EVIDENCE_SCORECARDS_AND_CLOSED_COMMON_APPEALS",
                "appeal_policy": "ONE_TARGETED_SCORE_OR_ELIGIBILITY_APPEAL_COMMON_WINDOW",
                "score_total_scale": "10000", "max_criteria": "4"}
    if any(config.get(key) != value for key, value in expected.items()):
        raise RuntimeError("Deployed configuration does not match the milestone")
    baseline.DEPLOYMENT_PATH = RECORD
    baseline._record_deployment({
        "contract": "HackathonJudgeScorecards", "version": "3.0.1", "network": "studionet",
        "address": address, "transaction_hash": tx, "source_path": "contracts/hackathon_judge_scorecards.py",
        "source_sha256": digest, "deployer": pending["deployer"], "deployer_role": "deployment_only_no_privileged_access",
        "signer_mode": "disposable_studionet_deployment_only", "receipt_status": "FINALIZED",
        "execution_result": "SUCCESS", "verified_source_and_config": True,
        "accepted_baseline_address": "0x6fD9B65001B0eEF5CC98A95D20A1c693C0D04FBA",
        "deployed_at": baseline.datetime.now(baseline.timezone.utc).isoformat(), "config": config,
    })
    print(json.dumps({"state": "deployed_and_verified", "address": address, "source_sha256": digest}), flush=True)


if __name__ == "__main__":
    main()
