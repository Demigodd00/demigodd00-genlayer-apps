"""Read-only verification of actual StudioNet state and finalized receipts."""
import hashlib
import json
import sys
from pathlib import Path
from eth_account import Account
from genlayer_py import create_client
from genlayer_py.assertions import tx_execution_succeeded
from genlayer_py.chains import studionet
from genlayer_py.types import TransactionStatus
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"scripts"))
from hackathon_judge_rpc import read_studionet_view
from deploy_hackathon_judge import _verify_source

def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()).hexdigest()

def test_live_sponsorproof_release():
    record=json.loads((ROOT/"deployments/sponsorproof_demo.json").read_text())
    assert record.get("completed_at"), "Run the explicit live seeder first; this test never creates transactions"
    client=create_client(chain=studionet,account=Account.create())
    address=record["contract"]
    _verify_source(client,address,(ROOT/"contracts/sponsorproof.py").read_text(encoding="utf-8"))
    state=read_studionet_view(client,address,"get_campaign",[record["campaign_id"]])
    assert state==record["final"] and state["status"]=="SETTLED"
    assert len(state["history"])==2 and state["history"][0]==record["initial"]["history"][0]
    previous=""
    for entry in state["history"]:
        payload={k:v for k,v in entry.items() if k!="digest"}
        assert digest(payload)==entry["digest"] and entry["parent_digest"]==previous
        previous=entry["digest"]
        for row in entry["decision"]["commitments"]:
            assert row["outcome"] in ("FULFILLED","PARTIAL","NOT_FULFILLED","INCONCLUSIVE")
            for ref in row["refs"]:
                assert ref["excerpt"]==state["evidence"][row["id"]]["text"].splitlines()[ref["line"]-1]
    for item in state["evidence"].values():
        assert hashlib.sha256(item["text"].encode()).hexdigest()==item["sha256"]
        assert digest({k:v for k,v in item.items() if k!="package_digest"})==item["package_digest"]
        assert item["challenge"] in item["text"].splitlines()
        assert item["terms_digest"]==state["terms_digest"] and item["organizer"]==state["organizer"]
    budget=int(state["budget_atto"]); earned=0; allocated=0
    for i,(terms,verdict) in enumerate(zip(state["commitments"],state["history"][-1]["decision"]["commitments"])):
        assert terms["id"]==verdict["id"]
        pot=budget-allocated if i==len(state["commitments"])-1 else budget*terms["weight"]//100
        allocated+=pot
        assert verdict["outcome"]!="INCONCLUSIVE"
        earned+=pot if verdict["outcome"]=="FULFILLED" else pot//2 if verdict["outcome"]=="PARTIAL" else 0
    assert earned==int(state["organizer_allocation"])
    assert earned+int(state["sponsor_allocation"])+int(state["held_atto"])==budget
    for step,tx in record["transactions"].items():
        receipt=client.wait_for_transaction_receipt(tx["hash"],status=TransactionStatus.FINALIZED,retries=2,interval=5000,full_transaction=True)
        if step in record.get("observed_deviations",{}):
            assert step=="appeal_sponsor" and tx["expected_outcome_verified"] is False
            assert not tx_execution_succeeded(receipt)
            assert int(receipt["created_timestamp"])>=state["review_deadline"]
            assert "one appeal statement per party within the shared window" in json.dumps(receipt,default=str)
            assert state["sponsor"] not in state["appeals"] and state["organizer"] in state["appeals"]
        elif tx["expected_error"]:
            assert not tx_execution_succeeded(receipt) and tx["expected_error"] in json.dumps(receipt,default=str),step
        else:
            assert tx_execution_succeeded(receipt),step
    for role in ("organizer","sponsor"):
        assert read_studionet_view(client,address,"get_credit",[record["wallets"][role]])=="0"
