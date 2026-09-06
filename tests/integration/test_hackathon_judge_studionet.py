"""Read back the real v2.3 acceptance run without mocking web/LLM responses.

Run scripts/seed_hackathon_judge_demo.py in its documented two phases first.
This test verifies final receipts, deployed source, evidence and settlement.
"""
import base64
import hashlib
import json
from pathlib import Path

import pytest
from eth_account import Account
from genlayer_py import create_client
from genlayer_py.assertions import tx_execution_succeeded
from genlayer_py.chains import studionet
from genlayer_py.types import TransactionStatus
from scripts.hackathon_judge_rpc import read_studionet_view

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.slow
def test_hackathon_judge_live_provenance_receipts_and_settlement():
    deployment = json.loads((ROOT / "deployments/hackathon_judge_studionet.json").read_text())
    demo = json.loads((ROOT / "deployments/hackathon_judge_demo.json").read_text(encoding="utf-8"))
    assert deployment["version"] == demo["contract_version"] == "2.3.0"
    assert demo["contract"].lower() == deployment["address"].lower()
    assert demo.get("completed_at"), "Finish the live provenance demo before checking release acceptance"
    # The SDK requires a sender context even for views. This account signs no transactions.
    client = create_client(chain=studionet, account=Account.create())
    address = deployment["address"]

    def read(method, args):
        return read_studionet_view(client, address, method, args)

    def receipt(tx):
        return client.wait_for_transaction_receipt(tx, status=TransactionStatus.FINALIZED,
                                                   interval=5000, retries=20, full_transaction=True)

    assert tx_execution_succeeded(receipt(deployment["transaction_hash"]))
    code = client.provider.make_request(method="gen_getContractCode", params=[address])["result"]
    source = base64.b64decode(code).decode("utf-8").replace("\r\n", "\n")
    assert hashlib.sha256(source.encode()).hexdigest() == deployment["source_sha256"]
    assert source == (ROOT / "contracts/hackathon_judge.py").read_text(encoding="utf-8").replace("\r\n", "\n")
    assert read("get_config", [])["settlement_policy"] == "REQUIRE_VERIFIED_ORIGINAL_AND_APPEAL_PACKAGES"

    rejected = demo["wrong_wallet_rejection"]
    rejected_receipt = receipt(rejected["transaction_hash"])
    assert not tx_execution_succeeded(rejected_receipt)
    assert rejected["expected_error"] in json.dumps(rejected_receipt, default=str)
    for step, tx in demo["transactions"].items():
        assert tx_execution_succeeded(receipt(tx["transaction_hash"])), step

    event_id = demo["hackathon_id"]
    event = read("get_hackathon", [event_id])
    assert event["status"] == "FINALIZED" and event["prize_released"] is True
    assert event["winner"].lower() == demo["wallets"]["entrant_one"].lower()
    assert read("get_credit", [event["winner"]]) == "0"
    entries = read("list_submissions", [event_id, 0, 25])["items"]
    assert len(entries) == 2
    for entry in entries:
        evidence = read("get_submission_evidence", [event_id, int(entry["index"])])
        for prefix in ("", "appeal_"):
            if prefix and not evidence["appeal_evidence_snapshot"]:
                continue
            record_text = evidence[prefix + "provenance_record"]
            record = json.loads(record_text)
            snapshot = evidence[prefix + "evidence_snapshot"]
            digest = hashlib.sha256(snapshot.encode()).hexdigest()
            assert digest == evidence[prefix + "evidence_digest"]
            assert record["entrant"] == entry["entrant"].lower()
            assert record["contract"] == address.lower() and record["hackathon_id"] == event_id
            assert record["challenge"] in snapshot.splitlines()
            assert record["parent_package_digest"] == (entry["evidence_package_digest"] if prefix else "")
            generated = read("get_evidence_challenge", [event_id, entry["entrant"], record["submitted_url"], record["parent_package_digest"]])
            assert generated == {"challenge": record["challenge"]}
            context = entry["appeal_statement"] if prefix else entry["summary"]
            assert record["context_digest"] == hashlib.sha256(context.encode()).hexdigest()
            package = json.dumps({"provenance": record_text, "snapshot_digest": digest},
                                 sort_keys=True, separators=(",", ":"), ensure_ascii=False)
            key = "appeal_package_digest" if prefix else "evidence_package_digest"
            assert hashlib.sha256(package.encode()).hexdigest() == entry[key]
    assert entries[0]["score_band"] == "100"
    assert entries[1]["score_band"] == "80" and entries[1]["appeal_resolved"] is True
