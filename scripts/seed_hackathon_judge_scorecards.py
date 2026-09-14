"""Real StudioNet milestone run. No mocked web, LLM, votes or execution modes.

prepare -> publish the printed original challenges -> submit -> publish the
printed appeal challenge -> finish. Safe to resume pending transactions by hash.
"""
import argparse
import hashlib
import hmac
import json
import time
from pathlib import Path

from eth_account import Account
from genlayer_py import create_client
from genlayer_py.assertions import tx_execution_succeeded
from genlayer_py.chains import studionet
from genlayer_py.types import TransactionStatus

import seed_hackathon_judge_demo as baseline
from hackathon_judge_rpc import read_studionet_view

ROOT = Path(__file__).resolve().parents[1]
DEPLOYMENT = ROOT / "deployments/hackathon_judge_scorecards_studionet.json"
RECORD = ROOT / "deployments/hackathon_judge_scorecards_demo.json"
EVIDENCE_BASE = "https://github.com/Demigodd00/demigodd00-genlayer-apps/blob/main/docs/evidence/hackathon-judge-v3/"
EVENT_NAME = "Transparent Scorecards — Milestone 1"
PRIZE = 10**15
CRITERIA = [
    {"id": "implementation", "name": "Implementation", "weight": 40,
     "description": "Assess coherent implemented functionality and limitations. Score 80 for a working described scorecard, evidence-reference and appeal workflow with a public contract and app. Score 100 only with independent real-user adoption evidence; these controlled fixtures have none. Score 40 for a concept without implementation."},
    {"id": "reproducibility", "name": "Reproducibility", "weight": 40,
     "description": "Score 40 when an otherwise documented build omits its exact deployment transaction hash. Score 80 when exact contract address, deployment transaction hash, source and app links are supplied but detailed executable verification commands are absent. Score 100 when those identifiers AND executable verification commands and explicit expected outcomes are supplied. New authenticated appeal evidence may supply the missing items."},
    {"id": "usability", "name": "Reviewer clarity", "weight": 20,
     "description": "Assess clarity of the documented reviewer journey. Score 80 for clear steps to open a docket, inspect a scorecard and inspect cited frozen evidence with limitations disclosed. Score 100 only with independent usability-study evidence; these controlled fixtures have none. Score 40 when reviewer steps are absent."},
]
RULES = ("This is a controlled release-acceptance demonstration, not an originality contest or a claim of real adoption. "
         "An eligible entry must document the implemented GenLayer scorecard workflow and provide a public contract address, "
         "source URL and app URL. Missing the deployment transaction hash affects reproducibility scoring, not eligibility. "
         "Judge the recorded text under the three locked criteria. Fixture labels are not scoring instructions.")
APPEAL_STATEMENT = ("Please reassess only reproducibility. The original evidence omitted the deployment transaction hash. "
                    "The authenticated addendum supplies that exact identifier, verification commands and expected outcomes under the locked rubric.")


def save(record):
    baseline.RECORD_PATH = RECORD
    baseline._save(record)


def read(client, address, method, args):
    return read_studionet_view(client, address, method, args)


def transact(record, clients, step, role, method, args, value=0, expected_error=""):
    client = clients[role]
    existing = record["transactions"].get(step)
    if not existing:
        tx = str(client.write_contract(address=record["contract"], function_name=method, args=args, value=value))
        existing = {"transaction_hash": tx, "method": method, "args": args, "sender": client.local_account.address,
                    "role": role, "value_atto": str(value), "submitted_at": baseline._timestamp(), "expected_error": expected_error}
        record["transactions"][step] = existing
        save(record)
    print(json.dumps({"step": step, "state": "waiting", "transaction_hash": existing["transaction_hash"]}), flush=True)
    receipt = client.wait_for_transaction_receipt(existing["transaction_hash"], status=TransactionStatus.FINALIZED,
                                                  interval=5000, retries=180, full_transaction=True)
    success = tx_execution_succeeded(receipt)
    existing.update(status=receipt.get("status_name") or receipt.get("statusName"), execution_succeeded=success,
                    checked_at=baseline._timestamp())
    if expected_error:
        existing["expected_rejection_verified"] = not success and expected_error in json.dumps(receipt, default=str)
        valid = existing["expected_rejection_verified"]
    else:
        valid = success
    save(record)
    if not valid:
        raise RuntimeError(f"Unexpected execution result for {step}: " + json.dumps(receipt, default=str))
    print(json.dumps({"step": step, "state": "verified_rejection" if expected_error else "finalized_success"}), flush=True)


def proof(client, address, event, wallet, filename, parent=""):
    return read(client, address, "get_evidence_challenge", [event, wallet, EVIDENCE_BASE + filename, parent])["challenge"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=("prepare", "submit", "finish"), required=True)
    phase = parser.parse_args().phase
    deployment = json.loads(DEPLOYMENT.read_text(encoding="utf-8"))
    assert deployment["version"] == "3.0.0" and deployment["network"] == "studionet"
    address = deployment["address"]
    owner = Account.from_key(baseline._load_signer())
    accounts = {"organizer": owner,
                "control": Account.from_key(hmac.new(owner.key, b"hackathon-judge/scorecard/control/v3", hashlib.sha256).digest()),
                "appeal": Account.from_key(hmac.new(owner.key, b"hackathon-judge/scorecard/appeal/v3", hashlib.sha256).digest())}
    clients = {name: create_client(chain=studionet, account=account) for name, account in accounts.items()}
    client = clients["organizer"]
    record = json.loads(RECORD.read_text(encoding="utf-8")) if RECORD.exists() else {
        "network": "studionet", "contract": address, "contract_version": "3.0.0", "event_name": EVENT_NAME,
        "wallets": {name: account.address for name, account in accounts.items()}, "started_at": baseline._timestamp(),
        "fixture_notice": "Controlled acceptance fixtures; not independent projects, users or adoption.",
        "transactions": {}, "assertions": {}, "criteria": CRITERIA,
    }
    if record["contract"].lower() != address.lower():
        raise RuntimeError("A different milestone demo already exists; preserve/reconcile it before a new run")
    save(record)
    config = read(client, address, "get_config", [])
    assert config["version"] == "3.0.0" and config["evaluation_schema"] == "hackathon-judge-scorecard-v1"
    if "create_event" not in record["transactions"]:
        if not record.get("funding_transaction_hash"):
            funding = client.fund_account(owner.address, PRIZE)
            record["funding_transaction_hash"] = "0x" + bytes(funding).hex()
            save(record)
        client.wait_for_transaction_receipt(record["funding_transaction_hash"], status=TransactionStatus.FINALIZED,
                                            interval=5000, retries=120)
        transact(record, clients, "deposit_prize", "organizer", "deposit", [], PRIZE)
        record["submission_deadline_unix"] = int(time.time()) + 900
        save(record)
    transact(record, clients, "create_event", "organizer", "create_hackathon", [EVENT_NAME, "Auditable judging milestone", RULES,
             json.dumps(CRITERIA), record["submission_deadline_unix"], 3, 60, 300, PRIZE])
    events = read(client, address, "list_hackathons", [0, 25])["items"]
    matching = [event for event in events if event["name"] == EVENT_NAME and event["organizer"].lower() == owner.address.lower()]
    if len(matching) != 1:
        raise RuntimeError("Demo event must resolve uniquely")
    event = matching[0]["id"]
    record["hackathon_id"] = event
    if phase == "prepare":
        record["original_challenges"] = {role: proof(client, address, event, accounts[role].address, filename)
                                         for role, filename in (("control", "control.txt"), ("appeal", "entrant.txt"))}
        save(record)
        print(json.dumps({"phase": "publish_original_proofs", "contract": address, "hackathon_id": event,
                          "wallets": record["wallets"], "challenges": record["original_challenges"]}), flush=True)
        return
    if "submit_control" not in record["transactions"]:
        transact(record, clients, "reject_wrong_wallet", "appeal", "submit_project", [event, "Wrong wallet attempt", EVIDENCE_BASE + "control.txt",
                 "A negative test attempting to replay another entrant's evidence package."], expected_error="missing exact wallet and event provenance challenge")
        assert read(client, address, "get_hackathon", [event])["submission_count"] == "0"
        record["wrong_wallet_submission_count_after"] = "0"
        save(record)
    transact(record, clients, "submit_control", "control", "submit_project", [event, "Documented Control Fixture", EVIDENCE_BASE + "control.txt",
             "A controlled release fixture with complete public identifiers and a concise reviewer journey, but no executable verification commands."])
    transact(record, clients, "submit_entrant", "appeal", "submit_project", [event, "Score Appeal Fixture", EVIDENCE_BASE + "entrant.txt",
             "A controlled release fixture demonstrating an eligible entry with incomplete reproducibility evidence and a criterion-specific appeal."])
    entry = read(client, address, "get_submission", [event, 1])
    if phase == "submit":
        record["appeal_challenge"] = proof(client, address, event, accounts["appeal"].address, "appeal.txt", entry["evidence_package_digest"])
        record["challenge_view_verified"] = True
        save(record)
        print(json.dumps({"phase": "publish_appeal_proof", "challenge": record["appeal_challenge"]}), flush=True)
        return
    baseline._wait_until(record["submission_deadline_unix"])
    for index in range(2):
        transact(record, clients, f"judge_{index}", "organizer", "evaluate_submission", [event, index])
    if not record.get("initial_histories"):
        record["initial_histories"] = [read(client, address, "get_scorecard_history", [event, index]) for index in range(2)]
        save(record)
    assert all(history["effective_eligibility"] == "ELIGIBLE" for history in record["initial_histories"])
    if "appeal_score" not in record["transactions"]:
        transact(record, clients, "reject_premature_settlement", "organizer", "finalize_hackathon", [event],
                 expected_error="an appeal is pending or its window is still open")
        assert read(client, address, "get_hackathon", [event])["prize_released"] is False
        record["premature_settlement_prize_released"] = False
        save(record)
    transact(record, clients, "appeal_score", "appeal", "appeal_submission", [event, 1, APPEAL_STATEMENT, EVIDENCE_BASE + "appeal.txt", "reproducibility"])
    transact(record, clients, "resolve_score_appeal", "organizer", "resolve_appeal", [event, 1])
    current = read(client, address, "get_scorecard_history", [event, 1])
    before = record["initial_histories"][1]
    assert current["original"] == before["original"] and current["original_digest"] == before["original_digest"]
    assert current["current"]["parent_scorecard_digest"] == current["original_digest"]
    for original, revised in zip(before["original"]["decision"]["criteria"], current["current"]["decision"]["criteria"]):
        if original["id"] != "reproducibility":
            assert revised == original
    deadline = int(read(client, address, "get_hackathon", [event])["common_appeal_deadline_unix"])
    baseline._wait_until(deadline)
    transact(record, clients, "finalize_event", "organizer", "finalize_hackathon", [event])
    result = read(client, address, "get_hackathon", [event])
    assert result["status"] == "FINALIZED" and result["prize_released"] is True
    winner_role = next(role for role, account in accounts.items() if account.address.lower() == result["winner"].lower())
    transact(record, clients, "withdraw_prize", winner_role, "withdraw_credit", [])
    assert read(client, address, "get_credit", [result["winner"]]) == "0"
    histories = [read(client, address, "get_scorecard_history", [event, index]) for index in range(2)]
    record["final_histories"] = histories
    record["assertions"] = {"status": result["status"], "winner": result["winner"], "winner_project": result["winner_project"],
                            "prize_atto": result["prize_atto"], "prize_withdrawn": True,
                            "eligible_score_appeal_demonstrated": True, "original_history_preserved": True,
                            "untargeted_criteria_unchanged": True, "common_appeal_deadline_unix": str(deadline),
                            "original_rank": histories[1]["original_rank"], "final_rank": histories[1]["current_rank"],
                            "original_total_bps": str(before["original"]["decision"]["score_total_bps"]),
                            "final_total_bps": histories[1]["effective_total_bps"],
                            "rejected_premature_settlement": record["transactions"]["reject_premature_settlement"]["expected_rejection_verified"]}
    record["completed_at"] = baseline._timestamp()
    save(record)
    print(json.dumps({"phase": "complete", **record["assertions"]}), flush=True)


if __name__ == "__main__":
    main()
